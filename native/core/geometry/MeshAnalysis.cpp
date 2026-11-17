#include "geometry/MeshAnalysis.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <unordered_map>

namespace craft {

namespace {

std::uint64_t edgeKey(std::uint32_t a, std::uint32_t b) {
  return a < b ? (static_cast<std::uint64_t>(a) << 32) | b
               : (static_cast<std::uint64_t>(b) << 32) | a;
}

std::uint32_t hashByte(std::uint32_t hash, std::uint8_t byte) {
  return (hash ^ byte) * 16777619u;  // Math.imul semantics: wrap at 32 bits
}

double quantize(double value, double tolerance) { return std::round(value / tolerance); }

}  // namespace

MeshTopologyCounts meshTopology(const std::vector<std::uint32_t>& indices) {
  std::unordered_map<std::uint64_t, std::uint32_t> uses;
  uses.reserve(indices.size());
  for (std::size_t i = 0; i + 2 < indices.size(); i += 3) {
    for (int e = 0; e < 3; ++e) {
      ++uses[edgeKey(indices[i + e], indices[i + (e + 1) % 3])];
    }
  }
  MeshTopologyCounts counts;
  for (const auto& [key, count] : uses) {
    if (count == 1) ++counts.openEdgeCount;
    if (count > 2) ++counts.nonManifoldEdgeCount;
  }
  return counts;
}

MeshTopologyCounts meshTopology(const MeshPayload& mesh) { return meshTopology(mesh.indices); }

FragmentVolumeClassification classifyFragmentVolumes(const std::vector<double>& volumes,
                                                     double minimumVolumeMm3) {
  bool valid = std::isfinite(minimumVolumeMm3) && minimumVolumeMm3 >= 0;
  for (double volume : volumes) valid = valid && std::isfinite(volume) && volume >= 0;
  if (!valid) throw std::invalid_argument("Fragment volume classification inputs are invalid.");

  FragmentVolumeClassification result;
  for (double volume : volumes) {
    (volume > minimumVolumeMm3 ? result.meaningfulVolumes : result.discardedVolumes)
        .push_back(volume);
  }
  std::sort(result.meaningfulVolumes.begin(), result.meaningfulVolumes.end(), std::greater<>());
  std::sort(result.discardedVolumes.begin(), result.discardedVolumes.end(), std::greater<>());
  return result;
}

int compareComponentDescriptors(const ComponentOrderingDescriptor& left,
                                const ComponentOrderingDescriptor& right,
                                double geometryToleranceMm) {
  if (!std::isfinite(geometryToleranceMm) || geometryToleranceMm <= 0) {
    throw std::invalid_argument("Component ordering tolerance must be positive.");
  }
  const double volumeTolerance = geometryToleranceMm * geometryToleranceMm * geometryToleranceMm;
  const double comparisons[] = {
      quantize(right.volumeMm3, volumeTolerance) - quantize(left.volumeMm3, volumeTolerance),
      quantize(left.bounds.min.x, geometryToleranceMm) - quantize(right.bounds.min.x, geometryToleranceMm),
      quantize(left.bounds.min.y, geometryToleranceMm) - quantize(right.bounds.min.y, geometryToleranceMm),
      quantize(left.bounds.min.z, geometryToleranceMm) - quantize(right.bounds.min.z, geometryToleranceMm),
      quantize(left.bounds.max.x, geometryToleranceMm) - quantize(right.bounds.max.x, geometryToleranceMm),
      quantize(left.bounds.max.y, geometryToleranceMm) - quantize(right.bounds.max.y, geometryToleranceMm),
      quantize(left.bounds.max.z, geometryToleranceMm) - quantize(right.bounds.max.z, geometryToleranceMm),
  };
  for (double comparison : comparisons) {
    if (comparison != 0) return comparison < 0 ? -1 : 1;
  }
  return 0;
}

std::uint32_t hashNumericArray(const std::vector<double>& values, std::uint32_t seed) {
  std::uint32_t hash = seed;
  for (double value : values) {
    std::uint8_t bytes[8];
    std::memcpy(bytes, &value, 8);  // little-endian on every supported target
    for (std::uint8_t byte : bytes) hash = hashByte(hash, byte);
  }
  return hash;
}

std::uint32_t hashIndexArray(const std::vector<std::uint32_t>& values, std::uint32_t seed) {
  std::uint32_t hash = seed;
  for (std::uint32_t index : values) {
    const double value = static_cast<double>(index);  // the reference hashes JS numbers
    std::uint8_t bytes[8];
    std::memcpy(bytes, &value, 8);
    for (std::uint8_t byte : bytes) hash = hashByte(hash, byte);
  }
  return hash;
}

std::uint32_t hashText(const std::string& text, std::uint32_t seed) {
  std::uint32_t hash = seed;
  for (unsigned char character : text) hash = hashByte(hash, character);
  return hash;
}

std::string finishHash(std::uint32_t hash) {
  char buffer[9];
  std::snprintf(buffer, sizeof(buffer), "%08x", hash);
  return buffer;
}

std::string meshGeometryVersion(const std::string& id, const MeshPayload& mesh,
                                const Bounds3& bounds) {
  std::uint32_t hash = hashText(id);
  hash = hashNumericArray({bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y,
                           bounds.max.z},
                          hash);
  hash = hashNumericArray(mesh.positions, hash);
  hash = hashIndexArray(mesh.indices, hash);
  return "body:" + finishHash(hash);
}

std::string partGeometryVersion(const TriangleSoup& soup) {
  std::uint32_t hash = kFingerprintSeed;
  for (float value : soup.positions) {
    std::uint8_t bytes[4];
    std::memcpy(bytes, &value, 4);
    for (std::uint8_t byte : bytes) hash = hashByte(hash, byte);
  }
  return "part_mesh:" + finishHash(hash);
}

}  // namespace craft
