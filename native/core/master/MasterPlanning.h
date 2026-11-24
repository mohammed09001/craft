#pragma once

// Master Mold input side: the seed snapshot of the original model, the stable identity used for staleness and reuse, the source-mesh preflight and
// a few vector helpers the planner shares.

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "contracts/Geometry.h"
#include "master/MasterProfile.h"

namespace craft {

// --- seed ------------------------------------------------------------------------------------
struct MasterSeedGeometryInput {
  std::string modelId;
  std::vector<double> positions;  // local-space x,y,z triplets
  std::vector<std::uint32_t> indices;
  std::array<double, 16> transform{};  // column-major part-from-local
  Bounds3 localBounds;
  std::string geometryVersion;
  std::string sourceSignature;
};

struct MasterSeedInput {
  MasterSeedGeometryInput sourcePartGeometry;
  std::optional<Point3> printerBuildVolume;
  MasterProcessProfile processProfile;
  std::string projectRevision;
};

struct MasterSeedSourceMesh {
  std::string modelId;
  std::vector<float> positions;  // Float32, like the STL the model came from
  std::vector<std::uint32_t> indices;
  Bounds3 bounds;  // world bounds
  std::string geometryVersion;
};

struct MasterSeedSnapshot {
  int schemaVersion = 2;
  std::string seedId;
  std::string sourceModelId;
  std::string sourceGeometryVersion;
  MasterSeedSourceMesh sourceMesh;
  std::array<double, 16> sourceTransform{};
  Bounds3 sourceBounds;
  std::optional<Point3> printerBuildVolume;
  MasterProcessProfile processProfile;
  std::string sourceProjectRevision;
};

/// Throws std::invalid_argument on empty, malformed or non-finite geometry.
MasterSeedSnapshot buildMasterMoldSeedSnapshot(const MasterSeedInput& input);

/// Stable-JSON helpers (insertion order, JS number format) and a hash over a prebuilt JSON text.
std::string stableJsonQuote(const std::string& text);
std::string stableJsonNumber(double value);
std::string stableHashOfJson(const std::string& json);
std::string stableJsonVolume(const std::optional<Point3>& volume);

/// Rehydrates world positions (identity transforms return the snapshot as is).
MasterSeedSnapshot worldMeshFromSnapshot(const MasterSeedSnapshot& snapshot);

Bounds3 worldBoundsFromLocal(const Bounds3& localBounds, const std::array<double, 16>& transform);
std::string masterSourceGeometryVersion(const std::string& geometryVersion, const Bounds3& localBounds, const std::array<double, 16>& transform);
/// What a stored result was generated from. It includes the result contract version and every profile field that changes the geometry, so a result
/// of the retired multi-piece contract (or of another profile) is stale by construction.
std::string masterSeedStalenessIdentity(const std::string& sourceGeometryVersion, const std::optional<Point3>& printerBuildVolume,
                                        const MasterProcessProfile& profile);

// --- preflight --------------------------------------------------------------------------------
struct MeshPreflightIssue {
  std::string code;
  std::string severity;  // "error" | "warning"
  std::string message;
  int count = 0;
};

struct MeshPreflightResult {
  std::string status;  // valid | repairable-warning | invalid-for-master-mold
  std::vector<MeshPreflightIssue> issues;
  int triangleCount = 0;
  int vertexCount = 0;
  int componentCount = 0;
  double volumeMm3 = 0;
  /// False when the self-intersection pass stopped at its work limit before covering every pair (a warning says so).
  bool selfIntersectionChecked = false;
};

std::vector<std::int32_t> weldedVertexIds(const std::vector<float>& positions, std::size_t vertexCount, double toleranceMm);
double weldToleranceMmFor(const Bounds3& bounds);
Bounds3 boundsOfPositions(const std::vector<float>& positions, std::size_t vertexCount);
MeshPreflightResult runMeshPreflight(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices);

// --- vector helpers ---------------------------------------------------------------------------
double jsHypot3(double x, double y, double z);  // V8 Math.hypot (compensated)
std::optional<Point3> normalizeDirection(const Point3& v);
/// Eigenvectors of a symmetric 3x3 covariance (row-major), strongest first, each in a canonical sign.
std::vector<Point3> principalAxesOfCovariance(const std::array<double, 9>& covariance);

}  // namespace craft
