#include "mold/PartSolid.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace craft {

namespace {

Issue warning(std::string code, std::string message) {
  return {IssueSeverity::Warning, std::move(code), std::move(message)};
}
Issue blocker(std::string code, std::string message) {
  return {IssueSeverity::Blocker, std::move(code), std::move(message)};
}

std::uint64_t edgeKey(std::uint32_t a, std::uint32_t b) {
  return a < b ? (static_cast<std::uint64_t>(a) << 32) | b
               : (static_cast<std::uint64_t>(b) << 32) | a;
}

using DirectedEdge = std::pair<std::uint32_t, std::uint32_t>;

/// Edge records are kept in first-seen order; the reference relies on Map
/// insertion order when it walks boundary loops.
struct EdgeTopology {
  struct Edge {
    std::uint64_t key = 0;
    DirectedEdge firstDirection;
    std::vector<std::uint32_t> triangles;
  };
  std::vector<Edge> edges;
  std::vector<DirectedEdge> boundaryEdges;
  std::unordered_map<std::uint64_t, DirectedEdge> boundaryDirections;
  std::size_t openEdgeCount = 0;
  std::size_t nonManifoldEdgeCount = 0;
};

EdgeTopology buildEdgeTopology(const std::vector<std::uint32_t>& indices) {
  EdgeTopology topology;
  std::unordered_map<std::uint64_t, std::size_t> lookup;
  lookup.reserve(indices.size());
  for (std::uint32_t triangle = 0; triangle < indices.size() / 3; ++triangle) {
    for (int e = 0; e < 3; ++e) {
      const std::uint32_t from = indices[triangle * 3 + e];
      const std::uint32_t to = indices[triangle * 3 + (e + 1) % 3];
      const std::uint64_t key = edgeKey(from, to);
      auto [entry, inserted] = lookup.try_emplace(key, topology.edges.size());
      if (inserted) topology.edges.push_back({key, {from, to}, {}});
      topology.edges[entry->second].triangles.push_back(triangle);
    }
  }
  for (const auto& edge : topology.edges) {
    if (edge.triangles.size() == 1) {
      topology.boundaryEdges.push_back(edge.firstDirection);
      topology.boundaryDirections.emplace(edge.key, edge.firstDirection);
    } else if (edge.triangles.size() > 2) {
      ++topology.nonManifoldEdgeCount;
    }
  }
  topology.openEdgeCount = topology.boundaryEdges.size();
  return topology;
}

struct BoundaryLoopExtraction {
  std::vector<std::vector<std::uint32_t>> loops;
  std::size_t invalidOpenChains = 0;
};

BoundaryLoopExtraction extractBoundaryLoops(const std::vector<DirectedEdge>& boundaryEdges) {
  std::unordered_map<std::uint32_t, std::vector<std::uint32_t>> adjacency;
  std::vector<std::uint64_t> order;
  std::unordered_set<std::uint64_t> unvisited;
  for (const auto& [a, b] : boundaryEdges) {
    adjacency[a].push_back(b);
    adjacency[b].push_back(a);
    if (unvisited.insert(edgeKey(a, b)).second) order.push_back(edgeKey(a, b));
  }

  BoundaryLoopExtraction result;
  for (std::uint64_t firstKey : order) {
    if (unvisited.count(firstKey) == 0) continue;
    const auto start = static_cast<std::uint32_t>(firstKey >> 32);
    std::uint32_t previous = start;
    auto current = static_cast<std::uint32_t>(firstKey & 0xFFFFFFFFull);
    std::vector<std::uint32_t> loop{start, current};
    unvisited.erase(firstKey);

    while (current != start) {
      std::optional<std::uint32_t> next;
      for (std::uint32_t candidate : adjacency[current]) {
        if (candidate != previous && unvisited.count(edgeKey(current, candidate)) > 0) {
          next = candidate;
          break;
        }
      }
      if (!next) {
        ++result.invalidOpenChains;
        break;
      }
      unvisited.erase(edgeKey(current, *next));
      previous = current;
      current = *next;
      if (current != start) loop.push_back(current);
      if (loop.size() > boundaryEdges.size() + 1) {
        ++result.invalidOpenChains;
        break;
      }
    }
    if (current == start) result.loops.push_back(std::move(loop));
  }
  return result;
}

std::array<std::uint32_t, 3> orientTriangularBoundaryRepair(
    const std::vector<std::uint32_t>& loop,
    const std::unordered_map<std::uint64_t, DirectedEdge>& boundaryDirections) {
  if (loop.size() != 3) {
    throw std::runtime_error("Triangular boundary repair requires exactly three vertices.");
  }
  const std::array<std::array<std::uint32_t, 3>, 2> candidates{
      {{loop[0], loop[1], loop[2]}, {loop[0], loop[2], loop[1]}}};
  for (const auto& candidate : candidates) {
    int reverseMatches = 0;
    for (int e = 0; e < 3; ++e) {
      const std::uint32_t from = candidate[e];
      const std::uint32_t to = candidate[(e + 1) % 3];
      const auto existing = boundaryDirections.find(edgeKey(from, to));
      if (existing != boundaryDirections.end() && existing->second.first == to &&
          existing->second.second == from) {
        ++reverseMatches;
      }
    }
    if (reverseMatches == 3) return candidate;
  }
  throw std::runtime_error("Triangular boundary orientation could not be resolved safely.");
}

struct P3 {
  double x, y, z;
};
P3 at(const std::vector<double>& positions, std::uint32_t vertex) {
  return {positions[vertex * 3ull], positions[vertex * 3ull + 1], positions[vertex * 3ull + 2]};
}
double doubleArea(const P3& a, const P3& b, const P3& c) {
  const double ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const double vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  return std::hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

struct CellKey {
  std::int64_t x, y, z;
  bool operator==(const CellKey&) const = default;
};
struct CellKeyHash {
  std::size_t operator()(const CellKey& key) const {
    std::uint64_t h = 1469598103934665603ull;
    for (std::int64_t value : {key.x, key.y, key.z}) {
      h ^= static_cast<std::uint64_t>(value);
      h *= 1099511628211ull;
    }
    return static_cast<std::size_t>(h);
  }
};

std::string plural(std::size_t count, const char* one, const char* many) {
  return count == 1 ? one : many;
}

std::string joinSizes(const std::vector<std::size_t>& sizes) {
  if (sizes.empty()) return "none";
  std::string text;
  for (std::size_t size : sizes) {
    if (!text.empty()) text += ", ";
    text += std::to_string(size);
  }
  return text;
}

}  // namespace

PartSolidValidationResult validateAndPreparePartSolid(const std::vector<double>& sourcePositions,
                                                      const std::vector<std::uint32_t>& sourceIndices,
                                                      const Transform& localToMold,
                                                      const GeometryTolerancePolicy& policy) {
  PartSolidValidationResult result;
  auto& blockers = result.blockers;
  auto& warnings = result.warnings;

  if (sourcePositions.size() < 9 || sourcePositions.size() % 3 != 0) {
    blockers.push_back(blocker("part_solid_empty", "Uploaded model has no valid triangles."));
  }
  if (sourceIndices.size() < 3 || sourceIndices.size() % 3 != 0) {
    blockers.push_back(blocker("part_solid_indices_invalid",
                               "Uploaded model triangle indices are invalid."));
  }
  if (!std::all_of(sourcePositions.begin(), sourcePositions.end(),
                   [](double v) { return std::isfinite(v); })) {
    blockers.push_back(blocker("part_solid_non_finite_vertex",
                               "Uploaded model contains non-finite coordinates."));
  }
  const std::size_t sourceVertexCount = sourcePositions.size() / 3;
  if (!std::all_of(sourceIndices.begin(), sourceIndices.end(),
                   [&](std::uint32_t i) { return i < sourceVertexCount; })) {
    blockers.push_back(blocker("part_solid_triangle_reference_invalid",
                               "Uploaded model contains invalid triangle references."));
  }
  if (!blockers.empty()) return result;

  if (!std::all_of(localToMold.m.begin(), localToMold.m.end(),
                   [](double v) { return std::isfinite(v); })) {
    blockers.push_back(blocker("part_solid_transform_invalid", "Uploaded model transform is invalid."));
    return result;
  }

  const double tolerance = std::max(policy.weldToleranceMm, 1e-9);
  const double areaTolerance = policy.areaToleranceMm2;
  const double volumeTolerance = policy.volumeToleranceMm3;

  // --- weld ---------------------------------------------------------------
  std::vector<double> positions;
  std::vector<std::uint32_t> indices;
  std::unordered_map<CellKey, std::vector<std::uint32_t>, CellKeyHash> spatialCells;
  std::vector<std::int64_t> sourceToWelded(sourceVertexCount, -1);

  const auto weldedVertex = [&](std::uint32_t sourceIndex) -> std::uint32_t {
    if (sourceToWelded[sourceIndex] >= 0) return static_cast<std::uint32_t>(sourceToWelded[sourceIndex]);
    const Point3 p = localToMold.apply({sourcePositions[sourceIndex * 3ull],
                                        sourcePositions[sourceIndex * 3ull + 1],
                                        sourcePositions[sourceIndex * 3ull + 2]});
    const auto cx = static_cast<std::int64_t>(std::floor(p.x / tolerance));
    const auto cy = static_cast<std::int64_t>(std::floor(p.y / tolerance));
    const auto cz = static_cast<std::int64_t>(std::floor(p.z / tolerance));
    std::int64_t target = -1;
    double bestDistance = std::numeric_limits<double>::infinity();
    for (std::int64_t x = cx - 1; x <= cx + 1; ++x) {
      for (std::int64_t y = cy - 1; y <= cy + 1; ++y) {
        for (std::int64_t z = cz - 1; z <= cz + 1; ++z) {
          const auto cell = spatialCells.find({x, y, z});
          if (cell == spatialCells.end()) continue;
          for (std::uint32_t candidate : cell->second) {
            const double distance = std::hypot(positions[candidate * 3ull] - p.x,
                                               positions[candidate * 3ull + 1] - p.y,
                                               positions[candidate * 3ull + 2] - p.z);
            if (distance <= tolerance &&
                (distance < bestDistance ||
                 (distance == bestDistance && (target < 0 || candidate < target)))) {
              target = candidate;
              bestDistance = distance;
            }
          }
        }
      }
    }
    if (target < 0) {
      target = static_cast<std::int64_t>(positions.size() / 3);
      positions.insert(positions.end(), {p.x, p.y, p.z});
      spatialCells[{cx, cy, cz}].push_back(static_cast<std::uint32_t>(target));
    }
    sourceToWelded[sourceIndex] = target;
    return static_cast<std::uint32_t>(target);
  };

  // --- face filtering -----------------------------------------------------
  // Key: sorted vertex triple. Value: the canonical rotation of the first
  // orientation seen, so a later copy is classified same- or opposite-facing.
  std::map<std::array<std::uint32_t, 3>, std::array<std::uint32_t, 3>> faceOrientations;
  const auto orientationKey = [](std::uint32_t a, std::uint32_t b, std::uint32_t c) {
    std::array<std::array<std::uint32_t, 3>, 3> rotations{{{a, b, c}, {b, c, a}, {c, a, b}}};
    return *std::min_element(rotations.begin(), rotations.end());
  };
  std::size_t degenerateCount = 0, duplicateCount = 0, oppositeDuplicateCount = 0;
  for (std::size_t i = 0; i + 2 < sourceIndices.size(); i += 3) {
    const std::uint32_t a = weldedVertex(sourceIndices[i]);
    const std::uint32_t b = weldedVertex(sourceIndices[i + 1]);
    const std::uint32_t c = weldedVertex(sourceIndices[i + 2]);
    if (a == b || b == c || c == a) {
      ++degenerateCount;
      continue;
    }
    if (doubleArea(at(positions, a), at(positions, b), at(positions, c)) <= areaTolerance) {
      ++degenerateCount;
      continue;
    }
    std::array<std::uint32_t, 3> unordered{a, b, c};
    std::sort(unordered.begin(), unordered.end());
    const auto orientation = orientationKey(a, b, c);
    const auto existing = faceOrientations.find(unordered);
    if (existing != faceOrientations.end()) {
      ++(existing->second == orientation ? duplicateCount : oppositeDuplicateCount);
      continue;
    }
    faceOrientations.emplace(unordered, orientation);
    indices.insert(indices.end(), {a, b, c});
  }
  if (degenerateCount) {
    warnings.push_back(warning("part_solid_degenerate_faces_removed",
                               std::to_string(degenerateCount) + " degenerate triangle" +
                                   plural(degenerateCount, " was", "s were") + " removed."));
  }
  if (duplicateCount) {
    warnings.push_back(warning("part_solid_duplicate_faces_removed",
                               std::to_string(duplicateCount) + " duplicate triangle" +
                                   plural(duplicateCount, " was", "s were") + " removed."));
  }
  if (oppositeDuplicateCount) {
    blockers.push_back(blocker("part_solid_opposite_duplicate_faces",
                               std::to_string(oppositeDuplicateCount) +
                                   " opposite duplicate triangle" +
                                   plural(oppositeDuplicateCount, " creates", "s create") +
                                   " ambiguous internal sheets."));
  }
  if (indices.size() < 12) {
    blockers.assign({blocker("part_solid_no_meaningful_volume",
                             "Uploaded model has no meaningful closed volume.")});
    return result;
  }

  // --- topology + small-hole repair --------------------------------------
  EdgeTopology topology = buildEdgeTopology(indices);
  BoundaryLoopExtraction extraction = extractBoundaryLoops(topology.boundaryEdges);
  const auto loopSizes = [](const BoundaryLoopExtraction& e) {
    std::vector<std::size_t> sizes;
    for (const auto& loop : e.loops) sizes.push_back(loop.size());
    std::sort(sizes.begin(), sizes.end());
    return sizes;
  };
  std::vector<std::size_t> sizes = loopSizes(extraction);

  const bool repairable =
      topology.nonManifoldEdgeCount == 0 && extraction.invalidOpenChains == 0 && !sizes.empty() &&
      sizes.size() <= 8 && std::all_of(sizes.begin(), sizes.end(), [](std::size_t s) { return s == 3; });
  if (repairable) {
    const Bounds3 meshBounds = boundsOfPositions(positions);
    const Point3 d = meshBounds.size();
    const double maximumRepairDoubleArea =
        std::max(areaTolerance * 100, 2 * (d.x * d.y + d.y * d.z + d.z * d.x) * 0.2);
    try {
      for (const auto& loop : extraction.loops) {
        if (doubleArea(at(positions, loop[0]), at(positions, loop[1]), at(positions, loop[2])) >
            maximumRepairDoubleArea) {
          throw std::runtime_error("Triangular boundary exceeds the safe repair size.");
        }
        const auto repair = orientTriangularBoundaryRepair(loop, topology.boundaryDirections);
        indices.insert(indices.end(), repair.begin(), repair.end());
      }
    } catch (const std::exception&) {
      blockers.push_back(blocker(
          "part_solid_hole_repair_orientation_failed",
          "Small triangular holes were found, but their orientation could not be repaired safely."));
    }
    if (blockers.empty()) {
      const std::size_t repairedLoops = extraction.loops.size();
      topology = buildEdgeTopology(indices);
      extraction = extractBoundaryLoops(topology.boundaryEdges);
      sizes = loopSizes(extraction);
      if (topology.openEdgeCount == 0 && topology.nonManifoldEdgeCount == 0) {
        warnings.push_back(warning("part_solid_triangular_holes_repaired",
                                   std::to_string(repairedLoops) + " small triangular hole" +
                                       plural(repairedLoops, " was", "s were") +
                                       " repaired automatically."));
      } else {
        blockers.push_back(blocker(
            "part_solid_hole_repair_invalid",
            "Automatic hole repair did not produce a closed manifold. Open edges: " +
                std::to_string(topology.openEdgeCount) + ". Non-manifold edges: " +
                std::to_string(topology.nonManifoldEdgeCount) + "."));
      }
    }
  }
  result.openEdgeCount = topology.openEdgeCount;
  result.nonManifoldEdgeCount = topology.nonManifoldEdgeCount;

  if (topology.openEdgeCount) {
    blockers.push_back(blocker("part_solid_open_mesh",
                               "Uploaded model is not a closed solid. Open edges: " +
                                   std::to_string(topology.openEdgeCount) + ". Boundary loops: " +
                                   std::to_string(sizes.size()) + ". Loop sizes: " +
                                   joinSizes(sizes) + "."));
  }
  if (topology.nonManifoldEdgeCount) {
    blockers.push_back(blocker("part_solid_non_manifold",
                               "Uploaded model has non-manifold edges: " +
                                   std::to_string(topology.nonManifoldEdgeCount) + "."));
  }

  // --- connected components ----------------------------------------------
  const std::size_t triangleCount = indices.size() / 3;
  std::vector<std::vector<std::uint32_t>> neighbors(triangleCount);
  for (const auto& edge : topology.edges) {
    for (std::uint32_t a : edge.triangles) {
      for (std::uint32_t b : edge.triangles) {
        if (a != b) neighbors[a].push_back(b);
      }
    }
  }
  std::vector<int> triangleComponent(triangleCount, -1);
  std::vector<std::vector<std::uint32_t>> components;
  for (std::uint32_t t = 0; t < triangleCount; ++t) {
    if (triangleComponent[t] >= 0) continue;
    const int componentIndex = static_cast<int>(components.size());
    std::vector<std::uint32_t> component;
    std::vector<std::uint32_t> stack{t};
    triangleComponent[t] = componentIndex;
    while (!stack.empty()) {
      const std::uint32_t current = stack.back();
      stack.pop_back();
      component.push_back(current);
      for (std::uint32_t n : neighbors[current]) {
        if (triangleComponent[n] < 0) {
          triangleComponent[n] = componentIndex;
          stack.push_back(n);
        }
      }
    }
    components.push_back(std::move(component));
  }
  const std::size_t componentCount = components.size();

  // A vertex shared by two edge-disconnected components is a bow-tie.
  std::vector<int> vertexComponent(positions.size() / 3, -1);
  bool bowTie = false;
  for (std::uint32_t t = 0; t < triangleCount && !bowTie; ++t) {
    for (int corner = 0; corner < 3; ++corner) {
      int& owner = vertexComponent[indices[t * 3ull + corner]];
      if (owner < 0) owner = triangleComponent[t];
      else if (owner != triangleComponent[t]) bowTie = true;
    }
  }
  if (bowTie) {
    blockers.push_back(blocker("part_solid_bow_tie_vertex",
                               "Uploaded model contains solids connected only through a bow-tie vertex."));
  }

  std::vector<Bounds3> componentBounds;
  for (const auto& component : components) {
    Bounds3 bounds = emptyBounds();
    for (std::uint32_t t : component) {
      for (int corner = 0; corner < 3; ++corner) {
        const P3 p = at(positions, indices[t * 3ull + corner]);
        bounds.min = {std::min(bounds.min.x, p.x), std::min(bounds.min.y, p.y), std::min(bounds.min.z, p.z)};
        bounds.max = {std::max(bounds.max.x, p.x), std::max(bounds.max.y, p.y), std::max(bounds.max.z, p.z)};
      }
    }
    componentBounds.push_back(bounds);
  }
  if (componentCount * (componentCount - 1) / 2 > 10'000) {
    blockers.push_back(blocker("part_solid_audit_budget_exceeded",
                               "Geometry audit exceeded the safe connected-component comparison budget."));
  } else {
    for (std::size_t l = 0; l < componentCount; ++l) {
      for (std::size_t r = l + 1; r < componentCount; ++r) {
        const Bounds3& a = componentBounds[l];
        const Bounds3& b = componentBounds[r];
        if (a.min.x < b.max.x - tolerance && a.max.x > b.min.x + tolerance &&
            a.min.y < b.max.y - tolerance && a.max.y > b.min.y + tolerance &&
            a.min.z < b.max.z - tolerance && a.max.z > b.min.z + tolerance) {
          blockers.push_back(blocker(
              "part_solid_overlapping_components",
              "Uploaded model contains overlapping or nested closed components that cannot be subtracted safely."));
        }
      }
    }
  }
  if (componentCount > 1) {
    warnings.push_back(warning("part_solid_multiple_components",
                               "Uploaded model contains " + std::to_string(componentCount) +
                                   " closed components."));
  }

  // --- volume + outward winding ------------------------------------------
  double totalVolume = 0;
  for (const auto& component : components) {
    double signedComponentVolume = 0;
    for (std::uint32_t t : component) {
      const P3 a = at(positions, indices[t * 3ull]);
      const P3 b = at(positions, indices[t * 3ull + 1]);
      const P3 c = at(positions, indices[t * 3ull + 2]);
      signedComponentVolume += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) +
                                a.z * (b.x * c.y - b.y * c.x)) /
                               6;
    }
    if (!std::isfinite(signedComponentVolume) || std::fabs(signedComponentVolume) <= volumeTolerance) {
      blockers.push_back(blocker("part_solid_zero_volume_component",
                                 "Uploaded model contains a component with no meaningful enclosed volume."));
      continue;
    }
    if (signedComponentVolume < 0) {
      for (std::uint32_t t : component) std::swap(indices[t * 3ull + 1], indices[t * 3ull + 2]);
    }
    totalVolume += std::fabs(signedComponentVolume);
  }
  if (!blockers.empty()) return result;

  result.ok = true;
  result.prepared.bounds = boundsOfPositions(positions);
  result.prepared.mesh.positions = std::move(positions);
  result.prepared.mesh.indices = std::move(indices);
  result.prepared.volumeMm3 = totalVolume;
  result.prepared.triangleCount = triangleCount;
  result.prepared.connectedComponentCount = componentCount;
  result.prepared.watertight = true;
  result.prepared.manifold = true;
  result.prepared.warnings = warnings;
  return result;
}

}  // namespace craft
