#pragma once

// Master Mold working-mold constructor, planar mode.
// Port of planning/workingMoldConstructor.ts for the sequential half-space
// path the engine tries first: envelope minus the clearance-offset part,
// carved by ordered half-space prisms, split into connected pieces, fitted
// with alignment pins, release-verified by exact translation sweeps and
// checked against the assembly invariants.
//
// NOT ported (they need Manifold CrossSection / level-set partitions and are
// the engine's fallbacks for hard parts): height-field and multi-neighbor
// parting tools, the simultaneous grid partition, volumetric and multi-label
// partitions. PlannedPieceRegion therefore carries only the planar plane.

#include <optional>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "master/MasterPlanning.h"

namespace craft {

struct PlannedPieceRegion {
  Point3 releaseDirection;
  /// Piece occupies dot(p, direction) >= offsetMm minus earlier pieces; none = catch-all remainder.
  struct Plane { Point3 direction; double offsetMm = 0; };
  std::optional<Plane> plane;
};

struct WorkingMoldConstructionInput {
  std::vector<float> sourcePositions;
  std::vector<std::uint32_t> sourceIndices;
  Bounds3 sourceBounds;
  double releaseClearanceMm = 0;
  double minimumToolingWallMm = 1;
  std::vector<PlannedPieceRegion> pieces;
  std::vector<Point3> extraReleaseDirections;
  bool useGreedyReleaseOrder = false;
};

struct WorkingMoldPieceTarget {
  std::string pieceId;
  std::string name;
  MeshPayload mesh;
  Bounds3 bounds;
  double volumeMm3 = 0;
  std::string geometryVersion;  // deterministic token, not equal to the reference's (D-005 style)
  Point3 assignedDirection;
  std::string directionId;
  int releaseOrder = 0;
  std::vector<std::string> interfaceIds;
  int triangleCount = 0;
  bool watertight = false;
  bool manifold = false;
};

struct WorkingMoldReleaseStep {
  int stepIndex = 0;
  int pieceIndex = 0;
  Point3 direction;
  double clearanceDistanceMm = 0;
  bool collisionVerified = false;
};

struct WorkingMoldRegistrationFeature {
  std::string featureId;
  std::string interfaceId;
  std::string kind;  // pin
  int malePieceIndex = 0;
  int femalePieceIndex = 0;
  Point3 position;
  Point3 direction;
};

struct WorkingMoldRegistrationPlan {
  std::vector<WorkingMoldRegistrationFeature> features;
  std::optional<std::string> reason;
};

struct WorkingMoldConstructionOutput {
  std::vector<WorkingMoldPieceTarget> pieces;
  std::vector<WorkingMoldReleaseStep> releaseSequence;
  WorkingMoldRegistrationPlan registrationPlan;
  int releaseSweepCount = 0;
};

struct OrthonormalBasis { Point3 u, v, w; };
OrthonormalBasis basisAround(const Point3& w);

double workingMoldEnvelopeWallMm(const Bounds3& partBounds, double minimumToolingWallMm);
Bounds3 inflatedBounds(const Bounds3& bounds, double wallMm);

MeshPayload halfSpacePrismPayload(const Point3& direction, double offsetMm, const Bounds3& bounds);
MeshPayload cylinderPrismPayload(const Point3& direction, const Point3& center, double radiusMm, double lengthMm, int segments);

struct DemoldVerificationResult {
  bool removable = false;
  std::optional<double> firstCollisionDistanceMm;
};
/// Exact translation sweep (masterMoldDemold.verifier.ts verifyDemoldTranslationByVector).
DemoldVerificationResult verifyDemoldTranslationByVector(IMeshGeometryEngine& engine, const SolidPtr& tool, const SolidPtr& target,
                                                         const Point3& direction, double clearanceDistanceMm, double toleranceMm,
                                                         double volumeToleranceMm3, int coarseSampleCount = 32);

/// Throws std::runtime_error with the reference's messages on any construction or verification failure.
WorkingMoldConstructionOutput constructWorkingMold(IMeshGeometryEngine& engine, const WorkingMoldConstructionInput& input);

}  // namespace craft
