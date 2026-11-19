#include "mold/ReferenceMold.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <tuple>

#include "contracts/Operation.h"
#include "geometry/MeshAnalysis.h"

namespace craft {

namespace {

struct FaceData {
  Axis axis;
  Point3 normal;
  int initial;  // 0 = the face sits on K1 min, 1 = on K1 max
};

const FaceData& faceData(FaceId face) {
  static const FaceData kData[6] = {
      {Axis::Y, {0, 1, 0}, 1},   // front
      {Axis::Y, {0, -1, 0}, 0},  // back
      {Axis::X, {-1, 0, 0}, 0},  // left
      {Axis::X, {1, 0, 0}, 1},   // right
      {Axis::Z, {0, 0, 1}, 1},   // top
      {Axis::Z, {0, 0, -1}, 0},  // bottom
  };
  return kData[static_cast<int>(face)];
}

bool positiveFiniteBounds(const Bounds3& bounds) {
  return isFiniteBounds(bounds) && bounds.max.x - bounds.min.x > kMoldGeometryToleranceMm &&
         bounds.max.y - bounds.min.y > kMoldGeometryToleranceMm &&
         bounds.max.z - bounds.min.z > kMoldGeometryToleranceMm;
}

double boundsVolume(const Bounds3& bounds) {
  const Point3 size = bounds.size();
  return size.x * size.y * size.z;
}

struct Cell {
  int ix = 0, iy = 0, iz = 0;
  int& at(int axis) { return axis == 0 ? ix : axis == 1 ? iy : iz; }
  int at(int axis) const { return axis == 0 ? ix : axis == 1 ? iy : iz; }
  friend bool operator<(const Cell& a, const Cell& b) {
    return std::tie(a.ix, a.iy, a.iz) < std::tie(b.ix, b.iy, b.iz);
  }
};

using Coordinates = std::array<std::vector<double>, 3>;

/// Sorted values with near-duplicates removed. Each value is compared with
/// its sorted predecessor (kept or not), exactly like the reference `unique`.
std::vector<double> uniqueSorted(std::vector<double> values) {
  std::sort(values.begin(), values.end());
  std::vector<double> result;
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i == 0 || values[i] - values[i - 1] > kMoldGeometryToleranceMm) result.push_back(values[i]);
  }
  return result;
}

struct CellMesh {
  MeshPayload mesh;
  double volume = 0;
  Bounds3 bounds;
};

/// Boundary quads of a set of axis-aligned cells, with shared vertices welded
/// by exact coordinate so the result is a closed indexed mesh.
CellMesh meshCells(const std::vector<Cell>& cells, const Coordinates& coordinates) {
  const std::set<Cell> occupied(cells.begin(), cells.end());
  CellMesh result;
  result.bounds = emptyBounds();
  std::map<std::array<double, 3>, std::uint32_t> vertices;

  const auto addVertex = [&](double x, double y, double z) {
    const std::array<double, 3> key{x, y, z};
    const auto found = vertices.find(key);
    if (found != vertices.end()) return found->second;
    const auto index = static_cast<std::uint32_t>(result.mesh.positions.size() / 3);
    result.mesh.positions.insert(result.mesh.positions.end(), {x, y, z});
    vertices.emplace(key, index);
    return index;
  };
  const auto addQuad = [&](const std::array<std::array<double, 3>, 4>& points) {
    std::uint32_t q[4];
    for (int i = 0; i < 4; ++i) q[i] = addVertex(points[i][0], points[i][1], points[i][2]);
    result.mesh.indices.insert(result.mesh.indices.end(), {q[0], q[1], q[2], q[0], q[2], q[3]});
  };
  const auto has = [&](Cell cell, int axis, int direction) {
    cell.at(axis) += direction;
    return occupied.count(cell) > 0;
  };

  for (const Cell& c : cells) {
    const double x0 = coordinates[0][c.ix], x1 = coordinates[0][c.ix + 1];
    const double y0 = coordinates[1][c.iy], y1 = coordinates[1][c.iy + 1];
    const double z0 = coordinates[2][c.iz], z1 = coordinates[2][c.iz + 1];
    result.volume += (x1 - x0) * (y1 - y0) * (z1 - z0);
    if (!has(c, 0, -1)) addQuad({{{x0, y0, z0}, {x0, y0, z1}, {x0, y1, z1}, {x0, y1, z0}}});
    if (!has(c, 0, +1)) addQuad({{{x1, y0, z0}, {x1, y1, z0}, {x1, y1, z1}, {x1, y0, z1}}});
    if (!has(c, 1, -1)) addQuad({{{x0, y0, z0}, {x1, y0, z0}, {x1, y0, z1}, {x0, y0, z1}}});
    if (!has(c, 1, +1)) addQuad({{{x0, y1, z0}, {x0, y1, z1}, {x1, y1, z1}, {x1, y1, z0}}});
    if (!has(c, 2, -1)) addQuad({{{x0, y0, z0}, {x0, y1, z0}, {x1, y1, z0}, {x1, y0, z0}}});
    if (!has(c, 2, +1)) addQuad({{{x0, y0, z1}, {x1, y0, z1}, {x1, y1, z1}, {x0, y1, z1}}});
    result.bounds.min = {std::min(result.bounds.min.x, x0), std::min(result.bounds.min.y, y0),
                         std::min(result.bounds.min.z, z0)};
    result.bounds.max = {std::max(result.bounds.max.x, x1), std::max(result.bounds.max.y, y1),
                         std::max(result.bounds.max.z, z1)};
  }
  return result;
}

MoldBody bodyFromCellMesh(CellMesh&& cells, std::string id, std::string name) {
  MoldBody body;
  body.id = std::move(id);
  body.name = std::move(name);
  body.bounds = cells.bounds;
  body.centroid = cells.bounds.center();
  body.triangleCount = cells.mesh.triangleCount();
  body.volumeMm3 = cells.volume;
  body.watertight = true;
  body.mesh = std::move(cells.mesh);
  body.geometryVersion = meshGeometryVersion(body.id, body.mesh, body.bounds);
  return body;
}

}  // namespace

double clampReferenceMoldClearance(double clearanceMm) {
  return std::min(kMaxReferenceMoldClearanceMm,
                  std::max(kMinReferenceMoldClearanceMm,
                           std::isfinite(clearanceMm) ? clearanceMm
                                                      : kDefaultReferenceMoldClearanceMm));
}

double resolveAutomaticSegmentationMoldClearance(double clearanceMm) {
  return std::max(kAutomaticSegmentationMinMoldClearanceMm, clampReferenceMoldClearance(clearanceMm));
}

std::optional<ReferenceMoldFrameBounds> createAutomaticSegmentationMoldFrameBounds(
    const Bounds3& groundedPartBounds, double requestedClearanceMm) {
  return createReferenceMoldFrameBounds(groundedPartBounds, resolveAutomaticSegmentationMoldClearance(requestedClearanceMm));
}

std::optional<Bounds3> createReferenceMoldBlockBounds(const Bounds3& inner, double clearanceMm) {
  if (!isFiniteBounds(inner) || inner.min.x >= inner.max.x || inner.min.y >= inner.max.y ||
      inner.min.z >= inner.max.z || !std::isfinite(clearanceMm) ||
      clearanceMm < kMinReferenceMoldClearanceMm || clearanceMm > kMaxReferenceMoldClearanceMm) {
    return std::nullopt;
  }
  return Bounds3{{inner.min.x - clearanceMm, inner.min.y - clearanceMm, inner.min.z - clearanceMm},
                 {inner.max.x + clearanceMm, inner.max.y + clearanceMm, inner.max.z + clearanceMm}};
}

std::optional<ReferenceMoldFrameBounds> createReferenceMoldFrameBounds(
    const Bounds3& groundedPartBounds, double clearanceMm) {
  const Point3 partOffset{0, 0, clearanceMm};
  const Bounds3 selection{
      {groundedPartBounds.min.x, groundedPartBounds.min.y, groundedPartBounds.min.z + partOffset.z},
      {groundedPartBounds.max.x, groundedPartBounds.max.y, groundedPartBounds.max.z + partOffset.z}};
  const auto block = createReferenceMoldBlockBounds(selection, clearanceMm);
  if (!block) return std::nullopt;
  return ReferenceMoldFrameBounds{partOffset, selection, *block};
}

const char* faceIdName(FaceId face) {
  static const char* kNames[6] = {"front", "back", "left", "right", "top", "bottom"};
  return kNames[static_cast<int>(face)];
}

std::optional<FaceId> faceIdFromName(const std::string& name) {
  for (FaceId face : kFaceIds) {
    if (name == faceIdName(face)) return face;
  }
  return std::nullopt;
}

NormalizedInterval safeNormalizedInterval(const Bounds3& bounds, Axis axis) {
  const int a = static_cast<int>(axis);
  const double span = bounds.max[a] - bounds.min[a];
  if (!std::isfinite(span) || span <= kCuttingPlaneInsetMm * 2) {
    throw std::invalid_argument("Part bounding box bounds are too small for a cutting plane.");
  }
  const double inset = std::max(kCuttingPlaneNormalizedEpsilon, kCuttingPlaneInsetMm / span);
  return {inset, 1 - inset};
}

double clampNormalizedPosition(double value, const Bounds3& bounds, Axis axis) {
  if (!std::isfinite(value)) throw std::invalid_argument("Cutting-plane position must be finite.");
  const NormalizedInterval interval = safeNormalizedInterval(bounds, axis);
  return std::min(interval.max, std::max(interval.min, value));
}

double normalizedToWorldCoordinate(const Bounds3& bounds, Axis axis, double normalized) {
  const int a = static_cast<int>(axis);
  const double safe = clampNormalizedPosition(normalized, bounds, axis);
  return bounds.min[a] + (bounds.max[a] - bounds.min[a]) * safe;
}

double worldToNormalizedPosition(const Bounds3& bounds, Axis axis, double coordinate) {
  if (!std::isfinite(coordinate)) throw std::invalid_argument("Cutting-plane coordinate must be finite.");
  const int a = static_cast<int>(axis);
  return clampNormalizedPosition((coordinate - bounds.min[a]) / (bounds.max[a] - bounds.min[a]), bounds, axis);
}

CuttingPlane createCuttingPlane(FaceId face, std::optional<double> normalizedPosition) {
  const FaceData& data = faceData(face);
  CuttingPlane plane;
  plane.sourceFace = face;
  plane.axis = data.axis;
  plane.normal = data.normal;
  plane.normalizedPosition =
      normalizedPosition ? *normalizedPosition
                         : data.initial == 0 ? kCuttingPlaneNormalizedEpsilon
                                             : 1 - kCuttingPlaneNormalizedEpsilon;
  plane.enabled = true;
  plane.creationOrder = static_cast<int>(face);
  return plane;
}

std::vector<CutPlaneData> cuttingPlanesToCutPlaneData(const Bounds3& bounds,
                                                      const std::vector<CuttingPlane>& planes) {
  std::vector<CuttingPlane> enabled;
  for (const CuttingPlane& plane : planes) {
    if (plane.enabled) enabled.push_back(plane);
  }
  std::stable_sort(enabled.begin(), enabled.end(), [](const CuttingPlane& a, const CuttingPlane& b) {
    return a.creationOrder < b.creationOrder;
  });
  std::vector<CutPlaneData> result;
  for (const CuttingPlane& plane : enabled) {
    result.push_back({plane.axis,
                      normalizedToWorldCoordinate(bounds, plane.axis, plane.normalizedPosition),
                      plane.normal, std::string("cutting-plane:") + faceIdName(plane.sourceFace),
                      plane.sourceFace, plane.creationOrder});
  }
  return result;
}

PartitionCoverage validateMoldPartitionCoverage(const Bounds3& outer,
                                                const std::vector<MoldBody>& bodies) {
  bool valid = positiveFiniteBounds(outer) && !bodies.empty();
  for (const MoldBody& body : bodies) {
    valid = valid && std::isfinite(body.volumeMm3) && body.volumeMm3 > 0;
  }
  if (!valid) throw std::invalid_argument("Mold partition coverage inputs are invalid.");

  PartitionCoverage coverage;
  coverage.sourceSolidVolumeMm3 = boundsVolume(outer);
  for (const MoldBody& body : bodies) coverage.partitionedVolumeMm3 += body.volumeMm3;
  coverage.toleranceMm3 = std::max(std::pow(kMoldGeometryToleranceMm, 3),
                                   coverage.sourceSolidVolumeMm3 * 1e-10);
  if (std::fabs(coverage.partitionedVolumeMm3 - coverage.sourceSolidVolumeMm3) >
      coverage.toleranceMm3) {
    throw CodedError("mold_partition_incomplete",
                     "Mold bodies do not completely partition the K2 source solid.");
  }
  return coverage;
}

MoldBody createWholeMoldBody(const Bounds3& outer, const std::string& id, const std::string& name) {
  if (!positiveFiniteBounds(outer)) {
    throw std::invalid_argument("Reference mold block bounds are invalid.");
  }
  const Coordinates coordinates{std::vector<double>{outer.min.x, outer.max.x},
                                std::vector<double>{outer.min.y, outer.max.y},
                                std::vector<double>{outer.min.z, outer.max.z}};
  return bodyFromCellMesh(meshCells({Cell{0, 0, 0}}, coordinates), id, name);
}

MoldPartitionResult partitionOrthogonalMold(const ReferenceMoldDefinition& definition,
                                            const std::vector<CutPlaneData>& planes) {
  const Bounds3& outer = definition.referenceMoldBlockBounds;
  const Bounds3& inner = definition.selectionBoxBounds;
  bool contained = positiveFiniteBounds(outer) && positiveFiniteBounds(inner);
  for (int axis = 0; axis < 3 && contained; ++axis) {
    contained = !(inner.min[axis] <= outer.min[axis] + kMoldGeometryToleranceMm ||
                  inner.max[axis] >= outer.max[axis] - kMoldGeometryToleranceMm);
  }
  if (!contained) {
    throw std::invalid_argument("K1 must be fully contained by K2 with positive shell thickness.");
  }
  if (planes.empty()) throw std::invalid_argument("Select at least one K1 face.");

  Coordinates coordinates;
  for (int axis = 0; axis < 3; ++axis) {
    std::vector<double> values{outer.min[axis], inner.min[axis], inner.max[axis], outer.max[axis]};
    for (const CutPlaneData& plane : planes) {
      if (static_cast<int>(plane.axis) == axis) values.push_back(plane.coordinate);
    }
    coordinates[axis] = uniqueSorted(std::move(values));
  }
  std::set<std::pair<int, double>> planeCoordinates;
  for (const CutPlaneData& plane : planes) {
    planeCoordinates.emplace(static_cast<int>(plane.axis), plane.coordinate);
  }

  // Cells in ix, iy, iz nesting order; flood fill across every cell boundary
  // that is not a cutting plane. Traversal order matches the reference so the
  // emitted vertex order (and therefore the geometry version) is stable.
  const int nx = static_cast<int>(coordinates[0].size()) - 1;
  const int ny = static_cast<int>(coordinates[1].size()) - 1;
  const int nz = static_cast<int>(coordinates[2].size()) - 1;
  const auto cellIndex = [&](const Cell& c) { return (c.ix * ny + c.iy) * nz + c.iz; };
  std::vector<bool> remaining(static_cast<std::size_t>(nx) * ny * nz, true);
  const int extents[3] = {nx, ny, nz};

  std::vector<std::vector<Cell>> groups;
  for (int ix = 0; ix < nx; ++ix) {
    for (int iy = 0; iy < ny; ++iy) {
      for (int iz = 0; iz < nz; ++iz) {
        const Cell seed{ix, iy, iz};
        if (!remaining[cellIndex(seed)]) continue;
        remaining[cellIndex(seed)] = false;
        std::vector<Cell> group;
        std::vector<Cell> stack{seed};
        while (!stack.empty()) {
          const Cell c = stack.back();
          stack.pop_back();
          group.push_back(c);
          for (int axis = 0; axis < 3; ++axis) {
            for (int direction : {-1, 1}) {
              Cell n = c;
              n.at(axis) += direction;
              const double boundary = coordinates[axis][direction > 0 ? c.at(axis) + 1 : c.at(axis)];
              if (planeCoordinates.count({axis, boundary}) > 0) continue;
              if (n.at(axis) < 0 || n.at(axis) >= extents[axis]) continue;
              if (!remaining[cellIndex(n)]) continue;
              remaining[cellIndex(n)] = false;
              stack.push_back(n);
            }
          }
        }
        groups.push_back(std::move(group));
      }
    }
  }

  std::string signature;
  for (const CutPlaneData& plane : planes) {
    if (!signature.empty()) signature += ":";
    signature += faceIdName(plane.sourceFace);
  }

  std::vector<CellMesh> meshes;
  for (const auto& group : groups) {
    CellMesh mesh = meshCells(group, coordinates);
    if (mesh.volume > kMoldGeometryToleranceMm) meshes.push_back(std::move(mesh));
  }
  std::stable_sort(meshes.begin(), meshes.end(), [](const CellMesh& a, const CellMesh& b) {
    for (int axis = 0; axis < 3; ++axis) {
      const double difference =
          (a.bounds.min[axis] + a.bounds.max[axis]) - (b.bounds.min[axis] + b.bounds.max[axis]);
      if (difference != 0) return difference < 0;
    }
    return false;
  });

  MoldPartitionResult result;
  for (std::size_t i = 0; i < meshes.size(); ++i) {
    MoldBody body =
        bodyFromCellMesh(std::move(meshes[i]),
                         definition.definitionId + ":mold:" + std::to_string(i + 1),
                         "Mold " + std::to_string(i + 1));
    body.generationOrder = static_cast<int>(i + 1);
    body.sourceSelectedFaceSignature = signature;
    result.bodies.push_back(std::move(body));
  }
  const PartitionCoverage coverage = validateMoldPartitionCoverage(outer, result.bodies);
  result.sourceSolidVolumeMm3 = coverage.sourceSolidVolumeMm3;
  result.partitionedVolumeMm3 = coverage.partitionedVolumeMm3;
  return result;
}

}  // namespace craft
