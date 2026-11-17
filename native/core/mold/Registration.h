#pragma once

// Registration: complementary linear tongue-and-groove alignment keys across
// every mating interface of the mold bodies.
//
// Ports of mold-generation/registration/: registration.contracts.ts,
// registrationTolerance.policy.ts, registrationSizing.policy.ts,
// registrationPlanner.ts, registrationGeometryValidation.ts,
// RegistrationGenerationService.ts and registrationLifecycle.ts.
//
// Identity: interface and feature ids hash the same strings as the reference
// (JavaScript number formatting is reproduced), so ids are comparable with
// reference output. Body geometry-version tokens are native tokens (D-005).
// Ordering of interfaces/bodies by id uses byte order, not ICU localeCompare
// (D-014); the two agree for the id shapes the app generates.

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Geometry.h"
#include "contracts/Operation.h"
#include "mold/ReferenceMold.h"
#include "mold/SprueGeneration.h"

namespace craft {

enum class KeySide { Left, Right, Top, Bottom };
const char* keySideName(KeySide side);

struct RegistrationInterface {
  std::string id;
  std::string bodyAId;
  std::string bodyBId;
  std::string role = "primary-parting";
  Axis axis = Axis::Z;
  double planeCoordinateMm = 0;
  Bounds3 matingBounds;
  Point3 assemblyDirection;
};

struct LinearKeyGeometry {
  double widthMm = 0;
  double depthMm = 0;
  double lengthMm = 0;
  double taperAngleDeg = 10;
  double leadInMm = 0;
  double rootFilletMm = 0.5;
};

struct RegistrationFeature {
  std::string id;
  std::string interfaceId;
  std::string logicalKeyId;
  int segmentIndex = 0;
  KeySide side = KeySide::Left;
  std::string maleBodyId;
  std::string femaleBodyId;
  Point3 startPoint, endPoint, anchor, direction, normal;
  LinearKeyGeometry geometry;
  double clearanceMm = 0;
  std::string status = "planned";  // planned | generated | skipped
};

struct RegistrationManufacturingProfile {
  std::string process = "unknown";  // fdm | resin | unknown
  std::optional<double> nozzleDiameterMm, layerHeightMm, xyAccuracyMm;
};

struct RegistrationTolerancePolicy {
  std::string policyId;
  double radialClearanceMm = 0;
  double booleanToleranceMm = 0;
  double minimumWallMm = 0;
  double cavitySafetyMarginMm = 0;
  double outerEdgeMarginMm = 0;
  double minimumFeatureRadiusMm = 0;
  double maximumFeatureRadiusMm = 0;
};
RegistrationTolerancePolicy resolveRegistrationTolerance(const std::optional<RegistrationManufacturingProfile>& profile);

enum class ProfileSearchOrder { SmallestFirst, PreferredFirst };
enum class PlacementStrategy { EdgeCorridor, CavityWallCentered };
struct RegistrationSizingPolicy {
  std::string policyId = "registration-sizing-normal-v1";
  double preferredNominalWidthMm = 4.5;
  ProfileSearchOrder profileSearchOrder = ProfileSearchOrder::SmallestFirst;
  PlacementStrategy placementStrategy = PlacementStrategy::EdgeCorridor;
};
inline constexpr double kRegistrationManufacturingMinimumWidthMm = 2.4;
RegistrationSizingPolicy normalMoldRegistrationSizingPolicy();
RegistrationTolerancePolicy applyRegistrationSizingToTolerancePolicy(const RegistrationTolerancePolicy& tolerance,
                                                                    const RegistrationSizingPolicy& sizing);

struct RegistrationProtectedRegion {
  std::string id;
  std::string kind;  // cavity | sprue | vent | functional
  Bounds3 bounds;
  std::optional<MeshPayload> mesh;
};

struct RegistrationExclusionZone {
  Point3 anchor;
  double radiusMm = 0;
};

struct RegistrationLayoutAttempt {
  std::vector<RegistrationFeature> candidates;
  double radiusMm = 0;
  std::vector<std::size_t> requestedCounts;
};

std::vector<RegistrationInterface> detectMatingInterfaces(const std::vector<MoldBody>& bodies, double toleranceMm);
std::optional<RegistrationInterface> detectPrimaryMatingInterface(const std::vector<MoldBody>& bodies, double toleranceMm);

std::vector<RegistrationLayoutAttempt> planRegistrationLayout(
    const RegistrationInterface& moldInterface, const std::vector<MoldBody>& bodies,
    const std::vector<RegistrationProtectedRegion>& protectedRegions, const RegistrationTolerancePolicy& policy,
    const std::vector<RegistrationExclusionZone>& exclusionZones = {},
    const std::vector<RegistrationInterface>* allInterfaces = nullptr,
    const RegistrationSizingPolicy& sizingPolicy = normalMoldRegistrationSizingPolicy());

/// Wall clearance of a point to every protected region mesh (infinity when
/// none carries a mesh). Port of buildWallThicknessField().
class WallThicknessField {
 public:
  WallThicknessField(const std::vector<RegistrationProtectedRegion>& regions, double toleranceMm);
  ~WallThicknessField();
  WallThicknessField(WallThicknessField&&) noexcept;
  double clearanceAt(const Point3& p) const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
std::vector<RegistrationFeature> filterByWallThickness(const std::vector<RegistrationFeature>& candidates,
                                                       const RegistrationInterface& moldInterface,
                                                       const WallThicknessField& field, const MoldBody& femaleBody,
                                                       const RegistrationTolerancePolicy& policy);

struct RegistrationAttemptReport {
  double radiusMm = 0;
  std::size_t requestedCount = 0;
  std::size_t selectedCount = 0;
};

struct RegistrationReport {
  std::string sourceRevision;
  std::string status;      // generated | blocked
  std::string reasonCode;  // registration_*
  std::string message;
  std::vector<RegistrationInterface> interfaces;
  std::vector<RegistrationFeature> features;
  RegistrationTolerancePolicy tolerancePolicy;
  std::vector<RegistrationAttemptReport> attempts;
};

struct RegistrationRequest {
  std::string sourceRevision;
  std::vector<MoldBody> bodies;
  std::vector<RegistrationProtectedRegion> protectedRegions;
  std::optional<RegistrationManufacturingProfile> manufacturingProfile;
  RegistrationSizingPolicy sizingPolicy = normalMoldRegistrationSizingPolicy();
  bool eligible = true;
};

struct RegistrationResult {
  std::vector<MoldBody> bodies;  // unchanged when blocked
  RegistrationReport report;
};
RegistrationResult generateRegistration(IMeshGeometryEngine& engine, const RegistrationRequest& request);

// --- lifecycle ---------------------------------------------------------------

struct RegistrationDependencyInput {
  std::vector<MoldBody> bodies;
  std::string definitionId;
  Bounds3 selectionBoxBounds;
  Bounds3 referenceBlockBounds;
  double referenceBlockClearanceMm = 0;
  std::vector<CuttingPlane> cuttingPlanes;
  const MeshPayload* cavityMesh = nullptr;  // null when no cavity exists
  Bounds3 cavityBounds;
  double cavityClearanceMm = 0;
  std::string cavityMethod;
  std::string cavityRevision;
  std::vector<SprueDefinition> sprues;
  std::optional<RegistrationManufacturingProfile> manufacturingProfile;
  RegistrationSizingPolicy sizingPolicy = normalMoldRegistrationSizingPolicy();
};

struct RegistrationDependencySnapshot {
  std::string revision;
  std::vector<MoldBody> bodies;
  std::vector<RegistrationInterface> interfaces;
  std::vector<RegistrationProtectedRegion> protectedRegions;
  std::optional<RegistrationManufacturingProfile> manufacturingProfile;
  RegistrationSizingPolicy sizingPolicy;
};
RegistrationDependencySnapshot buildRegistrationDependencySnapshot(const RegistrationDependencyInput& input);

struct DerivedRegistrationState {
  std::string status = "unavailable";  // unavailable | generated | blocked | failed
  std::string revision;
  std::vector<MoldBody> bodies;
  std::optional<RegistrationReport> report;
};
/// Sole entry point that produces final derived registration geometry. Never
/// throws: failures become a "failed" state that preserves the input bodies.
DerivedRegistrationState generateDerivedRegistration(IMeshGeometryEngine& engine,
                                                     const RegistrationDependencySnapshot& snapshot);

/// JavaScript Number-to-string conversion for ids (shortest round trip,
/// decimal between 1e-6 and 1e21). Exposed for tests.
std::string jsNumberToString(double value);

}  // namespace craft
