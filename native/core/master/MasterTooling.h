#pragma once

// Master Mold tooling stage: engine contracts, pour-face planning, surface
// accessibility, vent proofs and the one-piece case construction.
// Ports of master-mold/engine/contracts.ts, pourFace.ts, releaseAnalysis.ts
// and the one-piece subset of toolingConstruction.ts.
//
// NOT ported here: planarly split case pieces, tooling registration pins,
// the localized removable core and the recursive multi-piece planner
// (multiPiecePlanner.ts, lockEvidence.ts). A part whose one-piece case cannot
// be released therefore gets a structured "multi-piece tooling is not
// available" rejection natively where the reference may find a multi-piece
// plan.

#include <array>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "master/MasterPlanning.h"

namespace craft {

// --- directions ------------------------------------------------------------------------------------
enum class MasterDir { PX, NX, PY, NY, PZ, NZ };
inline constexpr std::array<MasterDir, 6> kMasterDirections = {MasterDir::PX, MasterDir::NX, MasterDir::PY, MasterDir::NY, MasterDir::PZ, MasterDir::NZ};

const char* masterDirName(MasterDir d);       // "+X" ...
Point3 masterDirVector(MasterDir d);
int masterDirAxis(MasterDir d);               // 0,1,2
bool masterDirPositive(MasterDir d);
MasterDir masterDirFlip(MasterDir d);
Bounds3 masterStockBoundsFor(const Bounds3& bounds, MasterDir direction, double wallMm, double bottomMm);

// --- contracts ---------------------------------------------------------------------------------------
struct MasterCastTarget {
  std::string moldPartId, moldPartName;
  MeshPayload mesh;
  Bounds3 bounds;
  double volumeMm3 = 0;
  std::string geometryVersion;
  std::vector<std::string> warnings;
};

struct MasterPourFaceCandidate {
  MasterDir direction = MasterDir::PX;
  std::string source;  // semantic-axis | planar-face-normal | user-override
  double exposedOpeningAreaMm2 = 0;
  double castingDepthMm = 0;
  bool valid = false;
  std::optional<std::string> rejectionReason;
  double score = 0;
};

struct MasterVentRecommendation {
  std::string recommendationId;
  int pocketIndex = 0;
  Point3 pocketPosition;
  std::string message;
};

struct MasterVentFeature {
  std::string featureId;
  Point3 start, end;
  double radiusMm = 0;
  std::string proof;  // mesh-verified | aabb-conservative
};

struct MasterVentPlan {
  std::string status;  // clear | user-review
  std::vector<MasterVentFeature> features;
  std::vector<MasterVentRecommendation> unresolvedRecommendations;
};

struct MasterPourFaceDecision {
  std::optional<MasterDir> selected;
  std::optional<MasterDir> castingOrientation;
  double score = 0;
  std::vector<MasterPourFaceCandidate> candidates;
  std::vector<std::string> fillabilityWarnings;
  MasterVentPlan ventPlan;
};

struct MasterReleaseDirection {
  MasterDir direction = MasterDir::PX;
  double accessibilityFraction = 0;
  double undercutAreaMm2 = 0;
};

struct MasterSurfaceAccessibility {
  std::vector<MasterReleaseDirection> directions;
  bool onePieceReleaseFeasible = false;
};

struct MasterToolingPiece {
  std::string pieceId, name;
  MeshPayload mesh;
  Bounds3 bounds;
  double volumeMm3 = 0;
  int triangleCount = 0;
  bool watertight = false, manifold = false;
  std::string releaseDirection;  // direction name
  std::vector<std::string> regions;
  std::vector<std::string> toolingRegistrationFeatureIds;
  bool fitsBuildVolume = true;
};

struct MasterReleaseStep {
  int stepIndex = 0;
  std::string pieceId;
  std::string direction;
  double clearanceDistanceMm = 0;
  bool collisionVerified = false;
};

struct MasterToolingAssembly {
  std::vector<MasterToolingPiece> pieces;
  std::string coreMode = "split";
  std::vector<MasterReleaseStep> releaseSequence;
};

struct MasterToolingSet {
  std::string moldPartId, moldPartName, castTargetVersion, sourceSignature;
  MasterPourFaceDecision pourFaceDecision;
  MasterSurfaceAccessibility accessibility;
  std::string releaseMode;  // one-piece | multi-piece | sacrificial-recommended
  MasterToolingAssembly assembly;
  std::vector<std::string> warnings;
  std::string fingerprint;
};

struct MasterToolingParameters {
  double caseWallThicknessMm = 3;
  double caseBaseThicknessMm = 3;
  double pourOpeningMarginMm = 2;
  double partingFlangeWidthMm = 0;
  double geometryToleranceMm = 1e-3;
  int maxToolingPieces = 4;
};
MasterToolingParameters toolingParametersFromProfile(const MasterCastingProcessProfile& profile);

// --- pour face ------------------------------------------------------------------------------------------
struct AirPocket {
  Point3 centroid;
  int sampleCount = 0;
  Bounds3 bounds;
};

struct PourFacePlanInput {
  const MasterCastTarget* castTarget = nullptr;
  Bounds3 negativeToolBounds;
  double geometryToleranceMm = 1e-3;
  std::optional<MasterDir> userOverride;
};

std::array<double, 6> planarFaceExposureByDirection(const MasterCastTarget& target);
std::vector<MasterDir> candidateDirections(const MasterCastTarget& target, std::optional<MasterDir> userOverride);
std::vector<AirPocket> sealedAirPockets(const MasterCastTarget& target, MasterDir upDirection);
MasterPourFaceDecision planPourFace(const PourFacePlanInput& input);

// --- release analysis -------------------------------------------------------------------------------------
MasterSurfaceAccessibility analyzeSurfaceAccessibility(const MasterCastTarget& target);

// --- vents ----------------------------------------------------------------------------------------------------
std::vector<MasterVentFeature> safeVentPathsFor(const Bounds3& targetBounds, const Bounds3& caseBounds, const Bounds3& protectedBounds,
                                                const std::vector<MasterVentRecommendation>& recommendations, double wallThicknessMm,
                                                const MeshPayload& targetMesh, const MeshPayload* protectedMesh);

// --- one-piece case ------------------------------------------------------------------------------------------------
struct OnePieceAttempt {
  bool ok = false;
  std::vector<MasterToolingPiece> pieces;
  std::vector<MasterReleaseStep> releaseSequence;
  std::vector<MasterVentFeature> ventFeatures;
};

/// constructCasePiece (no split) + exact release sweep + assembled-negative check.
OnePieceAttempt attemptOnePiece(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                const MasterToolingParameters& parameters,
                                const std::vector<MasterVentRecommendation>& recommendations, const MeshPayload& protectedMesh);

}  // namespace craft
