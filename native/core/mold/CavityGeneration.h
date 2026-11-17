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
// NOT ported yet (see docs/native-migration/PARITY_MATRIX.md): a positive
// cavity clearance, which the reference builds with a Minkowski or
// distance-field offset engine. The native pipeline supports the
// "exact-zero-clearance" engine only and refuses anything else with the coded
// error "cavity_offset_not_ported" instead of approximating it.

#include <memory>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Geometry.h"
#include "contracts/Operation.h"
#include "geometry/GeometryTolerance.h"
#include "mold/PartSolid.h"
#include "mold/ReferenceMold.h"

namespace craft {

inline constexpr int kCavityGenerationSchemaVersion = 1;
inline constexpr double kDefaultCavityClearanceMm = 0;
inline constexpr double kDefaultMinimumWallMm = 1;

/// Mirrors CavityToolData.
struct CavityTool {
  WatertightPartSolid solid;
  double clearanceMm = 0;
  std::string implementationMethod = "exact-watertight-part-solid";
};

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
struct MoldGenerationRequest {
  std::string modelId;
  std::string partGeometryVersion;
  /// Grounded part triangles (bottom on Z = 0, XY centred), millimeters.
  std::shared_ptr<const TriangleSoup> groundedPart;
  double moldClearanceMm = kDefaultReferenceMoldClearanceMm;
  double cavityClearanceMm = kDefaultCavityClearanceMm;
  /// Enabled planes split the block (Cut by Face); none keeps one whole body.
  std::vector<CuttingPlane> cuttingPlanes;
  int generationVersion = 0;
};

struct MoldGenerationResult {
  ReferenceMoldDefinition definition;  // moldBodies = pre-cavity source bodies
  std::vector<CutPlaneData> cutPlanes;
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
