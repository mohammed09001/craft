#pragma once

// Segmentation: split an oversized mold block into printer-fit pieces.
//
// Ports of mold-generation/segmentation/: fitAnalysis.ts, domain/* (contracts,
// baseline grid algorithm, objective scoring, planSegmentation, axis
// ownership, extension placement and merge), application/segmentationSourceSnapshot.ts
// (preliminary whole-block source), application/segmentationPreview.ts,
// execution/* (policy, preflight, commit gate, plane executor).
//
// Identity: plan, boundary, segment, request and body ids hash canonical JSON
// exactly like the reference (see SegmentationIdentity.h), so they equal the
// reference ids for equal inputs. Keys are ordered by localeKeyLess, an ASCII
// approximation of ICU collation (docs D-017).

#include <map>
#include <optional>
#include <string>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Geometry.h"
#include "contracts/Operation.h"
#include "mold/ReferenceMold.h"
#include "mold/Registration.h"
#include "mold/SegmentationIdentity.h"

namespace craft {

// --- fit analysis -------------------------------------------------------------

enum class FitStatus { NotApplicable, Fits, DoesNotFit };
struct FitStageResult {
  FitStatus status = FitStatus::NotApplicable;
  bool axisFit[3] = {true, true, true};
  std::vector<Axis> failingAxes;
};
std::optional<Point3> sizeOfBounds(const Bounds3& bounds);
FitStageResult evaluatePrintableSize(const Point3& size, const Point3& printerVolume);

// --- contracts ----------------------------------------------------------------

inline constexpr int kSegmentationSchemaVersion = 1;
inline constexpr const char* kSegmentationPolicyId = "printer-fit-baseline";
inline constexpr int kSegmentationPolicyVersion = 1;
inline constexpr const char* kBaselineAlgorithmId = "deterministic-axis-grid-bounds-baseline";
inline constexpr int kBaselineAlgorithmVersion = 1;

struct SegmentationIssue {
  bool blocker = false;  // severity: blocker | warning
  std::string reasonCode;
  std::string message;
  std::vector<std::pair<std::string, Json>> details;
};

struct SegmentationSourceIdentity {
  double documentRevision = 0;
  std::string documentFingerprint, resultRequestId, definitionId, modelId, frameId, bodySignature,
      protectedRegionSignature;
};
Json toJson(const SegmentationSourceIdentity& identity);

struct SegmentationProtectedRegion {
  std::string id;
  std::string kind;
  std::string source;  // cavity | sprue | registration | manufacturing
  std::string provenanceId;
  std::vector<std::string> bodyIds;
  Bounds3 bounds;
  std::string hardness;  // hard | advisory
  double clearanceMm = 0;
};
Json toJson(const SegmentationProtectedRegion& region);

struct ProtectedRegionEvidence {
  std::string status;  // complete | incomplete
  std::string reason;
};

struct SegmentationSourceSnapshot {
  SegmentationSourceIdentity identity;
  std::vector<MoldBody> bodies;
  Bounds3 aggregateBounds;
  std::vector<SegmentationProtectedRegion> protectedRegions;
  ProtectedRegionEvidence protectedRegionEvidence;
  std::vector<SegmentationIssue> warnings;
};

struct SegmentationRequest {
  std::string requestId;
  SegmentationSourceIdentity source;
  Point3 printerVolume;
  std::string printerVolumeSignature, settingsSignature, policyId;
  int policyVersion = kSegmentationPolicyVersion;
};

struct BoundaryIntent {
  std::string id;
  Axis axis = Axis::X;
  double coordinateMm = 0;
  int ordinal = 0;
  int sequenceIndex = 0;
  bool broadcastToAllStraddlingBodies = false;  // extension boundary only
  bool allStraddling = false;                   // executionTargeting === "all-straddling"
};
Json toJson(const BoundaryIntent& boundary);

struct SegmentDefinition {
  std::string id;
  int ordinal = 0;
  int gridIndex[3] = {0, 0, 0};
  std::vector<std::string> sourceBodyIds;
  Bounds3 predictedBounds;
  FitStageResult predictedFit;
  std::vector<std::string> boundaryIntentIds;
};

struct CandidateScore {
  int hardFailureCount = 0;
  int segmentCount = 0;
  double minimumPrintableMarginMm = 0;
  int declaredRisk = 0;
  double weightedObjectiveScore = 0;
};

struct SegmentationValidation {
  std::string status;  // planning-valid | invalid | not-run
  std::string stage = "result-validation";
  double sourceRevision = 0;
  std::string sourceFingerprint;
  std::string printableByBounds, geometryExecution, manufacturingSafety;
  std::vector<SegmentationIssue> warnings, blockers;
};

struct SegmentationPlan {
  std::string id;
  SegmentationRequest request;
  std::string algorithmId = kBaselineAlgorithmId;
  int algorithmVersion = kBaselineAlgorithmVersion;
  std::string planningBasis = "bounds-only";
  std::vector<Axis> requiredAxes;
  int perAxisSegmentCount[3] = {1, 1, 1};
  int estimatedMinimumSegmentCount = 1;
  std::vector<std::string> candidateIds, rejectedCandidateIds;
  std::string selectedCandidateId;
  std::vector<BoundaryIntent> boundaries;
  std::vector<SegmentDefinition> segments;
  CandidateScore score;
  SegmentationValidation validation;
  std::vector<std::string> extensionObligations;
};

/// Result of planning. `status`: planned | not-required | failed | stale | unsupported.
struct SegmentationPlanningResult {
  std::string status;
  std::string stage;
  std::string reasonCode;
  std::vector<SegmentationIssue> issues;
  std::optional<SegmentationRequest> request;
  std::optional<SegmentationPlan> plan;
  std::optional<SegmentationValidation> validation;  // for not-required
};

// --- planning -------------------------------------------------------------------

SegmentationRequest createSegmentationRequest(const SegmentationSourceSnapshot& source, const Point3& printerVolume);
SegmentationPlanningResult planSegmentation(const SegmentationRequest& request, const SegmentationSourceSnapshot& source);

bool coordinateConflictsWithRegion(const SegmentationProtectedRegion& region, Axis axis, double coordinateMm);
double minimumPrintableMargin(const std::vector<SegmentDefinition>& segments, const Point3& printerVolume);

struct AxisOwnership {
  std::vector<Axis> algorithmUsedAxes, userExtensionAxes, combinedUsedAxes, availableAxes;
};
AxisOwnership deriveAxisOwnership(const std::vector<Axis>& algorithmAxes, const std::vector<Axis>& userAxes);

double suggestExtensionAxisPosition(const SegmentationSourceSnapshot& source, Axis axis);
SegmentationPlan mergeExtensionBoundary(const SegmentationPlan& plan, Axis axis, double coordinateMm,
                                        const std::vector<SegmentationProtectedRegion>& protectedRegions = {});

// --- source snapshots -------------------------------------------------------------

struct PreliminarySource {
  SegmentationSourceSnapshot snapshot;
  ReferenceMoldDefinition definition;
};
/// The whole reference block spanning the imported model, planned with the
/// automatic (>= 100 mm) clearance. nullopt when the bounds cannot produce a frame.
std::optional<PreliminarySource> capturePreliminaryWholeBlockSnapshot(const Bounds3& groundedWorldBounds,
                                                                      double clearanceMm,
                                                                      const std::string& modelId = "imported-model");

/// Facts of a committed final mold that become protected regions.
struct CommittedMoldFacts {
  std::vector<MoldBody> bodies;
  bool hasCavity = false;
  Bounds3 cavityBounds;
  double cavityClearanceMm = 0;
  std::string cavitySourceSignature;
  std::vector<SprueDefinition> sprues;
  std::vector<RegistrationFeature> generatedFeatures;
};
std::vector<SegmentationProtectedRegion> protectedRegionsOf(const CommittedMoldFacts& facts);

/// What the reference reads from the split-face store's last committed final mold result (segmentationSourceSnapshot.ts): the facts
/// above, the definition the mold was built on (its block and selection box decide whether its regions can be projected onto the
/// automatic block) and the identity of the committed document. `current` is false when that result no longer matches the mold document
/// or the mold is being evaluated again (the reference's stale_source_revision).
struct CommittedMoldSource {
  CommittedMoldFacts facts;
  ReferenceMoldDefinition definition;
  double sourceRevision = 0;
  std::string sourceFingerprint, resultRequestId;
  bool current = true;
};

struct SegmentationSourceResult {
  std::string status;  // ready | failed | stale
  std::string reasonCode;
  std::vector<SegmentationIssue> issues;  // the blockers, when not ready
  std::optional<PreliminarySource> source;
};

/// readCurrentSegmentationSourceSnapshot. The automatic whole-block source stays the printable subject; a committed mold only contributes
/// its protected regions (advisory: cavity, sprues, generated registration features), and only when it has some and was built on the
/// same block and selection box. A committed result that is stale or structurally invalid blocks planning instead of being replaced by
/// the automatic source. Without an automatic source the committed one is used as it is.
SegmentationSourceResult readSegmentationSource(const std::optional<PreliminarySource>& preliminary,
                                                const std::optional<CommittedMoldSource>& committed);

// --- execution -----------------------------------------------------------------------

struct SegmentationExecutionPolicy {
  std::string id = "manifold-plane-split";
  int version = 1;
  std::string toleranceVersion = "scale-aware-v1";
  double linearToleranceMm = 0, boundsToleranceMm = 0, sideToleranceMm = 0, volumeToleranceMm3 = 0,
         overlapToleranceMm3 = 0;
};
SegmentationExecutionPolicy createSegmentationExecutionPolicy(const Bounds3& bounds, double sourceVolumeMm3);

struct SupportedPlaneCutIntent {
  BoundaryIntent boundary;
  std::string boundaryId;
  Axis axis = Axis::X;
  double coordinateMm = 0;
  Point3 normal;
  double originOffset = 0;
};

struct SegmentationExecutionRequest {
  std::string id;
  std::string segmentationRequestId, acceptedPlanId;
  SegmentationPlan acceptedPlan;
  double documentRevision = 0;
  std::string documentFingerprint, committedResultRequestId;
  MoldBody sourceBody;  // geometryVersion required
  std::string bodySignature;
  Point3 printerVolume;
  std::string printerVolumeSignature;
  Axis executionAxis = Axis::X;
  std::vector<SupportedPlaneCutIntent> planes;
  std::string planeSequenceSignature;
  SegmentationExecutionPolicy policy;
};

struct SegmentationExecutionDiagnostic {
  std::string stage, reasonCode, message;
  std::optional<Axis> axis;
  std::string boundaryId;
  int cutIndex = -1, cutCount = -1;
};

struct SegmentationOutputProvenance {
  std::string sourceBodyId, sourceGeometryVersion, segmentationRequestId, acceptedPlanId;
  Axis axis = Axis::X;
  std::string boundaryId, side, parentBodyId, parentGeometryVersion;
  int cutIndex = 0;
  std::vector<std::string> boundaryLineage;
  std::string executionRequestId, executionPolicyId;
  int executionPolicyVersion = 1;
};

struct SegmentationExecutedBody {
  MoldBody body;
  SegmentationOutputProvenance provenance;
};

struct SegmentationCutValidation {
  int cutIndex = 0;
  Axis axis = Axis::X;
  std::string boundaryId, inputBodyId;
  double inputVolumeMm3 = 0, outputVolumeMm3 = 0, volumeDeltaMm3 = 0, overlapVolumeMm3 = 0;
};

struct SegmentationExecutionValidation {
  double sourceVolumeMm3 = 0, outputVolumeMm3 = 0, volumeDeltaMm3 = 0, overlapVolumeMm3 = 0;
  std::vector<SegmentationCutValidation> cuts;
  SegmentationExecutionPolicy policy;
};

/// `status`: executed | failed | unsupported | cancelled | stale.
struct SegmentationExecutionResult {
  std::string status;
  std::string stage;
  std::string reasonCode;
  std::vector<SegmentationIssue> issues;
  std::vector<SegmentationExecutionDiagnostic> diagnostics;
  std::optional<SegmentationExecutionRequest> executionRequest;
  std::vector<SegmentationExecutedBody> bodies;
  std::optional<SegmentationExecutionValidation> validation;
};

struct SegmentationPreflight {
  bool ok = false;
  SegmentationExecutionRequest request;
  SegmentationExecutionResult failure;  // when !ok
};
SegmentationPreflight createSegmentationExecutionRequest(const SegmentationPlan& plan,
                                                         const SegmentationSourceSnapshot& source,
                                                         const Point3& printerVolume);

/// Port of canCommitSegmentationExecution(): true while the execution request
/// still matches the source and plan that produced it.
bool canCommitSegmentationExecution(const std::string& phase, const std::optional<SegmentationRequest>& activeRequest,
                                    const std::optional<SegmentationPlan>& acceptedPlan,
                                    const SegmentationExecutionRequest& executionRequest,
                                    const SegmentationSourceSnapshot& currentSource, const Point3& currentPrinterVolume);

SegmentationExecutionResult executePlaneSegmentation(IMeshGeometryEngine& engine,
                                                     const SegmentationExecutionRequest& request,
                                                     const CancellationToken& cancel = {});

// --- preview and committed registration --------------------------------------------------

/// Whole-block bodies of the planned segments (display only, never execution output).
std::vector<MoldBody> buildSegmentationPlanPreviewBodies(const SegmentationPlan& plan,
                                                         const ReferenceMoldDefinition& definition);

/// Registration over `bodies` with the automatic sizing policy and the source's
/// protected regions as bounds-only exclusions.
DerivedRegistrationState generateSegmentationRegistration(IMeshGeometryEngine& engine, const SegmentationPlan& plan,
                                                          const SegmentationSourceSnapshot& source,
                                                          const ReferenceMoldDefinition& definition,
                                                          const std::vector<MoldBody>& bodies,
                                                          const std::string& revisionPrefix);


/// The whole segmentation execution as one job: the preflight, the plane cuts and, when they succeed, the registration of the cut sections. The
/// application runs it on a thread or, as the geometry worker, in another process; both call this one function.
struct SegmentationJobResult {
  SegmentationExecutionResult result;
  std::optional<DerivedRegistrationState> registration;
};
SegmentationJobResult runSegmentationExecutionJob(IMeshGeometryEngine& engine, const SegmentationPlan& plan,
                                                  const SegmentationSourceSnapshot& snapshot,
                                                  const ReferenceMoldDefinition& definition, const Point3& printerVolume,
                                                  const CancellationToken& cancel, const ProgressCallback& progress);
}  // namespace craft
