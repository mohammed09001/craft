#pragma once

// Master Mold multi-piece tooling: lock evidence, localized removable core and
// the recursive planar panel planner.
// Ports of engine/lockEvidence.ts and engine/multiPiecePlanner.ts.

#include <optional>
#include <string>
#include <vector>

#include "master/MasterTooling.h"

namespace craft {

// --- lock evidence ---------------------------------------------------------------------------------------------------
struct LockRegion {
  Bounds3 seedBounds;  // exact lock footprint
  Bounds3 bounds;      // grown pull column handed to exact CSG
  std::string evidence;  // release-collision | inaccessible-patch-cluster
  std::optional<int> lockedSampleCount;
};

struct LockEvidence {
  MasterDir pullDirection = MasterDir::PX;
  Point3 pullVector;
  std::vector<LockRegion> regions;
  int lockedSampleCount = 0;
  int sampledTriangleCount = 0;
};

LockEvidence deriveLockRegions(const MasterCastTarget& target, MasterDir pullDirection, const std::optional<Bounds3>& collisionBounds);

// --- planner contracts -------------------------------------------------------------------------------------------------
struct MultiPiecePlan {
  std::vector<MasterToolingPiece> pieces;
  MasterPartingSurface partingSurface;
  CoreAssignmentMode coreMode = CoreAssignmentMode::Split;
  std::vector<MasterReleaseStep> releaseSequence;
  std::vector<MasterToolingRegistrationFeature> registrationFeatures;
  std::vector<MasterVentFeature> ventFeatures;
  std::optional<std::string> registrationNote;
  double cost = 0;
};

struct MultiPiecePlanAttempt {
  std::optional<MultiPiecePlan> plan;
  std::optional<std::string> rejectionReason;
};

struct CandidateSplit {
  MasterDir axis = MasterDir::PX;  // orientation anchor (nearest world axis to the normal)
  double coordinateMm = 0;
  std::string origin;  // target-feature | tool-feature | build-volume | oblique-normal-cluster | span-fraction | target-face
  std::optional<Point3> normal;
  std::optional<Point3> point;
};

std::vector<double> featureLevels(const MeshPayload& mesh, int axis, double min, double max);
MasterDir flipDirection(MasterDir direction);
std::vector<CandidateSplit> candidateSplits(const MasterCastTarget& target, const MeshPayload* coreToolMesh, const std::optional<Point3>& buildVolume);

MultiPiecePlanAttempt planLocalizedRemovableCore(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                                 const MasterToolingParameters& parameters, const LockEvidence& lockEvidence,
                                                 const std::optional<Point3>& assignedDirection, const std::optional<Point3>& buildVolume,
                                                 const std::vector<MasterVentRecommendation>& ventRecommendations);

MultiPiecePlanAttempt attemptRecursiveSplit(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace, const CandidateSplit& split,
                                            const MasterToolingParameters& parameters, const MeshPayload* coreToolMesh, CoreAssignmentMode coreMode,
                                            int maxPieces, const std::optional<Point3>& assignedDirection, const std::optional<Bounds3>& functionalBounds,
                                            const std::optional<Point3>& buildVolume, const std::vector<MasterVentRecommendation>& ventRecommendations);

MultiPiecePlanAttempt planMultiPieceTooling(IMeshGeometryEngine& engine, const MasterCastTarget& target, MasterDir pourFace,
                                            const MasterToolingParameters& parameters, const MeshPayload* coreToolMesh,
                                            const std::optional<Point3>& assignedDirection, const std::optional<Bounds3>& functionalBounds,
                                            const std::optional<Point3>& buildVolume, const std::vector<MasterVentRecommendation>& ventRecommendations);

}  // namespace craft
