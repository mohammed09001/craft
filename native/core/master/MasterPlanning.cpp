#include "master/MasterPlanning.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>

#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "master/TriangleIntersection.h"
#include "mold/Registration.h"  // jsNumberToString

namespace craft {

namespace {

// --- stable JSON.stringify (insertion order, like hashStableValues) --------------------------
std::string num(double v) { return std::isfinite(v) ? jsNumberToString(v) : "null"; }

std::string quote(const std::string& s) {
  std::string out = "\"";
  for (char c : s) {
    if (c == '"') out += "\\\"";
    else if (c == '\\') out += "\\\\";
    else if (c == '\n') out += "\\n";
    else out += c;
  }
  return out + "\"";
}

std::string boundsJson(const Bounds3& b) {
  return "{\"min\":{\"x\":" + num(b.min.x) + ",\"y\":" + num(b.min.y) + ",\"z\":" + num(b.min.z) + "},\"max\":{\"x\":" +
         num(b.max.x) + ",\"y\":" + num(b.max.y) + ",\"z\":" + num(b.max.z) + "}}";
}

std::string transformJson(const std::array<double, 16>& t) {
  std::string out = "[";
  for (int i = 0; i < 16; ++i) out += (i ? "," : "") + num(t[i]);
  return out + "]";
}

std::string hashStable(const std::string& json) { return finishHash(hashText(json)); }

std::string volumeJson(const std::optional<Point3>& v) {
  if (!v) return "null";
  return "{\"x\":" + num(v->x) + ",\"y\":" + num(v->y) + ",\"z\":" + num(v->z) + "}";
}

std::string preferencesJson(const MasterPlanningPreferences& p) {
  return std::string("{\"preferredMaximumWorkingMoldPieces\":") +
         (p.preferredMaximumWorkingMoldPieces ? num(*p.preferredMaximumWorkingMoldPieces) : "null") + "}";
}

bool transformIsIdentity(const std::array<double, 16>& t) {
  for (int i = 0; i < 16; ++i) {
    const double expected = (i % 5 == 0) ? 1.0 : 0.0;
    if (std::fabs(t[i] - expected) > 1e-12) return false;
  }
  return true;
}

constexpr double kRadToDeg = 180.0 / 3.14159265358979323846;

double dotv(const Point3& a, const Point3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

}  // namespace

// --- seed ---------------------------------------------------------------------------------------

Bounds3 worldBoundsFromLocal(const Bounds3& l, const std::array<double, 16>& t) {
  double minX = INFINITY, minY = INFINITY, minZ = INFINITY, maxX = -INFINITY, maxY = -INFINITY, maxZ = -INFINITY;
  for (double cx : {l.min.x, l.max.x})
    for (double cy : {l.min.y, l.max.y})
      for (double cz : {l.min.z, l.max.z}) {
        const double x = t[0] * cx + t[4] * cy + t[8] * cz + t[12];
        const double y = t[1] * cx + t[5] * cy + t[9] * cz + t[13];
        const double z = t[2] * cx + t[6] * cy + t[10] * cz + t[14];
        minX = std::min(minX, x); minY = std::min(minY, y); minZ = std::min(minZ, z);
        maxX = std::max(maxX, x); maxY = std::max(maxY, y); maxZ = std::max(maxZ, z);
      }
  return {{minX, minY, minZ}, {maxX, maxY, maxZ}};
}

std::string masterSourceGeometryVersion(const std::string& geometryVersion, const Bounds3& localBounds,
                                        const std::array<double, 16>& transform) {
  const Bounds3 bounds = worldBoundsFromLocal(localBounds, transform);
  return "master-seed-mesh:" +
         hashStable("{\"local\":" + quote(geometryVersion) + ",\"transform\":" + transformJson(transform) +
                    ",\"bounds\":" + boundsJson(bounds) + "}");
}

MasterSeedSnapshot buildMasterMoldSeedSnapshot(const MasterSeedInput& input) {
  const MasterSeedGeometryInput& g = input.sourcePartGeometry;
  if (g.positions.empty() || g.indices.empty()) {
    throw std::invalid_argument("Master Mold requires imported part geometry; none was captured.");
  }
  if (g.positions.size() % 3 != 0 || g.indices.size() % 3 != 0) {
    throw std::invalid_argument("Master Mold source geometry payload is malformed.");
  }
  for (double v : g.positions) {
    if (!std::isfinite(v)) throw std::invalid_argument("Master Mold source geometry contains non-finite values.");
  }
  for (double v : g.transform) {
    if (!std::isfinite(v)) throw std::invalid_argument("Master Mold source geometry contains non-finite values.");
  }

  MasterSeedSnapshot s;
  s.sourceMesh.positions.reserve(g.positions.size());
  for (double v : g.positions) s.sourceMesh.positions.push_back(static_cast<float>(v));
  s.sourceMesh.indices = g.indices;
  const Bounds3 bounds = worldBoundsFromLocal(g.localBounds, g.transform);
  const std::string version = masterSourceGeometryVersion(g.geometryVersion, g.localBounds, g.transform);
  s.seedId = hashStable("{\"schemaVersion\":1,\"sourceModelId\":" + quote(g.modelId) +
                        ",\"sourceGeometryVersion\":" + quote(version) +
                        ",\"printerBuildVolume\":" + volumeJson(input.printerBuildVolume) +
                        ",\"processProfileId\":" + quote(input.processProfile.profileId) +
                        ",\"userPreferences\":" + preferencesJson(input.userPreferences) +
                        ",\"sourceProjectRevision\":" + quote(input.projectRevision) + "}");
  s.sourceModelId = g.modelId;
  s.sourceGeometryVersion = version;
  s.sourceMesh.modelId = g.modelId;
  s.sourceMesh.bounds = bounds;
  s.sourceMesh.geometryVersion = version;
  s.sourceTransform = g.transform;
  s.sourceBounds = bounds;
  s.printerBuildVolume = input.printerBuildVolume;
  s.processProfile = input.processProfile;
  s.userPreferences = input.userPreferences;
  s.sourceProjectRevision = input.projectRevision;
  return s;
}

MasterSeedSnapshot worldMeshFromSnapshot(const MasterSeedSnapshot& snapshot) {
  if (transformIsIdentity(snapshot.sourceTransform)) return snapshot;
  MasterSeedSnapshot world = snapshot;
  const auto& t = snapshot.sourceTransform;
  const std::vector<float>& in = snapshot.sourceMesh.positions;
  std::vector<float>& out = world.sourceMesh.positions;
  for (std::size_t i = 0; i + 2 < in.size(); i += 3) {
    const double x = in[i], y = in[i + 1], z = in[i + 2];
    out[i] = static_cast<float>(t[0] * x + t[4] * y + t[8] * z + t[12]);
    out[i + 1] = static_cast<float>(t[1] * x + t[5] * y + t[9] * z + t[13]);
    out[i + 2] = static_cast<float>(t[2] * x + t[6] * y + t[10] * z + t[14]);
  }
  return world;
}

std::string masterSeedStalenessIdentity(const std::string& sourceGeometryVersion,
                                        const std::optional<Point3>& printerBuildVolume,
                                        const MasterCastingProcessProfile& profile,
                                        const MasterPlanningPreferences& preferences) {
  return hashStable("{\"sourceGeometryVersion\":" + quote(sourceGeometryVersion) +
                    ",\"printerBuildVolume\":" + volumeJson(printerBuildVolume) +
                    ",\"processProfileId\":" + quote(profile.profileId) +
                    ",\"userPreferences\":" + preferencesJson(preferences) + "}");
}

// --- preflight ----------------------------------------------------------------------------------

namespace {
struct CellKey {
  std::int64_t x, y, z;
  bool operator==(const CellKey&) const = default;
};
struct CellKeyHash {
  std::size_t operator()(const CellKey& k) const {
    std::uint64_t h = static_cast<std::uint64_t>(k.x) * 0x9E3779B185EBCA87ull;
    h ^= static_cast<std::uint64_t>(k.y) + 0x9E3779B97F4A7C15ull + (h << 6) + (h >> 2);
    h ^= static_cast<std::uint64_t>(k.z) + 0x9E3779B97F4A7C15ull + (h << 6) + (h >> 2);
    return static_cast<std::size_t>(h);
  }
};
}  // namespace

std::vector<std::int32_t> weldedVertexIds(const std::vector<float>& positions, std::size_t vertexCount, double toleranceMm) {
  const double cellSize = std::max(toleranceMm, 1e-9);
  const double toleranceSq = toleranceMm * toleranceMm;
  std::unordered_map<CellKey, std::vector<std::size_t>, CellKeyHash> buckets;
  std::vector<std::int32_t> weldId(vertexCount, -1);
  std::int32_t nextId = 0;
  const auto cellIndexOf = [&](double c) { return static_cast<std::int64_t>(std::floor(c / cellSize)); };

  for (std::size_t vertex = 0; vertex < vertexCount; ++vertex) {
    const double x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
    const std::int64_t cx = cellIndexOf(x), cy = cellIndexOf(y), cz = cellIndexOf(z);
    std::int32_t matched = -1;
    for (int dx = -1; dx <= 1 && matched == -1; ++dx)
      for (int dy = -1; dy <= 1 && matched == -1; ++dy)
        for (int dz = -1; dz <= 1 && matched == -1; ++dz) {
          const auto it = buckets.find({cx + dx, cy + dy, cz + dz});
          if (it == buckets.end()) continue;
          for (std::size_t other : it->second) {
            const double ox = positions[other * 3] - x, oy = positions[other * 3 + 1] - y,
                         oz = positions[other * 3 + 2] - z;
            if (ox * ox + oy * oy + oz * oz <= toleranceSq) {
              matched = weldId[other];
              break;
            }
          }
        }
    weldId[vertex] = matched == -1 ? nextId++ : matched;
    buckets[{cx, cy, cz}].push_back(vertex);
  }
  return weldId;
}

double weldToleranceMmFor(const Bounds3& bounds) {
  try {
    return buildGeometryTolerancePolicy(bounds, 0).containmentToleranceMm;
  } catch (const std::exception&) {
    return 1e-4;
  }
}

Bounds3 boundsOfPositions(const std::vector<float>& positions, std::size_t vertexCount) {
  Bounds3 b = emptyBounds();
  for (std::size_t v = 0; v < vertexCount; ++v) {
    const double x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    if (x < b.min.x) b.min.x = x;
    if (y < b.min.y) b.min.y = y;
    if (z < b.min.z) b.min.z = z;
    if (x > b.max.x) b.max.x = x;
    if (y > b.max.y) b.max.y = y;
    if (z > b.max.z) b.max.z = z;
  }
  return b;
}

namespace {
struct UnionFind {
  std::vector<std::int32_t> parent;
  explicit UnionFind(std::size_t n) : parent(n) {
    for (std::size_t i = 0; i < n; ++i) parent[i] = static_cast<std::int32_t>(i);
  }
  std::int32_t find(std::int32_t x) {
    std::int32_t root = x;
    while (parent[root] != root) root = parent[root];
    while (parent[x] != root) {
      const std::int32_t next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  }
  void unite(std::int32_t a, std::int32_t b) {
    const auto ra = find(a), rb = find(b);
    if (ra != rb) parent[ra] = rb;
  }
};

struct EdgeEntry {
  int count = 0;
  std::vector<std::pair<std::int32_t, std::int32_t>> directed;
  std::vector<int> triangles;
};

std::string toFixed4(double v) {
  char buf[64];
  std::snprintf(buf, sizeof buf, "%.4f", v);
  return buf;
}
}  // namespace

MeshPreflightResult runMeshPreflight(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices) {
  MeshPreflightResult r;
  const std::size_t triangleCount = indices.size() / 3;
  const std::size_t vertexCount = positions.size() / 3;
  r.triangleCount = static_cast<int>(triangleCount);
  r.vertexCount = static_cast<int>(vertexCount);

  if (positions.size() % 3 != 0 || indices.size() % 3 != 0 || triangleCount == 0 || vertexCount == 0) {
    r.status = "invalid-for-master-mold";
    r.issues.push_back({"non_finite_geometry", "error",
                        "source geometry is empty or malformed (positions/indices not triangle-aligned).", 0});
    return r;
  }

  int nonFinite = 0;
  for (float v : positions) if (!std::isfinite(v)) ++nonFinite;
  for (std::uint32_t v : indices) if (v >= vertexCount) ++nonFinite;
  if (nonFinite > 0) {
    r.issues.push_back({"non_finite_geometry", "error",
                        std::to_string(nonFinite) + " non-finite coordinate(s) or out-of-range vertex index(es).", nonFinite});
    r.status = "invalid-for-master-mold";
    return r;
  }

  const Bounds3 bounds = boundsOfPositions(positions, vertexCount);
  const std::vector<std::int32_t> weldId = weldedVertexIds(positions, vertexCount, weldToleranceMmFor(bounds));

  std::vector<double> areas(triangleCount);
  double totalArea = 0, signedVolume6 = 0;
  std::unordered_map<std::uint64_t, EdgeEntry> edges;
  std::unordered_map<std::string, int> faceKeys;

  for (std::size_t t = 0; t < triangleCount; ++t) {
    const std::uint32_t a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    const double ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const double bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const double cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const double abx = bx - ax, aby = by - ay, abz = bz - az;
    const double acx = cx - ax, acy = cy - ay, acz = cz - az;
    const double nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const double area = jsHypot3(nx, ny, nz) / 2;
    areas[t] = area;
    totalArea += area;
    signedVolume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);

    const std::int32_t wa = weldId[a], wb = weldId[b], wc = weldId[c];
    std::array<std::int32_t, 3> sorted{wa, wb, wc};
    std::sort(sorted.begin(), sorted.end());
    ++faceKeys[std::to_string(sorted[0]) + ":" + std::to_string(sorted[1]) + ":" + std::to_string(sorted[2])];

    const std::pair<std::int32_t, std::int32_t> corners[3] = {{wa, wb}, {wb, wc}, {wc, wa}};
    for (const auto& [u, v] : corners) {
      if (u == v) continue;
      const std::uint64_t lo = static_cast<std::uint32_t>(std::min(u, v)), hi = static_cast<std::uint32_t>(std::max(u, v));
      EdgeEntry& e = edges[(lo << 32) | hi];
      ++e.count;
      e.directed.emplace_back(u, v);
      e.triangles.push_back(static_cast<int>(t));
    }
  }

  const double meanArea = totalArea / static_cast<double>(triangleCount);
  const double degenerateThreshold = meanArea * 1e-6;
  int degenerate = 0;
  for (double a : areas) if (a <= degenerateThreshold) ++degenerate;
  if (degenerate > 0) {
    r.issues.push_back({"degenerate_triangle",
                        static_cast<double>(degenerate) / static_cast<double>(triangleCount) > 0.05 ? "error" : "warning",
                        std::to_string(degenerate) + " degenerate/zero-area triangle(s) out of " + std::to_string(triangleCount) + ".",
                        degenerate});
  }

  int duplicates = 0;
  for (const auto& [key, count] : faceKeys) if (count > 1) duplicates += count - 1;
  if (duplicates > 0) {
    r.issues.push_back({"duplicate_face", "warning",
                        std::to_string(duplicates) + " duplicate/overlapping face(s) share the same three vertices as another face.",
                        duplicates});
  }

  int open = 0, nonManifold = 0, inconsistent = 0;
  UnionFind uf(triangleCount);
  for (const auto& [key, e] : edges) {
    if (e.count == 1) { ++open; continue; }
    if (e.count > 2) {
      ++nonManifold;
      for (std::size_t i = 1; i < e.triangles.size(); ++i) uf.unite(e.triangles[0], e.triangles[i]);
      continue;
    }
    uf.unite(e.triangles[0], e.triangles[1]);
    if (e.directed[0] == e.directed[1]) ++inconsistent;
  }
  if (open > 0) {
    r.issues.push_back({"open_boundary_edge", "error",
                        std::to_string(open) + " boundary edge(s) used by only one triangle: the surface is not closed.", open});
  }
  if (nonManifold > 0) {
    r.issues.push_back({"non_manifold_edge", "error",
                        std::to_string(nonManifold) + " non-manifold edge(s) shared by more than two triangles.", nonManifold});
  }
  if (inconsistent > 0) {
    r.issues.push_back({"inconsistent_winding", "error",
                        std::to_string(inconsistent) + " edge(s) whose two triangles share the same winding direction (a flipped face).",
                        inconsistent});
  }

  std::unordered_set<std::int32_t> roots;
  for (std::size_t t = 0; t < triangleCount; ++t) roots.insert(uf.find(static_cast<std::int32_t>(t)));
  r.componentCount = static_cast<int>(roots.size());
  if (r.componentCount > 1) {
    r.issues.push_back({"disconnected_component", "warning",
                        std::to_string(r.componentCount) + " disconnected surface components; Master Mold plans one continuous solid.",
                        r.componentCount});
  }

  r.volumeMm3 = signedVolume6 / 6;
  const double scale = std::pow(std::max(1e-6, std::cbrt(totalArea)), 3);
  if (!std::isfinite(r.volumeMm3) || r.volumeMm3 <= scale * 1e-9) {
    r.issues.push_back({"invalid_volume", "error",
                        "computed enclosed volume (" + toFixed4(r.volumeMm3) +
                            " mm^3) is not a valid positive solid -- the mesh may be open, inverted, or degenerate.",
                        1});
  }

  // Bounded exact self-intersection count (reference: BVH self-cast, skipping pairs that share a welded vertex).
  if (triangleCount <= 20000) {
    r.selfIntersectionChecked = true;
    struct Box { double lo[3], hi[3]; };
    std::vector<Box> boxes(triangleCount);
    std::vector<IntersectTriangle> tris(triangleCount);
    for (std::size_t t = 0; t < triangleCount; ++t) {
      TriVec v[3];
      for (int c = 0; c < 3; ++c) {
        const std::size_t i = indices[t * 3 + static_cast<std::size_t>(c)];
        v[c] = {positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]};
      }
      tris[t] = {v[0], v[1], v[2]};
      for (int a = 0; a < 3; ++a) {
        const double values[3] = {a == 0 ? v[0].x : a == 1 ? v[0].y : v[0].z, a == 0 ? v[1].x : a == 1 ? v[1].y : v[1].z,
                                  a == 0 ? v[2].x : a == 1 ? v[2].y : v[2].z};
        boxes[t].lo[a] = std::min({values[0], values[1], values[2]}) - 1e-6;
        boxes[t].hi[a] = std::max({values[0], values[1], values[2]}) + 1e-6;
      }
    }
    std::vector<std::size_t> order(triangleCount);
    for (std::size_t t = 0; t < triangleCount; ++t) order[t] = t;
    std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) { return boxes[a].lo[0] < boxes[b].lo[0]; });
    std::vector<bool> offending(triangleCount, false);
    const auto sharesVertex = [&](std::size_t a, std::size_t b) {
      for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j)
          if (weldId[indices[a * 3 + static_cast<std::size_t>(i)]] == weldId[indices[b * 3 + static_cast<std::size_t>(j)]]) return true;
      return false;
    };
    for (std::size_t i = 0; i < order.size(); ++i) {
      const std::size_t a = order[i];
      for (std::size_t j = i + 1; j < order.size() && boxes[order[j]].lo[0] <= boxes[a].hi[0]; ++j) {
        const std::size_t b = order[j];
        if (boxes[b].lo[1] > boxes[a].hi[1] || boxes[a].lo[1] > boxes[b].hi[1] || boxes[b].lo[2] > boxes[a].hi[2] ||
            boxes[a].lo[2] > boxes[b].hi[2])
          continue;
        if (sharesVertex(a, b)) continue;
        if (trianglesIntersect(tris[a], tris[b])) { offending[a] = true; offending[b] = true; }
      }
    }
    const int count = static_cast<int>(std::count(offending.begin(), offending.end(), true));
    if (count > 0) {
      r.issues.push_back({"self_intersection", "error",
                          std::to_string(count) + " triangle(s) intersect non-adjacent geometry elsewhere on the same surface.", count});
    }
  }

  bool hasError = false, hasWarning = false;
  for (const auto& i : r.issues) (i.severity == "error" ? hasError : hasWarning) = true;
  r.status = hasError ? "invalid-for-master-mold" : hasWarning ? "repairable-warning" : "valid";
  return r;
}

// --- planning mesh ------------------------------------------------------------------------------

double jsHypot3(double x, double y, double z) {
  const double values[3] = {std::fabs(x), std::fabs(y), std::fabs(z)};
  double max = 0;
  for (double v : values) {
    if (std::isinf(v)) return INFINITY;
    if (std::isnan(v)) return NAN;
    if (v > max) max = v;
  }
  if (max == 0) return 0;
  double sum = 0, compensation = 0;
  for (double v : values) {
    const double n = v / max;
    const double summand = n * n - compensation;
    const double preliminary = sum + summand;
    compensation = (preliminary - sum) - summand;
    sum = preliminary;
  }
  return std::sqrt(sum) * max;
}

namespace {
struct TriangleGeometry {
  int triangle;
  Point3 centroid, normal;
  double areaMm2;
};

std::vector<TriangleGeometry> triangleGeometryFor(const std::vector<float>& p, const std::vector<std::uint32_t>& idx) {
  std::vector<TriangleGeometry> result;
  const std::size_t count = idx.size() / 3;
  for (std::size_t t = 0; t < count; ++t) {
    const std::size_t i0 = idx[t * 3] * 3ull, i1 = idx[t * 3 + 1] * 3ull, i2 = idx[t * 3 + 2] * 3ull;
    const double ax = p[i0], ay = p[i0 + 1], az = p[i0 + 2];
    const double bx = p[i1], by = p[i1 + 1], bz = p[i1 + 2];
    const double cx = p[i2], cy = p[i2 + 1], cz = p[i2 + 2];
    const double abx = bx - ax, aby = by - ay, abz = bz - az;
    const double acx = cx - ax, acy = cy - ay, acz = cz - az;
    double nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const double length = jsHypot3(nx, ny, nz);
    if (length == 0 || !std::isfinite(length)) continue;
    nx /= length; ny /= length; nz /= length;
    result.push_back({static_cast<int>(t), {(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3}, {nx, ny, nz}, length / 2});
  }
  return result;
}

std::vector<std::vector<int>> adjacencyFromTriangles(const std::vector<std::uint32_t>& idx, const std::vector<std::int32_t>& weldId,
                                                     std::size_t patchCount,
                                                     const std::vector<std::vector<int>>& trianglesOfPatch) {
  std::vector<std::vector<int>> adjacency(patchCount);
  if (patchCount == 0) return adjacency;
  // vertex -> patches, in first-seen order like a JS Map of Sets.
  std::unordered_map<std::int32_t, std::size_t> bucketOf;
  std::vector<std::vector<int>> buckets;
  std::vector<std::unordered_set<int>> bucketSets;
  for (std::size_t patch = 0; patch < patchCount; ++patch) {
    for (int triangle : trianglesOfPatch[patch]) {
      for (int corner = 0; corner < 3; ++corner) {
        const std::int32_t vertex = weldId[idx[static_cast<std::size_t>(triangle) * 3 + corner]];
        auto [it, inserted] = bucketOf.try_emplace(vertex, buckets.size());
        if (inserted) { buckets.emplace_back(); bucketSets.emplace_back(); }
        if (bucketSets[it->second].insert(static_cast<int>(patch)).second) buckets[it->second].push_back(static_cast<int>(patch));
      }
    }
  }
  std::vector<std::unordered_set<int>> seen(patchCount);
  for (const auto& members : buckets) {
    if (members.size() < 2) continue;
    for (std::size_t a = 0; a < members.size(); ++a)
      for (std::size_t b = a + 1; b < members.size(); ++b) {
        const int pa = members[a], pb = members[b];
        if (pa == pb) continue;
        if (seen[pa].insert(pb).second) adjacency[pa].push_back(pb);
        if (seen[pb].insert(pa).second) adjacency[pb].push_back(pa);
      }
  }
  return adjacency;
}

bool centroidLexLess(const Point3& a, const Point3& b) {
  if (a.x != b.x) return a.x < b.x;
  if (a.y != b.y) return a.y < b.y;
  return a.z < b.z;
}

int normalFaceBucket(const Point3& n) {
  const double ax = std::fabs(n.x), ay = std::fabs(n.y), az = std::fabs(n.z);
  if (ax >= ay && ax >= az) return n.x >= 0 ? 0 : 1;
  if (ay >= ax && ay >= az) return n.y >= 0 ? 2 : 3;
  return n.z >= 0 ? 4 : 5;
}

/// ICU collation of "cx:cy:cz:face" cluster keys: ':' sorts before digits.
bool clusterKeyLess(const std::string& a, const std::string& b) {
  const auto rank = [](char c) { return c == ':' ? 0 : c - '0' + 1; };
  const std::size_t n = std::min(a.size(), b.size());
  for (std::size_t i = 0; i < n; ++i) {
    if (a[i] != b[i]) return rank(a[i]) < rank(b[i]);
  }
  return a.size() < b.size();
}

struct Cluster {
  std::string key;
  double areaSum = 0;
  int representativeTriangle = 0;
  double representativeArea = -1;
  Point3 representativeCentroid, representativeNormal;
  std::vector<int> members;
};
}  // namespace

PlanningMesh buildPlanningMesh(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices,
                               const Bounds3& bounds, const std::string& sourceGeometryVersion) {
  const std::vector<TriangleGeometry> triangles = triangleGeometryFor(positions, indices);
  const bool fullResolution = static_cast<int>(triangles.size()) <= kMasterPlannerLimits.fullResolutionPlanningTriangleBudget;
  const std::size_t vertexCount = positions.size() / 3;
  const std::vector<std::int32_t> weldId =
      weldedVertexIds(positions, vertexCount, weldToleranceMmFor(boundsOfPositions(positions, vertexCount)));

  PlanningMesh mesh;
  std::vector<std::vector<int>> trianglesOfPatch;
  if (fullResolution) {
    for (std::size_t i = 0; i < triangles.size(); ++i) {
      const TriangleGeometry& t = triangles[i];
      mesh.patches.push_back({static_cast<int>(i), t.centroid, t.normal, t.areaMm2, t.triangle});
      trianglesOfPatch.push_back({t.triangle});
    }
  } else {
    const double sizeX = std::max(bounds.max.x - bounds.min.x, 1e-9);
    const double sizeY = std::max(bounds.max.y - bounds.min.y, 1e-9);
    const double sizeZ = std::max(bounds.max.z - bounds.min.z, 1e-9);
    const int resolution = std::max(1, static_cast<int>(std::floor(std::cbrt(kMasterPlannerLimits.maxPlanningPatches / 6.0))));
    const double cellX = sizeX / resolution, cellY = sizeY / resolution, cellZ = sizeZ / resolution;
    std::unordered_map<std::string, std::size_t> index;
    std::vector<Cluster> clusters;
    const auto cellOf = [&](double c, double lo, double cell) {
      return std::min(resolution - 1, std::max(0, static_cast<int>(std::floor((c - lo) / cell))));
    };
    for (const TriangleGeometry& t : triangles) {
      const int cx = cellOf(t.centroid.x, bounds.min.x, cellX);
      const int cy = cellOf(t.centroid.y, bounds.min.y, cellY);
      const int cz = cellOf(t.centroid.z, bounds.min.z, cellZ);
      const std::string key = std::to_string(cx) + ":" + std::to_string(cy) + ":" + std::to_string(cz) + ":" +
                              std::to_string(normalFaceBucket(t.normal));
      auto [it, inserted] = index.try_emplace(key, clusters.size());
      if (inserted) {
        Cluster c;
        c.key = key;
        c.representativeTriangle = t.triangle;
        c.representativeCentroid = t.centroid;
        c.representativeNormal = t.normal;
        clusters.push_back(std::move(c));
      }
      Cluster& cluster = clusters[it->second];
      cluster.areaSum += t.areaMm2;
      cluster.members.push_back(t.triangle);
      if (t.areaMm2 > cluster.representativeArea ||
          (t.areaMm2 == cluster.representativeArea && centroidLexLess(t.centroid, cluster.representativeCentroid))) {
        cluster.representativeArea = t.areaMm2;
        cluster.representativeTriangle = t.triangle;
        cluster.representativeCentroid = t.centroid;
        cluster.representativeNormal = t.normal;
      }
    }
    std::stable_sort(clusters.begin(), clusters.end(), [](const Cluster& a, const Cluster& b) { return clusterKeyLess(a.key, b.key); });
    for (std::size_t i = 0; i < clusters.size(); ++i) {
      const Cluster& c = clusters[i];
      mesh.patches.push_back({static_cast<int>(i), c.representativeCentroid, c.representativeNormal, c.areaSum, c.representativeTriangle});
      trianglesOfPatch.push_back(c.members);
    }
  }
  mesh.adjacency = adjacencyFromTriangles(indices, weldId, mesh.patches.size(), trianglesOfPatch);
  for (const PlanningPatch& p : mesh.patches) mesh.totalAreaMm2 += p.areaMm2;
  mesh.bounds = bounds;
  mesh.sourceGeometryVersion = sourceGeometryVersion;
  mesh.vertexCount = static_cast<int>(vertexCount);
  mesh.triangleCount = static_cast<int>(indices.size() / 3);
  return mesh;
}

// --- candidate directions -----------------------------------------------------------------------

double angleBetweenDeg(const Point3& a, const Point3& b) {
  const double cosine = std::min(1.0, std::max(-1.0, dotv(a, b)));
  return std::acos(cosine) * kRadToDeg;
}

std::optional<Point3> normalizeDirection(const Point3& v) {
  const double length = jsHypot3(v.x, v.y, v.z);
  if (length < 1e-9 || !std::isfinite(length)) return std::nullopt;
  return Point3{v.x / length, v.y / length, v.z / length};
}

namespace {
Point3 canonicalDirection(const Point3& v) {
  const double ax = std::fabs(v.x), ay = std::fabs(v.y), az = std::fabs(v.z);
  const bool flip = ax >= ay && ax >= az ? v.x < 0 : ay >= az ? v.y < 0 : v.z < 0;
  return flip ? Point3{-v.x, -v.y, -v.z} : v;
}

double jsSign(double v) { return v > 0 ? 1 : v < 0 ? -1 : v; }
}  // namespace

std::vector<Point3> principalAxesOfCovariance(const std::array<double, 9>& cov) {
  using Mat = std::array<std::array<double, 3>, 3>;
  Mat a{{{cov[0], cov[1], cov[2]}, {cov[3], cov[4], cov[5]}, {cov[6], cov[7], cov[8]}}};
  Mat v{{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}};
  const int pairs[3][2] = {{0, 1}, {0, 2}, {1, 2}};
  for (int sweep = 0; sweep < 32; ++sweep) {
    const double off = std::fabs(a[0][1]) + std::fabs(a[0][2]) + std::fabs(a[1][2]);
    if (off < 1e-12) break;
    for (const auto& pq : pairs) {
      const int p = pq[0], q = pq[1];
      const double apq = a[p][q];
      if (std::fabs(apq) < 1e-14) continue;
      const double theta = (a[q][q] - a[p][p]) / (2 * apq);
      const double t = jsSign(theta == 0 ? 1 : theta) / (std::fabs(theta) + std::sqrt(theta * theta + 1));
      const double c = 1 / std::sqrt(t * t + 1);
      const double s = t * c;
      Mat next = a;
      next[p][p] = a[p][p] - t * apq;
      next[q][q] = a[q][q] + t * apq;
      next[p][q] = 0;
      next[q][p] = 0;
      for (int i = 0; i < 3; ++i) {
        if (i != p && i != q) {
          next[p][i] = c * a[p][i] - s * a[q][i];
          next[i][p] = next[p][i];
          next[q][i] = s * a[p][i] + c * a[q][i];
          next[i][q] = next[q][i];
        }
      }
      a = next;
      Mat nv = v;
      for (int i = 0; i < 3; ++i) {
        nv[i][p] = c * v[i][p] - s * v[i][q];
        nv[i][q] = s * v[i][p] + c * v[i][q];
      }
      v = nv;
    }
  }
  struct Eigen { double value; Point3 axis; };
  std::vector<Eigen> eigen;
  for (int i = 0; i < 3; ++i) eigen.push_back({a[i][i], {v[0][i], v[1][i], v[2][i]}});
  std::stable_sort(eigen.begin(), eigen.end(), [](const Eigen& x, const Eigen& y) { return y.value < x.value; });
  std::vector<Point3> axes;
  for (const Eigen& e : eigen) axes.push_back(canonicalDirection(normalizeDirection(e.axis).value_or(Point3{1, 0, 0})));
  return axes;
}

namespace {
std::array<double, 9> covarianceOfVertices(const std::vector<float>& p) {
  const std::size_t vertices = p.size() / 3;
  const std::size_t stride = std::max<std::size_t>(1, static_cast<std::size_t>(std::floor(static_cast<double>(vertices) / 8192)));
  double count = 0, sx = 0, sy = 0, sz = 0;
  for (std::size_t v = 0; v < vertices; v += stride) {
    sx += p[v * 3]; sy += p[v * 3 + 1]; sz += p[v * 3 + 2];
    count += 1;
  }
  const double mx = sx / count, my = sy / count, mz = sz / count;
  double xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (std::size_t v = 0; v < vertices; v += stride) {
    const double dx = p[v * 3] - mx, dy = p[v * 3 + 1] - my, dz = p[v * 3 + 2] - mz;
    xx += dx * dx; xy += dx * dy; xz += dx * dz; yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  return {xx, xy, xz, xy, yy, yz, xz, yz, zz};
}

struct ClusterSeed {
  Point3 direction;
  double areaMm2;
};

std::vector<ClusterSeed> dominantNormalClusters(const PlanningMesh& mesh) {
  std::vector<const PlanningPatch*> order;
  for (const PlanningPatch& p : mesh.patches) order.push_back(&p);
  std::stable_sort(order.begin(), order.end(), [](const PlanningPatch* a, const PlanningPatch* b) {
    const double d = b->areaMm2 - a->areaMm2;
    return d != 0 ? d < 0 : a->patchIndex < b->patchIndex;
  });
  std::vector<ClusterSeed> seeds;
  const double clusterAngle = kMasterPlannerLimits.directionDedupAngleDeg * 3;
  for (const PlanningPatch* patch : order) {
    ClusterSeed* existing = nullptr;
    for (ClusterSeed& s : seeds) {
      if (angleBetweenDeg(s.direction, patch->normal) <= clusterAngle) { existing = &s; break; }
    }
    if (existing) existing->areaMm2 += patch->areaMm2;
    else if (static_cast<int>(seeds.size()) < kMasterPlannerLimits.maxNormalClusterSeeds) seeds.push_back({patch->normal, patch->areaMm2});
  }
  return seeds;
}

/// JavaScript Math.round for the area label.
double jsRound(double v) { return std::floor(v + 0.5); }
}  // namespace

std::vector<PlanningCandidateDirection> generateCandidateDirections(const PlanningMesh& mesh, const std::vector<float>& worldPositions) {
  std::vector<PlanningCandidateDirection> canonical;
  canonical.push_back({"world:world+X", {1, 0, 0}, "world-axis", "world+X"});
  canonical.push_back({"world:world+Y", {0, 1, 0}, "world-axis", "world+Y"});
  canonical.push_back({"world:world+Z", {0, 0, 1}, "world-axis", "world+Z"});

  if (worldPositions.size() >= 9) {
    const std::vector<Point3> axes = principalAxesOfCovariance(covarianceOfVertices(worldPositions));
    for (std::size_t i = 0; i < axes.size(); ++i) {
      const auto n = normalizeDirection(axes[i]);
      if (!n) continue;
      canonical.push_back({"pca:" + std::to_string(i), *n, "principal-axis", "principal-" + std::to_string(i)});
    }
  }

  std::vector<ClusterSeed> clusters = dominantNormalClusters(mesh);
  std::stable_sort(clusters.begin(), clusters.end(), [](const ClusterSeed& a, const ClusterSeed& b) { return b.areaMm2 < a.areaMm2; });
  for (std::size_t i = 0; i < clusters.size(); ++i) {
    const auto n = normalizeDirection(clusters[i].direction);
    if (!n) continue;
    canonical.push_back({"cluster:" + std::to_string(i), canonicalDirection(*n), "normal-cluster",
                         "cluster-" + std::to_string(i) + "-area-" + jsNumberToString(jsRound(clusters[i].areaMm2))});
  }

  std::vector<PlanningCandidateDirection> unique;
  for (const PlanningCandidateDirection& c : canonical) {
    bool duplicate = false;
    for (const auto& u : unique) {
      if (angleBetweenDeg(u.vector, c.vector) <= kMasterPlannerLimits.directionDedupAngleDeg) { duplicate = true; break; }
    }
    if (duplicate) continue;
    unique.push_back(c);
    if (static_cast<int>(unique.size()) >= kMasterPlannerLimits.maxCandidateDirections) break;
  }
  std::vector<PlanningCandidateDirection> polarized;
  for (const auto& c : unique) {
    polarized.push_back(c);
    polarized.push_back({c.directionId + ":neg", {-c.vector.x, -c.vector.y, -c.vector.z}, c.source, c.origin + "-neg"});
  }
  return polarized;
}

}  // namespace craft
