#pragma once

// Master Mold foundation: seed snapshot, source-mesh preflight, planning mesh
// and candidate release directions.
// Ports of master-mold/seed/masterMoldSeed.ts, planning/meshPreflight.ts,
// planning/planningMesh.ts and planning/candidateDirections.ts, keeping the
// operation order so the Float32 world positions, welded ids, patch sets and
// direction lists equal the reference.

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

// --- limits (planning/masterMoldPlanning.contracts.ts: MASTER_PLANNER_LIMITS) ---------------
struct MasterPlannerLimits {
  int maxPlanningPatches = 1024;
  int fullResolutionPlanningTriangleBudget = 50000;
  int maxCandidateDirections = 32;
  double directionDedupAngleDeg = 10;
  int maxNormalClusterSeeds = 8;
  int absoluteMaxWorkingMoldPieces = 6;
};
inline constexpr MasterPlannerLimits kMasterPlannerLimits{};

// --- seed ------------------------------------------------------------------------------------
struct MasterCastingProcessProfile {
  std::string profileId = "genericRigidCast";
  bool flexibleCastTarget = false;
  bool reusableToolingPreferred = true;
  std::optional<double> shrinkCompensationMmPerMm;
  double minimumToolingWallMm = 1;
  std::optional<double> releaseClearanceMm;
  int maximumToolingPieceCount = 4;
  std::string ventRequirementPolicy = "user-managed";
  int maximumWorkingMoldPieceCount = 6;
  bool sacrificialToolingPermitted = true;
};

struct MasterPlanningPreferences {
  std::optional<int> preferredMaximumWorkingMoldPieces;
};

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
  MasterCastingProcessProfile processProfile;
  MasterPlanningPreferences userPreferences;
  std::string projectRevision;
};

struct MasterSeedSourceMesh {
  std::string modelId;
  std::vector<float> positions;  // Float32 like the reference's typed array
  std::vector<std::uint32_t> indices;
  Bounds3 bounds;  // world bounds
  std::string geometryVersion;
};

struct MasterSeedSnapshot {
  int schemaVersion = 1;
  std::string seedId;
  std::string sourceModelId;
  std::string sourceGeometryVersion;
  MasterSeedSourceMesh sourceMesh;
  std::array<double, 16> sourceTransform{};
  Bounds3 sourceBounds;
  std::optional<Point3> printerBuildVolume;
  MasterCastingProcessProfile processProfile;
  MasterPlanningPreferences userPreferences;
  std::string sourceProjectRevision;
};

/// Throws std::invalid_argument with the reference messages on empty,
/// malformed or non-finite geometry.
MasterSeedSnapshot buildMasterMoldSeedSnapshot(const MasterSeedInput& input);

/// Stable-JSON helpers (insertion order, JS number format) and hashStableValues over a prebuilt JSON text.
std::string stableJsonQuote(const std::string& text);
std::string stableJsonNumber(double value);
std::string stableHashOfJson(const std::string& json);
std::string stableJsonVolume(const std::optional<Point3>& volume);

/// Rehydrates world positions (identity transforms return the snapshot as is).
MasterSeedSnapshot worldMeshFromSnapshot(const MasterSeedSnapshot& snapshot);

Bounds3 worldBoundsFromLocal(const Bounds3& localBounds, const std::array<double, 16>& transform);
std::string masterSourceGeometryVersion(const std::string& geometryVersion, const Bounds3& localBounds,
                                        const std::array<double, 16>& transform);
std::string masterSeedStalenessIdentity(const std::string& sourceGeometryVersion,
                                        const std::optional<Point3>& printerBuildVolume,
                                        const MasterCastingProcessProfile& profile,
                                        const MasterPlanningPreferences& preferences);

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
  /// False when the self-intersection pass did not run. The native port does
  /// not implement that pass yet (DECISIONS D-022), so it is always false.
  bool selfIntersectionChecked = false;
};

struct MeshPreflightInput {
  const std::vector<float>* positions = nullptr;
  const std::vector<std::uint32_t>* indices = nullptr;
};

std::vector<std::int32_t> weldedVertexIds(const std::vector<float>& positions, std::size_t vertexCount,
                                          double toleranceMm);
double weldToleranceMmFor(const Bounds3& bounds);
Bounds3 boundsOfPositions(const std::vector<float>& positions, std::size_t vertexCount);
MeshPreflightResult runMeshPreflight(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices);

// --- planning mesh ----------------------------------------------------------------------------
struct PlanningPatch {
  int patchIndex = 0;
  Point3 centroid;
  Point3 normal;
  double areaMm2 = 0;
  int sourceTriangle = 0;
};

struct PlanningMesh {
  std::vector<PlanningPatch> patches;
  std::vector<std::vector<int>> adjacency;
  double totalAreaMm2 = 0;
  Bounds3 bounds;
  std::string sourceGeometryVersion;
  int vertexCount = 0;
  int triangleCount = 0;
};

PlanningMesh buildPlanningMesh(const std::vector<float>& positions, const std::vector<std::uint32_t>& indices,
                               const Bounds3& bounds, const std::string& sourceGeometryVersion);

// --- candidate directions ---------------------------------------------------------------------
struct PlanningCandidateDirection {
  std::string directionId;
  Point3 vector;
  std::string source;  // world-axis | principal-axis | normal-cluster
  std::string origin;
};

double jsHypot3(double x, double y, double z);  // V8 Math.hypot (compensated)
double angleBetweenDeg(const Point3& a, const Point3& b);
std::optional<Point3> normalizeDirection(const Point3& v);
std::vector<Point3> principalAxesOfCovariance(const std::array<double, 9>& covariance);
std::vector<PlanningCandidateDirection> generateCandidateDirections(const PlanningMesh& mesh,
                                                                    const std::vector<float>& worldPositions);

}  // namespace craft
