#pragma once

// Cavity generation: Boolean subtraction of the part solid from the mold
// bodies, with the reference validation and diagnostics.
//
// Ports of (under mold/frontend/src/features/mold-generation/cavity-generation/):
//   cavityGeneration.contracts.ts   data contracts
//   cavityGeneration.input.ts       buildCavityGenerationInput
//   cavityBody.generator.ts         generateCavityBodies + checks
//   cavityGeneration.evaluate.ts    staged evaluation, cancellation, progress
//
// Cavity clearance: zero clearance subtracts the exact part solid; positive
// clearance builds the tool with the reference engines in CavityOffset.h
// (direct Minkowski sphere, or the SDF level-set with fallback).

#include <memory>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Geometry.h"
#include "contracts/Operation.h"
#include "geometry/GeometryTolerance.h"
#include "mold/CavityOffset.h"
#include "mold/PartSolid.h"
#include "mold/ReferenceMold.h"

namespace craft {

inline constexpr int kCavityGenerationSchemaVersion = 1;
inline constexpr double kDefaultCavityClearanceMm = 0;
inline constexpr double kDefaultMinimumWallMm = 1;

/// Mirrors CavityBodyValidation.
struct CavityBodyValidation {
  std::string bodyId;
  std::string bodyName;
  std::string parentBodyId;
  bool cavityAffected = false;
  bool finiteGeometry = true;
  bool validBounds = true;
  bool positiveVolume = true;
  double volumeMm3 = 0;
  std::size_t triangleCount = 0;
  std::size_t connectedComponentCount = 1;
  bool watertight = true;
  bool manifold = true;
  std::size_t openEdgeCount = 0;
  std::size_t nonManifoldEdgeCount = 0;
  double minimumWallMm = 0;
  std::vector<Issue> warnings;
  std::vector<std::string> reasonCodes;
};

/// Mirrors CavityMoldBodyData.
struct CavityMoldBody {
  MoldBody body;
  std::string parentBodyId;
  bool cavityAffected = false;
  CavityBodyValidation validation;
};

/// Mirrors CavitySubtractionDiagnostics.
struct CavitySubtractionDiagnostics {
  std::size_t sourceBodyCount = 0;
  std::size_t affectedBodyCount = 0;
  std::size_t unaffectedBodyCount = 0;
  double originalVolumeMm3 = 0;
  double resultVolumeMm3 = 0;
  double removedVolumeMm3 = 0;
  double cavityToolVolumeMm3 = 0;
};

/// Mirrors CavityGenerationInput (the parts the Boolean stage reads).
struct CavityGenerationInput {
  std::string operationId;
  int generationVersion = 0;
  std::string upstreamInputSignature;
  Bounds3 partBoundingBox;            // K1
  Bounds3 referenceMoldBlockBounds;   // K2
  std::vector<MoldBody> moldBodies;
  double cavityClearanceMm = kDefaultCavityClearanceMm;
  double geometryToleranceMm = 0;     // tolerancePolicy.booleanToleranceMm
  double minimumWallMm = kDefaultMinimumWallMm;
  GeometryTolerancePolicy tolerancePolicy;
};

struct CavityTimings {
  double validationMs = 0;
  double offsetMs = 0;
  double booleanMs = 0;
  double totalMs = 0;
};

/// Mirrors CavityGenerationResult (+ the diagnostics evaluate() attaches).
struct CavityGenerationResult {
  std::string operationId;
  int generationVersion = 0;
  std::string sourceSignature;
  std::string implementation;
  CavityTool cavityTool;
  std::vector<CavityMoldBody> bodies;
  std::vector<Issue> warnings;
  CavitySubtractionDiagnostics subtraction;
  std::string selectedEngine = "exact-zero-clearance";
  std::vector<std::string> engineReasonCodes;
  std::vector<CavityOffsetAttempt> offsetAttempts;
  bool usedFallback = false;
  bool hasDistanceFieldProfile = false;
  DistanceFieldQualityProfile distanceFieldProfile;
  CavityTimings timings;
};

/// Wall distance between the tool and K2, with the reference blockers/warnings.
struct CavityContainment {
  double distance = 0;
  std::vector<Issue> warnings;
  std::vector<Issue> blockers;
};
CavityContainment validateCavityContainment(const CavityGenerationInput& input,
                                            const CavityTool& tool);

/// Throws CodedError("cavity_coordinate_mismatch" / "cavity_no_material_intersection").
void assertCavityCoordinateAlignment(const CavityGenerationInput& input, const CavityTool& tool);

/// Port of generateCavityBodies(). Throws CodedError on every failure the
/// reference throws for; `cancel` is polled between source bodies.
CavityGenerationResult generateCavityBodies(IMeshGeometryEngine& engine,
                                            const CavityGenerationInput& input,
                                            const CavityTool& tool,
                                            const CancellationToken& cancel = {});

// --- end-to-end mold operation -------------------------------------------

/// Everything a worker needs, captured by value so the UI can keep editing.
/// How much memory generating a mold needs, for refusing it before it starts when it cannot fit. Measured (Release, spheres, `Craft --smoke-test
/// --generate-mold`, peak working set of the whole process): 1.31M triangles 1.6 GiB, 2.64M 3.1 GiB, 5.20M 6.3 GiB; at 10.73M (the 512 MiB file limit)
/// the process passed 9.2 GiB after 116 s and was stopped. That is 1.23 to 1.30 KB per triangle, linear; the estimate takes 1.5 KB (about 15 % over
/// the worst measurement) plus 64 MiB for what does not scale with the part.
inline constexpr std::uint64_t kMoldPeakBytesPerTriangle = 1500;
inline constexpr std::uint64_t kMoldFixedPeakBytes = 64ull * 1024 * 1024;
inline std::uint64_t estimateMoldPeakBytes(std::uint64_t triangleCount) { return kMoldFixedPeakBytes + kMoldPeakBytesPerTriangle * triangleCount; }

struct MoldGenerationRequest {
  std::string modelId;
  std::string partGeometryVersion;
  /// Grounded part triangles (bottom on Z = 0, XY centred), millimeters.
  std::shared_ptr<const TriangleSoup> groundedPart;
  double moldClearanceMm = kDefaultReferenceMoldClearanceMm;
  double cavityClearanceMm = kDefaultCavityClearanceMm;
  CavityQualityMode qualityMode = CavityQualityMode::Standard;
  /// Bodies executed by Segmentation. When non-empty they replace the
  /// Cut by Face partition: the definition gets segmentation lineage and the
  /// partition-coverage invariant (an exact partition of the block) is not
  /// asserted. `moldClearanceMm` must be the automatic segmentation clearance
  /// the bodies were planned with.
  std::vector<MoldBody> segmentedBodies;
  /// Enabled planes split the block (Cut by Face); none keeps one whole body.
  std::vector<CuttingPlane> cuttingPlanes;
  int generationVersion = 0;
};

struct MoldGenerationResult {
  ReferenceMoldDefinition definition;  // moldBodies = pre-cavity source bodies
  std::vector<CutPlaneData> cutPlanes;
  std::vector<CuttingPlane> cuttingPlanes;  // the enabled plane records the mold was cut with
  CavityGenerationResult cavity;
  std::vector<Issue> validationWarnings;
};

/// Reference block -> Cut by Face partition -> part-solid validation ->
/// cavity subtraction. Progress stages use the reference names ("validating",
/// "building-offset", "subtracting-body", "validating-results", "complete").
/// Throws CodedError; cancellation surfaces as code "cavity_cancelled".
MoldGenerationResult generateMold(IMeshGeometryEngine& engine, const MoldGenerationRequest& request,
                                  const CancellationToken& cancel = {},
                                  const ProgressCallback& progress = {});

}  // namespace craft
