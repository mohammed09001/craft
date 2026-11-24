#pragma once

// Neutral mesh analysis helpers. Ports of:
//   mold-generation/geometry/meshTopology.ts          -> meshTopology
//   mold-generation/geometry/fragmentClassification.ts -> classifyFragmentVolumes,
//                                                         compareComponentDescriptors
//   mold-generation/geometry/geometryFingerprint.ts    -> hashNumericArray,
//                                                         meshGeometryVersion

#include <cstdint>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

struct MeshTopologyCounts {
  std::size_t openEdgeCount = 0;         // edges used by exactly one triangle
  std::size_t nonManifoldEdgeCount = 0;  // edges used by more than two triangles
  bool closedManifold() const { return openEdgeCount == 0 && nonManifoldEdgeCount == 0; }
};

MeshTopologyCounts meshTopology(const MeshPayload& mesh);
MeshTopologyCounts meshTopology(const std::vector<std::uint32_t>& indices);

struct FragmentVolumeClassification {
  std::vector<double> meaningfulVolumes;  // descending
  std::vector<double> discardedVolumes;   // descending
};

/// Throws std::invalid_argument on a negative/non-finite threshold or volume.
FragmentVolumeClassification classifyFragmentVolumes(const std::vector<double>& volumes,
                                                     double minimumVolumeMm3);

struct ComponentOrderingDescriptor {
  double volumeMm3 = 0;
  Bounds3 bounds;
};

/// Deterministic ordering: larger volume first, then min/max corners, all
/// quantized to the geometry tolerance. Returns <0, 0, >0 like a comparator.
int compareComponentDescriptors(const ComponentOrderingDescriptor& left,
                                const ComponentOrderingDescriptor& right,
                                double geometryToleranceMm);

inline constexpr std::uint32_t kFingerprintSeed = 2166136261u;

/// Byte-identical to hashNumericArray in geometryFingerprint.ts: each value is
/// hashed as its little-endian IEEE-754 float64 bytes.
std::uint32_t hashNumericArray(const std::vector<double>& values,
                               std::uint32_t seed = kFingerprintSeed);
std::uint32_t hashIndexArray(const std::vector<std::uint32_t>& values, std::uint32_t seed);
std::uint32_t hashText(const std::string& text, std::uint32_t seed = kFingerprintSeed);
std::string finishHash(std::uint32_t hash);

/// Deterministic content version for one mesh body ("body:xxxxxxxx").
/// Deviation from the reference: the reference hashes JSON.stringify(bounds),
/// the native version hashes the six bounds values as float64. The token is a
/// stale-detection identity, so it is stable across native runs but is not
/// string-equal to a reference-generated token.
std::string meshGeometryVersion(const std::string& id, const MeshPayload& mesh,
                                const Bounds3& bounds);

/// Content version for imported part triangles ("part_mesh:xxxxxxxx").
std::string partGeometryVersion(const TriangleSoup& soup);

}  // namespace craft
