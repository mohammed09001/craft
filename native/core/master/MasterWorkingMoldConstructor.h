#pragma once

// Master Mold working-mold constructor, planar mode.
// Port of planning/workingMoldConstructor.ts for the sequential half-space
// path the engine tries first: envelope minus the clearance-offset part,
// carved by ordered half-space prisms, split into connected pieces, fitted
// with alignment pins, release-verified by exact translation sweeps and
// checked against the assembly invariants.
//
// Also ported: the engine's fallback construction modes for hard parts -- height-field and
// multi-neighbor parting tools, the simultaneous grid partition and the
// multi-label partition. NOT ported: the volumetric partition (the engine
// never reaches it).

#include <optional>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Operation.h"
#include "master/MasterPlanning.h"

namespace craft {

struct PlannedPieceRegion {
  Point3 releaseDirection;
  /// Piece occupies dot(p, direction) >= offsetMm minus earlier pieces; none = catch-all remainder.
  struct Plane { Point3 direction; double offsetMm = 0; };
  std::optional<Plane> plane;
  /// Height-field cutting tool: one curve group per neighbour this piece borders (`plane` must also be set).
  std::optional<std::vector<std::vector<Point3>>> curve;
  /// Simultaneous grid partition: this piece's own patch centroids and every other piece's.
  struct Grid { std::vector<Point3> ownPoints, otherPoints; double ownPatchRadiusMm = 0; };
  std::optional<Grid> grid;
  /// Multi-label partition: this piece's own source triangles (every piece must carry this).
  std::optional<std::vector<int>> multiLabelTriangles;
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
/// Exact translation sweep (masterMoldDemold.verifier.ts verifyDemoldTranslationByVector). `removable` is exact. `firstCollisionDistanceMm` is
/// the bisected distance of first contact only when `wantCollisionDistance` is set (twelve more Booleans); otherwise it is the first colliding
/// sample, which no caller that only asks "can it be removed" looks at. A step whose moved bounding box is clearly clear of the tool's cannot
/// collide, so its Boolean is skipped (P2-5: the same answer, far fewer exact operations).
DemoldVerificationResult verifyDemoldTranslationByVector(IMeshGeometryEngine& engine, const SolidPtr& tool, const SolidPtr& target,
                                                         const Point3& direction, double clearanceDistanceMm, double toleranceMm,
                                                         double volumeToleranceMm3, int coarseSampleCount = 32, bool wantCollisionDistance = false);

/// Height-field cutting tool following one piece's parting curve near the part and exactly flat beyond `outerRadiusMm`.
SolidPtr heightFieldPartingSolid(IMeshGeometryEngine& engine, const std::vector<Point3>& curvePoints, const Point3& flatDirection, double flatOffsetMm,
                                 const Bounds3& bounds, double toleranceMm, std::optional<double> outerRadiusMm = std::nullopt);
SolidPtr multiNeighborHeightFieldSolid(IMeshGeometryEngine& engine, const std::vector<std::vector<Point3>>& curveGroups, const Point3& flatDirection,
                                       double flatOffsetMm, const Bounds3& bounds, double toleranceMm);
SolidPtr localBoundedAssignmentSolid(IMeshGeometryEngine& engine, const std::vector<Point3>& ownPoints, const std::vector<Point3>& otherPoints,
                                     const Point3& direction, const Bounds3& bounds, double toleranceMm, double ownPatchRadiusMm);

/// Throws std::runtime_error with the reference's messages on any construction or verification failure.
/// A cancelled `cancel` token raises CodedError("cancelled") from the long multi-label stage.
WorkingMoldConstructionOutput constructWorkingMold(IMeshGeometryEngine& engine, const WorkingMoldConstructionInput& input,
                                                   const CancellationToken& cancel = {});

}  // namespace craft
