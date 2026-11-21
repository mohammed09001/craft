#include "mold/Segmentation.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <set>

#include "geometry/MeshAnalysis.h"

namespace craft {

namespace {

const Axis kAxes[3] = {Axis::X, Axis::Y, Axis::Z};
int ax(Axis a) { return static_cast<int>(a); }
Json jAxis(Axis a) { return Json::string(axisName(a)); }
Json jStr(const std::string& s) { return Json::string(s); }
Json jNum(double v) { return Json::number(v); }
Json jStrings(const std::vector<std::string>& values) {
  std::vector<Json> items;
  for (const std::string& v : values) items.push_back(Json::string(v));
  return Json::array(std::move(items));
}
Json jPointXYZ(const Point3& p) { return jsonPoint(p); }

SegmentationIssue issue(bool blocker, std::string code, std::string message,
                        std::vector<std::pair<std::string, Json>> details = {}) {
  return {blocker, std::move(code), std::move(message), std::move(details)};
}

bool validSize(const Point3& size) {
  for (Axis a : kAxes) {
    if (!std::isfinite(size[ax(a)]) || size[ax(a)] <= 0) return false;
  }
  return true;
}

}  // namespace

// --- fit analysis ----------------------------------------------------------------

std::optional<Point3> sizeOfBounds(const Bounds3& b) {
  return Point3{b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z};
}

FitStageResult evaluatePrintableSize(const Point3& size, const Point3& printer) {
  FitStageResult result;
  for (Axis a : kAxes) {
    result.axisFit[ax(a)] = size[ax(a)] <= printer[ax(a)];
    if (!result.axisFit[ax(a)]) result.failingAxes.push_back(a);
  }
  result.status = result.failingAxes.empty() ? FitStatus::Fits : FitStatus::DoesNotFit;
  return result;
}

// --- json of contracts --------------------------------------------------------------

Json toJson(const SegmentationSourceIdentity& s) {
  return Json::object({{"documentRevision", jNum(s.documentRevision)},
                       {"documentFingerprint", jStr(s.documentFingerprint)},
                       {"resultRequestId", jStr(s.resultRequestId)},
                       {"definitionId", jStr(s.definitionId)},
                       {"modelId", jStr(s.modelId)},
                       {"frameId", jStr(s.frameId)},
                       {"bodySignature", jStr(s.bodySignature)},
                       {"protectedRegionSignature", jStr(s.protectedRegionSignature)}});
}

Json toJson(const SegmentationProtectedRegion& r) {
  return Json::object({{"id", jStr(r.id)},
                       {"kind", jStr(r.kind)},
                       {"source", jStr(r.source)},
                       {"provenanceId", jStr(r.provenanceId)},
                       {"bodyIds", jStrings(r.bodyIds)},
                       {"bounds", jsonBounds(r.bounds)},
                       {"hardness", jStr(r.hardness)},
                       {"clearanceMm", jNum(r.clearanceMm)}});
}

Json toJson(const BoundaryIntent& b) {
  return Json::object(
      {{"id", jStr(b.id)},
       {"axis", jAxis(b.axis)},
       {"coordinateMm", jNum(b.coordinateMm)},
       {"ordinal", jNum(b.ordinal)},
       {"sequenceIndex", jNum(b.sequenceIndex)},
       {"broadcastToAllStraddlingBodies", b.broadcastToAllStraddlingBodies ? Json::boolean(true) : Json()},
       {"executionTargeting", b.allStraddling ? jStr("all-straddling") : Json()}});
}

// --- planning -------------------------------------------------------------------------

SegmentationRequest createSegmentationRequest(const SegmentationSourceSnapshot& source, const Point3& printerVolume) {
  SegmentationRequest request;
  request.printerVolume = printerVolume;
  request.printerVolumeSignature = deterministicSegmentationId("printer-volume", jPointXYZ(printerVolume));
  request.settingsSignature = deterministicSegmentationId(
      "segmentation-settings",
      Json::object({{"policyId", jStr(kSegmentationPolicyId)}, {"policyVersion", jNum(kSegmentationPolicyVersion)}}));
  request.policyId = kSegmentationPolicyId;
  request.policyVersion = kSegmentationPolicyVersion;
  request.source = source.identity;
  request.requestId = deterministicSegmentationId(
      "segmentation-request",
      Json::object({{"source", toJson(source.identity)},
                    {"printerVolumeSignature", jStr(request.printerVolumeSignature)},
                    {"settingsSignature", jStr(request.settingsSignature)},
                    {"policyId", jStr(kSegmentationPolicyId)},
                    {"policyVersion", jNum(kSegmentationPolicyVersion)}}));
  return request;
}

bool coordinateConflictsWithRegion(const SegmentationProtectedRegion& region, Axis axis, double coordinateMm) {
  const double minimum = region.bounds.min[ax(axis)] - region.clearanceMm;
  const double maximum = region.bounds.max[ax(axis)] + region.clearanceMm;
  return coordinateMm > minimum && coordinateMm < maximum;
}

double minimumPrintableMargin(const std::vector<SegmentDefinition>& segments, const Point3& printerVolume) {
  double minimum = std::numeric_limits<double>::infinity();
  for (const SegmentDefinition& s : segments) {
    for (Axis a : kAxes) {
      minimum = std::min(minimum, printerVolume[ax(a)] - (s.predictedBounds.max[ax(a)] - s.predictedBounds.min[ax(a)]));
    }
  }
  return minimum;
}

namespace {

std::vector<double> axisCoordinates(const Bounds3& bounds, Axis axis, int count) {
  const double minimum = bounds.min[ax(axis)];
  const double length = bounds.max[ax(axis)] - minimum;
  std::vector<double> coordinates;
  for (int i = 0; i <= count; ++i) coordinates.push_back(minimum + (length * i) / count);
  return coordinates;
}

struct Context {
  const SegmentationRequest* request;
  const SegmentationSourceSnapshot* source;
  Point3 sourceSize;
  std::vector<Axis> requiredAxes;
  int perAxis[3];
  int estimatedMinimum;
};

std::vector<BoundaryIntent> createBoundaryIntents(const Context& context) {
  std::vector<BoundaryIntent> boundaries;
  for (Axis axis : kAxes) {
    const auto it = std::find(context.requiredAxes.begin(), context.requiredAxes.end(), axis);
    const bool allStraddling = it != context.requiredAxes.end() && (it - context.requiredAxes.begin()) > 0;
    const auto coordinates = axisCoordinates(context.source->aggregateBounds, axis, context.perAxis[ax(axis)]);
    for (std::size_t i = 1; i + 1 < coordinates.size(); ++i) {
      const int ordinal = static_cast<int>(i);
      BoundaryIntent b;
      b.axis = axis;
      b.coordinateMm = coordinates[i];
      b.ordinal = ordinal;
      b.allStraddling = allStraddling;
      b.id = deterministicSegmentationId(
          "boundary", Json::object({{"requestId", jStr(context.request->requestId)},
                                    {"source", toJson(context.request->source)},
                                    {"axis", jAxis(axis)},
                                    {"coordinateMm", jNum(coordinates[i])},
                                    {"ordinal", jNum(ordinal)},
                                    {"executionTargeting", allStraddling ? jStr("all-straddling") : Json()},
                                    {"algorithmId", jStr(kBaselineAlgorithmId)},
                                    {"algorithmVersion", jNum(kBaselineAlgorithmVersion)},
                                    {"policyId", jStr(context.request->policyId)},
                                    {"policyVersion", jNum(context.request->policyVersion)}}));
      boundaries.push_back(b);
    }
  }
  // sequenceIndex is assigned after id hashing: a global, cross-axis running position.
  for (std::size_t i = 0; i < boundaries.size(); ++i) boundaries[i].sequenceIndex = static_cast<int>(i) + 1;
  return boundaries;
}

std::vector<SegmentDefinition> createSegments(const Context& context, const std::vector<BoundaryIntent>& boundaries) {
  std::vector<double> coordinates[3];
  for (Axis a : kAxes) coordinates[ax(a)] = axisCoordinates(context.source->aggregateBounds, a, context.perAxis[ax(a)]);
  std::vector<std::string> sourceBodyIds;
  for (const MoldBody& b : context.source->bodies) sourceBodyIds.push_back(b.id);
  std::sort(sourceBodyIds.begin(), sourceBodyIds.end());

  std::vector<SegmentDefinition> segments;
  for (int x = 0; x < context.perAxis[0]; ++x) {
    for (int y = 0; y < context.perAxis[1]; ++y) {
      for (int z = 0; z < context.perAxis[2]; ++z) {
        SegmentDefinition s;
        s.predictedBounds = {{coordinates[0][x], coordinates[1][y], coordinates[2][z]},
                             {coordinates[0][x + 1], coordinates[1][y + 1], coordinates[2][z + 1]}};
        const Point3 size = s.predictedBounds.size();
        s.gridIndex[0] = x;
        s.gridIndex[1] = y;
        s.gridIndex[2] = z;
        s.ordinal = static_cast<int>(segments.size()) + 1;
        s.id = deterministicSegmentationId(
            "segment",
            Json::object({{"requestId", jStr(context.request->requestId)},
                          {"gridIndex", Json::object({{"x", jNum(x)}, {"y", jNum(y)}, {"z", jNum(z)}})},
                          {"predictedBounds", jsonBounds(s.predictedBounds)}}));
        s.sourceBodyIds = sourceBodyIds;
        s.predictedFit = evaluatePrintableSize(size, context.request->printerVolume);
        for (const BoundaryIntent& b : boundaries) {
          if (b.coordinateMm == s.predictedBounds.min[ax(b.axis)] || b.coordinateMm == s.predictedBounds.max[ax(b.axis)]) {
            s.boundaryIntentIds.push_back(b.id);
          }
        }
        segments.push_back(std::move(s));
      }
    }
  }
  return segments;
}

SegmentationValidation makeValidation(const SegmentationRequest& request, const std::vector<SegmentationIssue>& issues,
                                      const std::string& printable, const std::string& geometry,
                                      const std::string& safety) {
  SegmentationValidation v;
  for (const SegmentationIssue& i : issues) (i.blocker ? v.blockers : v.warnings).push_back(i);
  v.status = v.blockers.empty() ? "planning-valid" : "invalid";
  v.sourceRevision = request.source.documentRevision;
  v.sourceFingerprint = request.source.documentFingerprint;
  v.printableByBounds = printable;
  v.geometryExecution = geometry;
  v.manufacturingSafety = safety;
  return v;
}

}  // namespace

SegmentationPlanningResult planSegmentation(const SegmentationRequest& request, const SegmentationSourceSnapshot& source) {
  SegmentationPlanningResult result;
  result.request = request;
  const auto sourceSize = sizeOfBounds(source.aggregateBounds);
  if (!sourceSize || !validSize(*sourceSize) || !validSize(request.printerVolume)) {
    result.status = "failed";
    result.stage = "printable-volume-analysis";
    result.reasonCode = "invalid_printer_volume";
    result.issues = {issue(true, "invalid_printer_volume",
                           "Printer volume and authoritative mold bounds must be finite and positive.")};
    return result;
  }
  const FitStageResult printableFit = evaluatePrintableSize(*sourceSize, request.printerVolume);
  std::vector<Axis> requiredAxes;
  if (printableFit.status == FitStatus::DoesNotFit) requiredAxes = printableFit.failingAxes;
  if (requiredAxes.empty()) {
    result.status = "not-required";
    result.validation = makeValidation(request, source.warnings, "verified", "not-run", "not-applicable");
    return result;
  }

  Context context;
  context.request = &request;
  context.source = &source;
  context.sourceSize = *sourceSize;
  context.requiredAxes = requiredAxes;
  context.estimatedMinimum = 1;
  for (Axis a : kAxes) {
    context.perAxis[ax(a)] = std::max(1, static_cast<int>(std::ceil((*sourceSize)[ax(a)] / request.printerVolume[ax(a)])));
    context.estimatedMinimum *= context.perAxis[ax(a)];
  }

  // Baseline algorithm: one candidate, a bounds-only axis grid.
  const std::vector<BoundaryIntent> boundaries = createBoundaryIntents(context);
  const std::vector<SegmentDefinition> segments = createSegments(context, boundaries);
  std::vector<SegmentationIssue> issues;
  for (const SegmentationProtectedRegion& region : source.protectedRegions) {
    int conflicts = 0;
    for (const BoundaryIntent& b : boundaries) {
      if (coordinateConflictsWithRegion(region, b.axis, b.coordinateMm)) ++conflicts;
    }
    if (conflicts == 0) continue;
    issues.push_back(issue(region.hardness == "hard", "protected_region_conflict",
                           "Candidate boundaries intersect protected region " + region.id + ".",
                           {{"protectedRegionId", jStr(region.id)}, {"conflictCount", jNum(conflicts)}}));
  }
  std::vector<Json> boundaryJson;
  std::vector<std::string> boundaryIds, segmentIds;
  for (const BoundaryIntent& b : boundaries) {
    boundaryJson.push_back(toJson(b));
    boundaryIds.push_back(b.id);
  }
  for (const SegmentDefinition& s : segments) segmentIds.push_back(s.id);

  struct Candidate {
    std::string id;
    std::vector<SegmentationIssue> issues;
    CandidateScore score;
  } candidate;
  candidate.id = deterministicSegmentationId(
      "candidate", Json::object({{"algorithmId", jStr(kBaselineAlgorithmId)},
                                 {"algorithmVersion", jNum(kBaselineAlgorithmVersion)},
                                 {"requestId", jStr(request.requestId)},
                                 {"boundaries", Json::array(boundaryJson)},
                                 {"segmentIds", jStrings(segmentIds)}}));
  candidate.issues = issues;
  for (const SegmentationIssue& i : issues) {
    if (i.blocker) ++candidate.score.hardFailureCount;
  }
  candidate.score.segmentCount = static_cast<int>(segments.size());
  candidate.score.minimumPrintableMarginMm = minimumPrintableMargin(segments, request.printerVolume);
  candidate.score.declaredRisk = static_cast<int>(issues.size());

  // evaluateCandidate: every predicted segment must fit the printer.
  int unprintable = 0;
  for (const SegmentDefinition& s : segments) {
    if (s.predictedFit.status != FitStatus::Fits) ++unprintable;
  }
  if (unprintable > 0) {
    candidate.issues.push_back(issue(true, "no_printable_plan", "One or more predicted segments exceed the printer volume.",
                                     {{"unprintableSegmentCount", jNum(unprintable)}}));
    ++candidate.score.hardFailureCount;
  }
  // Fixed objective: pieces x10, risk x5, minus the printable margin.
  candidate.score.weightedObjectiveScore = 10.0 * candidate.score.segmentCount + 5.0 * candidate.score.declaredRisk -
                                           1.0 * candidate.score.minimumPrintableMarginMm;

  if (candidate.score.hardFailureCount != 0) {
    result.status = "failed";
    result.stage = "plan-selection";
    result.reasonCode = "no_printable_plan";
    result.issues = candidate.issues.empty()
                        ? std::vector<SegmentationIssue>{issue(true, "no_printable_plan",
                                                               "The segmentation algorithm produced no feasible candidates.")}
                        : candidate.issues;
    return result;
  }

  std::vector<SegmentationIssue> validationIssues = source.warnings;
  validationIssues.insert(validationIssues.end(), candidate.issues.begin(), candidate.issues.end());
  bool conflictIssue = false;
  for (const SegmentationIssue& i : candidate.issues) conflictIssue = conflictIssue || i.reasonCode == "protected_region_conflict";
  SegmentationPlan plan;
  plan.request = request;
  plan.requiredAxes = requiredAxes;
  for (Axis a : kAxes) plan.perAxisSegmentCount[ax(a)] = context.perAxis[ax(a)];
  plan.estimatedMinimumSegmentCount = context.estimatedMinimum;
  plan.candidateIds = {candidate.id};
  plan.selectedCandidateId = candidate.id;
  plan.boundaries = boundaries;
  plan.segments = segments;
  plan.score = candidate.score;
  plan.validation = makeValidation(
      request, validationIssues, "verified", "not-run",
      source.protectedRegionEvidence.status == "complete" && !conflictIssue ? "verified" : "not-established");
  plan.extensionObligations = {"assembly-joint-planning", "alignment-and-sealing-validation", "assembly-sequence-planning"};
  plan.id = deterministicSegmentationId(
      "segmentation-plan", Json::object({{"requestId", jStr(request.requestId)},
                                         {"algorithmId", jStr(kBaselineAlgorithmId)},
                                         {"algorithmVersion", jNum(kBaselineAlgorithmVersion)},
                                         {"planningBasis", jStr("bounds-only")},
                                         {"selectedCandidateId", jStr(candidate.id)},
                                         {"boundaryIds", jStrings(boundaryIds)},
                                         {"segmentIds", jStrings(segmentIds)}}));
  result.status = "planned";
  result.plan = std::move(plan);
  return result;
}

// --- axis ownership and extensions -------------------------------------------------------

AxisOwnership deriveAxisOwnership(const std::vector<Axis>& algorithmAxes, const std::vector<Axis>& userAxes) {
  const auto dedupe = [](const std::vector<Axis>& axes) {
    std::vector<Axis> result;
    for (Axis a : kAxes) {
      if (std::find(axes.begin(), axes.end(), a) != axes.end()) result.push_back(a);
    }
    return result;
  };
  AxisOwnership o;
  o.algorithmUsedAxes = dedupe(algorithmAxes);
  o.userExtensionAxes = dedupe(userAxes);
  std::vector<Axis> combined = o.algorithmUsedAxes;
  combined.insert(combined.end(), o.userExtensionAxes.begin(), o.userExtensionAxes.end());
  o.combinedUsedAxes = dedupe(combined);
  for (Axis a : kAxes) {
    if (std::find(o.combinedUsedAxes.begin(), o.combinedUsedAxes.end(), a) == o.combinedUsedAxes.end()) {
      o.availableAxes.push_back(a);
    }
  }
  return o;
}

double suggestExtensionAxisPosition(const SegmentationSourceSnapshot& source, Axis axis) {
  const double minimum = source.aggregateBounds.min[ax(axis)];
  const double maximum = source.aggregateBounds.max[ax(axis)];
  const double span = maximum - minimum;
  const double midpoint = minimum + span / 2;
  if (span <= 0 || !std::isfinite(span)) return midpoint;
  const double margin = 0.02 * span;
  const auto clamp = [&](double c) { return std::min(maximum - margin, std::max(minimum + margin, c)); };
  const auto hardConflict = [&](double c) {
    for (const SegmentationProtectedRegion& r : source.protectedRegions) {
      if (r.hardness == "hard" && coordinateConflictsWithRegion(r, axis, c)) return true;
    }
    return false;
  };
  static const double kFractions[] = {0, 0.05, -0.05, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2, 0.25,
                                      -0.25, 0.3, -0.3, 0.35, -0.35, 0.4, -0.4, 0.45, -0.45};
  for (double fraction : kFractions) {
    const double candidate = midpoint + fraction * span;
    if (!hardConflict(candidate)) return clamp(candidate);
  }
  return clamp(midpoint);
}

SegmentationPlan mergeExtensionBoundary(const SegmentationPlan& plan, Axis axis, double coordinateMm,
                                        const std::vector<SegmentationProtectedRegion>& protectedRegions) {
  if (std::find(plan.requiredAxes.begin(), plan.requiredAxes.end(), axis) != plan.requiredAxes.end()) return plan;

  int sequenceIndex = 0;
  for (const BoundaryIntent& b : plan.boundaries) sequenceIndex = std::max(sequenceIndex, b.sequenceIndex);
  ++sequenceIndex;
  BoundaryIntent boundary;
  boundary.axis = axis;
  boundary.coordinateMm = coordinateMm;
  boundary.ordinal = 1;
  boundary.sequenceIndex = sequenceIndex;
  boundary.broadcastToAllStraddlingBodies = true;
  boundary.id = deterministicSegmentationId(
      "extension-boundary", Json::object({{"basePlanId", jStr(plan.id)},
                                          {"axis", jAxis(axis)},
                                          {"coordinateMm", jNum(coordinateMm)},
                                          {"sequenceIndex", jNum(sequenceIndex)}}));

  std::vector<SegmentDefinition> segments;
  for (const SegmentDefinition& segment : plan.segments) {
    for (int key = 0; key < 2; ++key) {
      SegmentDefinition half = segment;
      half.predictedBounds = segment.predictedBounds;
      if (key == 0) half.predictedBounds.max[ax(axis)] = coordinateMm;
      else half.predictedBounds.min[ax(axis)] = coordinateMm;
      half.id = deterministicSegmentationId(
          "extension-segment", Json::object({{"parentSegmentId", jStr(segment.id)},
                                             {"axis", jAxis(axis)},
                                             {"coordinateMm", jNum(coordinateMm)},
                                             {"side", jNum(key)},
                                             {"boundaryId", jStr(boundary.id)}}));
      half.gridIndex[ax(axis)] = key;
      half.predictedFit = evaluatePrintableSize(half.predictedBounds.size(), plan.request.printerVolume);
      half.boundaryIntentIds.push_back(boundary.id);
      segments.push_back(std::move(half));
    }
  }
  for (std::size_t i = 0; i < segments.size(); ++i) segments[i].ordinal = static_cast<int>(i) + 1;

  std::vector<SegmentationIssue> newIssues;
  int unfit = 0;
  for (const SegmentDefinition& s : segments) {
    if (s.predictedFit.status != FitStatus::Fits) ++unfit;
  }
  if (unfit > 0) {
    newIssues.push_back(issue(true, "no_printable_plan",
                              "One or more predicted segments exceed the printer volume after the extension axis was added.",
                              {{"unprintableSegmentCount", jNum(unfit)}}));
  }
  int degenerate = 0;
  for (const SegmentDefinition& s : plan.segments) {
    if (coordinateMm <= s.predictedBounds.min[ax(axis)] || coordinateMm >= s.predictedBounds.max[ax(axis)]) ++degenerate;
  }
  if (degenerate > 0) {
    newIssues.push_back(issue(true, "invalid_authoritative_geometry",
                              "The extension plane's coordinate is not strictly interior to the body -- it would produce a degenerate or empty piece.",
                              {{"degenerateSegmentCount", jNum(degenerate)}}));
  }
  std::vector<const SegmentationProtectedRegion*> conflicting;
  for (const SegmentationProtectedRegion& r : protectedRegions) {
    if (r.hardness == "hard" && coordinateConflictsWithRegion(r, axis, coordinateMm)) conflicting.push_back(&r);
  }
  if (!conflicting.empty()) {
    newIssues.push_back(issue(true, "protected_region_conflict",
                              "The extension plane intersects protected region " + conflicting.front()->id + ".",
                              {{"protectedRegionId", jStr(conflicting.front()->id)},
                               {"conflictCount", jNum(static_cast<double>(conflicting.size()))}}));
  }

  SegmentationPlan merged = plan;
  merged.boundaries.push_back(boundary);
  merged.requiredAxes.push_back(axis);
  merged.perAxisSegmentCount[ax(axis)] = plan.perAxisSegmentCount[ax(axis)] * 2;
  merged.estimatedMinimumSegmentCount = plan.estimatedMinimumSegmentCount * 2;
  merged.segments = segments;
  const int blockerCount = static_cast<int>(newIssues.size());  // every merge issue is a blocker
  merged.score.hardFailureCount = plan.score.hardFailureCount + blockerCount;
  merged.score.segmentCount = static_cast<int>(segments.size());
  merged.score.minimumPrintableMarginMm = minimumPrintableMargin(segments, plan.request.printerVolume);
  merged.score.declaredRisk = plan.score.declaredRisk + blockerCount;
  for (const SegmentationIssue& i : newIssues) (i.blocker ? merged.validation.blockers : merged.validation.warnings).push_back(i);
  merged.validation.status = merged.validation.blockers.empty() ? "planning-valid" : "invalid";

  std::vector<std::string> boundaryIds, segmentIds;
  for (const BoundaryIntent& b : merged.boundaries) boundaryIds.push_back(b.id);
  for (const SegmentDefinition& s : merged.segments) segmentIds.push_back(s.id);
  merged.id = deterministicSegmentationId(
      "segmentation-plan-extended", Json::object({{"basePlanId", jStr(plan.id)},
                                                  {"axis", jAxis(axis)},
                                                  {"coordinateMm", jNum(coordinateMm)},
                                                  {"boundaryIds", jStrings(boundaryIds)},
                                                  {"segmentIds", jStrings(segmentIds)}}));
  return merged;
}

// --- source snapshots ---------------------------------------------------------------------------

std::optional<PreliminarySource> capturePreliminaryWholeBlockSnapshot(const Bounds3& groundedWorldBounds,
                                                                      double clearanceMm, const std::string& modelId) {
  const double automaticClearance = resolveAutomaticSegmentationMoldClearance(clearanceMm);
  const auto frame = createAutomaticSegmentationMoldFrameBounds(groundedWorldBounds, clearanceMm);
  if (!frame) return std::nullopt;

  PreliminarySource out;
  const Json frameJson = Json::object({{"partOffset", jsonPoint(frame->partOffset)},
                                       {"selectionBoxBounds", jsonBounds(frame->selectionBoxBounds)},
                                       {"referenceMoldBlockBounds", jsonBounds(frame->referenceMoldBlockBounds)}});
  const std::string definitionId = deterministicSegmentationId(
      "preliminary-mold", Json::object({{"selectedModelId", jStr(modelId)},
                                        {"clearanceMm", jNum(automaticClearance)},
                                        {"frameBounds", frameJson}}));
  ReferenceMoldDefinition& definition = out.definition;
  definition.definitionId = definitionId;
  definition.modelId = modelId;
  definition.partOffset = frame->partOffset;
  definition.selectionBoxBounds = frame->selectionBoxBounds;
  definition.clearanceMm = automaticClearance;
  definition.referenceMoldBlockBounds = frame->referenceMoldBlockBounds;

  const std::string geometryVersion = "preliminary:" + definitionId;
  MoldBody body = createWholeMoldBody(definition.referenceMoldBlockBounds, definitionId + ":whole-block",
                                      "Whole Reference Mold Block");
  body.geometryVersion = geometryVersion;
  const std::string bodySignature = deterministicSegmentationId(
      "mold-bodies",
      Json::array({Json::object({{"id", jStr(body.id)},
                                 {"geometryVersion", jStr(geometryVersion)},
                                 {"bounds", jsonBounds(body.bounds)},
                                 {"triangleCount", jNum(static_cast<double>(body.triangleCount))},
                                 {"volumeMm3", jNum(body.volumeMm3)}})}));
  const ProtectedRegionEvidence evidence{
      "incomplete",
      "No committed Split Face result exists yet -- this snapshot represents the undivided reference mold envelope only."};

  SegmentationSourceSnapshot& snapshot = out.snapshot;
  snapshot.identity.documentRevision = 0;
  snapshot.identity.documentFingerprint = bodySignature;
  snapshot.identity.resultRequestId = "synthetic:" + bodySignature;
  snapshot.identity.definitionId = definitionId;
  snapshot.identity.modelId = modelId;
  snapshot.identity.frameId = "mold-frame:" + definitionId;
  snapshot.identity.bodySignature = bodySignature;
  snapshot.identity.protectedRegionSignature = deterministicSegmentationId(
      "protected-regions",
      Json::object({{"regions", Json::array({})},
                    {"evidence", Json::object({{"status", jStr(evidence.status)}, {"reason", jStr(evidence.reason)}})}}));
  snapshot.bodies = {body};
  snapshot.aggregateBounds = frame->referenceMoldBlockBounds;
  snapshot.protectedRegionEvidence = evidence;
  snapshot.warnings = {issue(false, "protected_region_evidence_incomplete", evidence.reason)};
  return out;
}

std::vector<SegmentationProtectedRegion> protectedRegionsOf(const CommittedMoldFacts& facts) {
  std::vector<SegmentationProtectedRegion> regions;
  std::vector<std::string> bodyIds;
  for (const MoldBody& b : facts.bodies) bodyIds.push_back(b.id);
  std::sort(bodyIds.begin(), bodyIds.end());
  if (facts.hasCavity) {
    regions.push_back({"committed-cavity", "cavity-surface", "cavity", facts.cavitySourceSignature, bodyIds,
                       facts.cavityBounds, "advisory", facts.cavityClearanceMm});
  }
  for (const SprueDefinition& sprue : facts.sprues) {
    const double radius = sprue.profile.mainDiameterMm / 2 + sprue.tolerancePolicy.surfaceToleranceMm;
    const Point3 end{sprue.position.x + sprue.inwardDirection.x * sprue.depthMm,
                     sprue.position.y + sprue.inwardDirection.y * sprue.depthMm,
                     sprue.position.z + sprue.inwardDirection.z * sprue.depthMm};
    std::vector<std::string> targets = sprue.targetBodyIds;
    std::sort(targets.begin(), targets.end());
    regions.push_back({"committed-sprue:" + sprue.operationId, "sprue", "sprue", sprue.operationId, targets,
                       {{std::min(sprue.position.x, end.x) - radius, std::min(sprue.position.y, end.y) - radius,
                         std::min(sprue.position.z, end.z) - radius},
                        {std::max(sprue.position.x, end.x) + radius, std::max(sprue.position.y, end.y) + radius,
                         std::max(sprue.position.z, end.z) + radius}},
                       "advisory", sprue.tolerancePolicy.surfaceToleranceMm});
  }
  for (const RegistrationFeature& f : facts.generatedFeatures) {
    if (f.status != "generated") continue;
    const double margin = std::max({f.geometry.widthMm / 2, f.geometry.depthMm, f.clearanceMm});
    std::vector<std::string> ids{f.femaleBodyId, f.maleBodyId};
    std::sort(ids.begin(), ids.end());
    regions.push_back({"committed-registration:" + f.id, "registration-feature", "registration", f.id, ids,
                       {{std::min(f.startPoint.x, f.endPoint.x) - margin, std::min(f.startPoint.y, f.endPoint.y) - margin,
                         std::min(f.startPoint.z, f.endPoint.z) - margin},
                        {std::max(f.startPoint.x, f.endPoint.x) + margin, std::max(f.startPoint.y, f.endPoint.y) + margin,
                         std::max(f.startPoint.z, f.endPoint.z) + margin}},
                       "advisory", f.clearanceMm});
  }
  std::stable_sort(regions.begin(), regions.end(),
                   [](const auto& l, const auto& r) { return localeKeyLess(l.id, r.id); });
  return regions;
}

namespace {

bool sameBounds(const Bounds3& a, const Bounds3& b) {
  for (int i = 0; i < 3; ++i) {
    if (std::fabs(a.min[i] - b.min[i]) > 1e-9 || std::fabs(a.max[i] - b.max[i]) > 1e-9) return false;
  }
  return true;
}

constexpr const char* kCommittedEvidenceReason =
    "The current snapshot provides bounds-level feature evidence only; thin walls, sealing regions, and production split-clearance policy are not yet authoritative.";

Json jsonRegions(const std::vector<SegmentationProtectedRegion>& regions, const ProtectedRegionEvidence& evidence) {
  std::vector<Json> items;
  for (const SegmentationProtectedRegion& r : regions) items.push_back(toJson(r));
  return Json::object({{"regions", Json::array(std::move(items))},
                       {"evidence", Json::object({{"status", jStr(evidence.status)}, {"reason", jStr(evidence.reason)}})}});
}

// captureSegmentationSourceSnapshot: the committed result as a snapshot, or why it cannot be one.
SegmentationSourceResult captureCommittedSnapshot(const CommittedMoldSource& committed) {
  SegmentationSourceResult out;
  const std::vector<MoldBody>& bodies = committed.facts.bodies;
  if (!committed.current) {
    out.status = "stale";
    out.reasonCode = "stale_source_revision";
    out.issues = {issue(true, "stale_source_revision", "The committed mold geometry does not match the current mold document.")};
    return out;
  }
  bool boundsOk = !bodies.empty();
  Bounds3 aggregate;
  if (boundsOk) {
    aggregate = bodies.front().bounds;
    for (const MoldBody& b : bodies) {
      for (int i = 0; i < 3; ++i) {
        if (!std::isfinite(b.bounds.min[i]) || !std::isfinite(b.bounds.max[i])) boundsOk = false;
        aggregate.min[i] = std::min(aggregate.min[i], b.bounds.min[i]);
        aggregate.max[i] = std::max(aggregate.max[i], b.bounds.max[i]);
      }
    }
    for (int i = 0; i < 3 && boundsOk; ++i) boundsOk = aggregate.max[i] > aggregate.min[i];
  }
  bool bodiesOk = boundsOk;
  for (const MoldBody& b : bodies) {
    if (!b.watertight || b.mesh.positions.empty() || b.mesh.indices.empty() || b.mesh.positions.size() % 3 != 0 || b.mesh.indices.size() % 3 != 0) bodiesOk = false;
  }
  if (!bodiesOk) {
    out.status = "failed";
    out.reasonCode = "invalid_authoritative_geometry";
    out.issues = {issue(true, "invalid_authoritative_geometry", "Committed mold bodies are empty or structurally invalid.")};
    return out;
  }

  std::vector<const MoldBody*> ordered;
  for (const MoldBody& b : bodies) ordered.push_back(&b);
  std::stable_sort(ordered.begin(), ordered.end(), [](const MoldBody* l, const MoldBody* r) { return localeKeyLess(l->id, r->id); });
  std::vector<Json> identity;
  for (const MoldBody* b : ordered) {
    identity.push_back(Json::object({{"id", jStr(b->id)},
                                     {"geometryVersion", b->geometryVersion.empty() ? Json() : jStr(b->geometryVersion)},
                                     {"bounds", jsonBounds(b->bounds)},
                                     {"triangleCount", jNum(static_cast<double>(b->triangleCount))},
                                     {"volumeMm3", jNum(b->volumeMm3)}}));
  }
  const std::string bodySignature = deterministicSegmentationId("mold-bodies", Json::array(std::move(identity)));
  const std::vector<SegmentationProtectedRegion> regions = protectedRegionsOf(committed.facts);
  const ProtectedRegionEvidence evidence{"incomplete", kCommittedEvidenceReason};

  PreliminarySource source;
  source.definition = committed.definition;
  SegmentationSourceSnapshot& snapshot = source.snapshot;
  snapshot.identity.documentRevision = committed.sourceRevision;
  snapshot.identity.documentFingerprint = committed.sourceFingerprint;
  snapshot.identity.resultRequestId = committed.resultRequestId;
  snapshot.identity.definitionId = committed.definition.definitionId;
  snapshot.identity.modelId = committed.definition.modelId;
  snapshot.identity.frameId = "mold-frame:" + committed.definition.definitionId;
  snapshot.identity.bodySignature = bodySignature;
  snapshot.identity.protectedRegionSignature = deterministicSegmentationId("protected-regions", jsonRegions(regions, evidence));
  snapshot.bodies = bodies;
  snapshot.aggregateBounds = aggregate;
  snapshot.protectedRegions = regions;
  snapshot.protectedRegionEvidence = evidence;
  snapshot.warnings = {issue(false, "protected_region_evidence_incomplete", evidence.reason)};
  out.status = "ready";
  out.source = std::move(source);
  return out;
}

}  // namespace

SegmentationSourceResult readSegmentationSource(const std::optional<PreliminarySource>& preliminary,
                                                const std::optional<CommittedMoldSource>& committed) {
  SegmentationSourceResult primary;
  if (committed) {
    primary = captureCommittedSnapshot(*committed);
    // Once an authoritative result exists, a stale or structurally invalid one stays blocking: replacing it with the automatic source
    // would hide the failure and attach a newer plan to older committed state.
    if (primary.status == "stale" || (primary.status == "failed" && primary.reasonCode == "invalid_authoritative_geometry")) return primary;
  } else {
    primary.status = "failed";
    primary.reasonCode = "missing_authoritative_geometry";
    primary.issues = {issue(true, "missing_authoritative_geometry", "A committed final mold result is required before segmentation planning.")};
  }

  if (preliminary) {
    SegmentationSourceResult out;
    out.status = "ready";
    out.source = *preliminary;
    if (primary.status != "ready") return out;
    const SegmentationSourceSnapshot& committedSnapshot = primary.source->snapshot;
    // A committed mold with nothing to protect would only change identity metadata (and stale the plan it produced): keep the automatic source.
    if (committedSnapshot.protectedRegions.empty()) return out;
    // Regions from another block or selection box cannot be projected onto the automatic envelope: keep it and its own evidence warning.
    if (!sameBounds(primary.source->definition.referenceMoldBlockBounds, preliminary->definition.referenceMoldBlockBounds) ||
        !sameBounds(primary.source->definition.selectionBoxBounds, preliminary->definition.selectionBoxBounds))
      return out;
    SegmentationSourceSnapshot& merged = out.source->snapshot;
    merged.protectedRegions = committedSnapshot.protectedRegions;
    merged.protectedRegionEvidence = committedSnapshot.protectedRegionEvidence;
    merged.identity.protectedRegionSignature =
        deterministicSegmentationId("protected-regions", jsonRegions(merged.protectedRegions, merged.protectedRegionEvidence));
    merged.warnings.insert(merged.warnings.end(), committedSnapshot.warnings.begin(), committedSnapshot.warnings.end());
    return out;
  }
  return primary;
}
// --- execution policy and preflight -----------------------------------------------------------------

SegmentationExecutionPolicy createSegmentationExecutionPolicy(const Bounds3& bounds, double sourceVolumeMm3) {
  const double diagonal = std::hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z);
  SegmentationExecutionPolicy p;
  p.linearToleranceMm = std::max(1e-6, diagonal * 1e-7);
  p.volumeToleranceMm3 = std::max(1e-6, std::fabs(sourceVolumeMm3) * 1e-6);
  p.boundsToleranceMm = p.linearToleranceMm * 2;
  p.sideToleranceMm = p.linearToleranceMm * 2;
  p.overlapToleranceMm3 = p.volumeToleranceMm3;
  return p;
}

namespace {

SegmentationExecutionResult executionResult(const std::string& status, const std::string& stage,
                                            const std::string& reasonCode, const std::string& message,
                                            const std::string& diagnosticStage) {
  SegmentationExecutionResult r;
  r.status = status;
  r.stage = stage;
  r.reasonCode = reasonCode;
  r.issues = {issue(true, reasonCode, message)};
  r.diagnostics = {{diagnosticStage, reasonCode, message, std::nullopt, {}, -1, -1}};
  return r;
}

/// Port of expectedSegmentCount(): the body count the ordered boundaries produce; -1 if unsupported.
double expectedSegmentCount(const std::vector<BoundaryIntent>& ordered) {
  double count = 1;
  double intervals[3] = {1, 1, 1};
  for (const BoundaryIntent& b : ordered) {
    if (b.broadcastToAllStraddlingBodies && b.allStraddling) return -1;
    if (b.broadcastToAllStraddlingBodies) {
      count *= 2;
      intervals[ax(b.axis)] *= 2;
      continue;
    }
    if (b.allStraddling) {
      const double targets = count / intervals[ax(b.axis)];
      if (targets != std::floor(targets) || targets < 1) return -1;
      count += targets;
      intervals[ax(b.axis)] += 1;
      continue;
    }
    count += 1;
    intervals[ax(b.axis)] += 1;
  }
  return count;
}

}  // namespace

SegmentationPreflight createSegmentationExecutionRequest(const SegmentationPlan& plan, const SegmentationSourceSnapshot& source,
                                                         const Point3& printerVolume) {
  SegmentationPreflight out;
  const auto unsupported = [&](const std::string& code, const std::string& message) {
    out.failure = executionResult("unsupported", "geometry-execution", code, message, "preflight");
    return out;
  };
  const bool mixedAxis = plan.requiredAxes.size() > 1;
  if (source.bodies.size() != 1 || plan.requiredAxes.empty() || plan.boundaries.empty()) {
    return unsupported("unsupported_execution_shape",
                       "Execution supports one source body and one or more boundaries on one or more of the X, Y, or Z axes.");
  }
  const Axis executionAxis = plan.requiredAxes.front();
  const MoldBody& body = source.bodies.front();
  for (const SegmentDefinition& s : plan.segments) {
    if (s.sourceBodyIds.size() != 1 || s.sourceBodyIds[0] != body.id) {
      return unsupported("unsupported_execution_shape", "Every segment must reference the sole authoritative source body.");
    }
  }
  std::string trimmed = body.geometryVersion;
  trimmed.erase(std::remove_if(trimmed.begin(), trimmed.end(), [](unsigned char c) { return std::isspace(c) != 0; }), trimmed.end());
  if (trimmed.empty()) {
    out.failure = executionResult("failed", "geometry-execution", "invalid_source_body",
                                  "The committed source body has no authoritative geometry version.", "preflight");
    return out;
  }
  const SegmentationExecutionPolicy policy = createSegmentationExecutionPolicy(body.bounds, body.volumeMm3);

  std::vector<BoundaryIntent> boundaries = plan.boundaries;
  if (mixedAxis) {
    std::stable_sort(boundaries.begin(), boundaries.end(), [](const BoundaryIntent& l, const BoundaryIntent& r) {
      return l.sequenceIndex != r.sequenceIndex ? l.sequenceIndex < r.sequenceIndex : l.id < r.id;
    });
  } else {
    std::stable_sort(boundaries.begin(), boundaries.end(), [](const BoundaryIntent& l, const BoundaryIntent& r) {
      if (l.coordinateMm != r.coordinateMm) return l.coordinateMm < r.coordinateMm;
      return l.ordinal != r.ordinal ? l.ordinal < r.ordinal : l.id < r.id;
    });
  }
  for (const BoundaryIntent& b : boundaries) {
    if (b.allStraddling && b.broadcastToAllStraddlingBodies) {
      return unsupported("unsupported_boundary_intent",
                         "An accepted boundary cannot combine Cartesian all-straddling targeting with legacy extension broadcast targeting.");
    }
  }
  const double expected = expectedSegmentCount(boundaries);
  if (expected < 0 || static_cast<double>(plan.segments.size()) != expected) {
    return unsupported("unsupported_execution_shape",
                       "The plan's segment count does not match the body count its ordered boundary sequence and targeting semantics would produce.");
  }
  std::set<std::string> ids;
  std::set<int> sequence;
  for (const BoundaryIntent& b : boundaries) {
    ids.insert(b.id);
    sequence.insert(b.sequenceIndex);
  }
  if (ids.size() != boundaries.size() || (mixedAxis && sequence.size() != boundaries.size())) {
    out.failure = executionResult("failed", "result-validation", "duplicate_cut_plane",
                                  "Accepted boundaries must have unique identities and, for mixed-axis plans, unique sequence positions.",
                                  "preflight");
    return out;
  }
  for (const BoundaryIntent& b : boundaries) {
    const bool required = std::find(plan.requiredAxes.begin(), plan.requiredAxes.end(), b.axis) != plan.requiredAxes.end();
    if (!required || !std::isfinite(b.coordinateMm) || b.coordinateMm <= body.bounds.min[ax(b.axis)] + policy.sideToleranceMm ||
        b.coordinateMm >= body.bounds.max[ax(b.axis)] - policy.sideToleranceMm) {
      return unsupported("unsupported_boundary_intent",
                         "Every accepted boundary must convert into an interior plane on one of the plan's required axes.");
    }
  }
  for (Axis axis : kAxes) {
    std::vector<double> coordinates;
    for (const BoundaryIntent& b : boundaries) {
      if (b.axis == axis) coordinates.push_back(b.coordinateMm);
    }
    std::sort(coordinates.begin(), coordinates.end());
    for (std::size_t i = 1; i < coordinates.size(); ++i) {
      if (coordinates[i] - coordinates[i - 1] <= policy.sideToleranceMm) {
        std::string upper = axisName(axis);
        upper[0] = static_cast<char>(std::toupper(upper[0]));
        out.failure = executionResult("failed", "result-validation", "duplicate_cut_plane",
                                      "Accepted " + upper + " boundaries are coincident within execution tolerance.", "preflight");
        return out;
      }
    }
  }

  std::vector<SupportedPlaneCutIntent> planes;
  std::vector<Json> planeJson;
  for (const BoundaryIntent& b : boundaries) {
    SupportedPlaneCutIntent p;
    p.boundary = b;
    p.boundaryId = b.id;
    p.axis = b.axis;
    p.coordinateMm = b.coordinateMm;
    p.normal[ax(b.axis)] = 1;
    p.originOffset = b.coordinateMm;
    planeJson.push_back(Json::object(
        {{"boundary", toJson(b)},
         {"boundaryId", jStr(b.id)},
         {"axis", jAxis(b.axis)},
         {"coordinateMm", jNum(b.coordinateMm)},
         {"normal", Json::array({jNum(p.normal.x), jNum(p.normal.y), jNum(p.normal.z)})},
         {"originOffset", jNum(b.coordinateMm)},
         {"coordinateSpace", jStr("mold-local")},
         {"units", jStr("millimeters")},
         {"upAxis", jStr("Z")},
         {"sides", Json::array({jStr("positive"), jStr("negative")})}}));
    planes.push_back(std::move(p));
  }
  const std::string planeSequenceSignature = deterministicSegmentationId("segmentation-plane-sequence", Json::array(planeJson));

  SegmentationExecutionRequest request;
  request.id = deterministicSegmentationId(
      "segmentation-execution",
      Json::object({{"segmentationRequestId", jStr(plan.request.requestId)},
                    {"acceptedPlanId", jStr(plan.id)},
                    {"source", toJson(plan.request.source)},
                    {"bodyId", jStr(body.id)},
                    {"geometryVersion", jStr(body.geometryVersion)},
                    {"printerVolumeSignature", jStr(plan.request.printerVolumeSignature)},
                    {"planeSequenceSignature", jStr(planeSequenceSignature)},
                    {"policyId", jStr(policy.id)},
                    {"policyVersion", jNum(policy.version)}}));
  request.segmentationRequestId = plan.request.requestId;
  request.acceptedPlanId = plan.id;
  request.acceptedPlan = plan;
  request.documentRevision = plan.request.source.documentRevision;
  request.documentFingerprint = plan.request.source.documentFingerprint;
  request.committedResultRequestId = plan.request.source.resultRequestId;
  request.sourceBody = body;
  request.bodySignature = plan.request.source.bodySignature;
  request.printerVolume = printerVolume;
  request.printerVolumeSignature = plan.request.printerVolumeSignature;
  request.executionAxis = executionAxis;
  request.planes = std::move(planes);
  request.planeSequenceSignature = planeSequenceSignature;
  request.policy = policy;
  out.ok = true;
  out.request = std::move(request);
  return out;
}

bool canCommitSegmentationExecution(const std::string& phase, const std::optional<SegmentationRequest>& activeRequest,
                                    const std::optional<SegmentationPlan>& acceptedPlan,
                                    const SegmentationExecutionRequest& executionRequest,
                                    const SegmentationSourceSnapshot& currentSource, const Point3& currentPrinterVolume) {
  if (currentSource.bodies.empty()) return false;
  const MoldBody& body = currentSource.bodies.front();
  const SegmentationExecutionPolicy policy = createSegmentationExecutionPolicy(body.bounds, body.volumeMm3);
  if (!acceptedPlan) return false;
  const SegmentationPreflight recreated = createSegmentationExecutionRequest(*acceptedPlan, currentSource, currentPrinterVolume);
  return phase == "executing" && activeRequest && activeRequest->requestId == executionRequest.segmentationRequestId &&
         acceptedPlan->id == executionRequest.acceptedPlanId &&
         currentSource.identity.documentRevision == executionRequest.documentRevision &&
         currentSource.identity.documentFingerprint == executionRequest.documentFingerprint &&
         currentSource.identity.resultRequestId == executionRequest.committedResultRequestId &&
         currentSource.identity.bodySignature == executionRequest.bodySignature && currentSource.bodies.size() == 1 &&
         body.id == executionRequest.sourceBody.id && body.geometryVersion == executionRequest.sourceBody.geometryVersion &&
         policy.id == executionRequest.policy.id && policy.version == executionRequest.policy.version &&
         policy.toleranceVersion == executionRequest.policy.toleranceVersion && recreated.ok &&
         recreated.request.id == executionRequest.id && recreated.request.executionAxis == executionRequest.executionAxis &&
         recreated.request.planeSequenceSignature == executionRequest.planeSequenceSignature &&
         deterministicSegmentationId("printer-volume", jPointXYZ(currentPrinterVolume)) == executionRequest.printerVolumeSignature;
}

// --- plane executor --------------------------------------------------------------------------------------------

namespace {

struct ExecutionFailure {
  std::string reasonCode;
  std::string message;
};
[[noreturn]] void fail(const std::string& code, const std::string& message) { throw ExecutionFailure{code, message}; }

bool finiteBounds(const Bounds3& b) {
  for (Axis a : kAxes) {
    if (!std::isfinite(b.min[ax(a)]) || !std::isfinite(b.max[ax(a)]) || !(b.max[ax(a)] > b.min[ax(a)])) return false;
  }
  return true;
}
bool boundsMatch(const Bounds3& l, const Bounds3& r, double tolerance) {
  for (Axis a : kAxes) {
    if (std::fabs(l.min[ax(a)] - r.min[ax(a)]) > tolerance || std::fabs(l.max[ax(a)] - r.max[ax(a)]) > tolerance) return false;
  }
  return true;
}
bool boundsInside(const Bounds3& inner, const Bounds3& outer, double tolerance) {
  for (Axis a : kAxes) {
    if (inner.min[ax(a)] < outer.min[ax(a)] - tolerance || inner.max[ax(a)] > outer.max[ax(a)] + tolerance) return false;
  }
  return true;
}
bool boundsOverlap(const Bounds3& l, const Bounds3& r, double tolerance) {
  for (Axis a : kAxes) {
    if (!(l.min[ax(a)] < r.max[ax(a)] - tolerance && l.max[ax(a)] > r.min[ax(a)] + tolerance)) return false;
  }
  return true;
}
bool straddlesPlane(const Bounds3& b, const SupportedPlaneCutIntent& plane, double tolerance) {
  return b.min[ax(plane.axis)] < plane.coordinateMm - tolerance && b.max[ax(plane.axis)] > plane.coordinateMm + tolerance;
}

Bounds3 boundsFromPayload(const MeshPayload& payload) {
  if (payload.positions.size() < 3 || payload.positions.size() % 3 != 0) {
    fail("invalid_output_geometry", "Serialized split output has invalid vertex positions.");
  }
  Bounds3 bounds = emptyBounds();
  for (std::size_t i = 0; i < payload.positions.size(); i += 3) {
    for (int a = 0; a < 3; ++a) {
      const double v = payload.positions[i + a];
      if (!std::isfinite(v)) fail("invalid_output_geometry", "Serialized split output has non-finite vertex positions.");
      bounds.min[a] = std::min(bounds.min[a], v);
      bounds.max[a] = std::max(bounds.max[a], v);
    }
  }
  if (!finiteBounds(bounds)) fail("invalid_output_geometry", "Serialized split output has invalid mesh bounds.");
  return bounds;
}

double payloadSerializationTolerance(const Bounds3& b) {
  double magnitude = 1;
  for (int a = 0; a < 3; ++a) magnitude = std::max({magnitude, std::fabs(b.min[a]), std::fabs(b.max[a])});
  return magnitude * std::ldexp(1.0, -23);
}

struct WorkingBody {
  MoldBody body;
  std::optional<SegmentationOutputProvenance> provenance;
  std::optional<bool> printable;  // validation.printableByBounds === true
};

bool workingLess(const WorkingBody& l, const WorkingBody& r) {
  for (Axis a : kAxes) {
    const double delta = l.body.bounds.min[ax(a)] - r.body.bounds.min[ax(a)] != 0
                             ? l.body.bounds.min[ax(a)] - r.body.bounds.min[ax(a)]
                             : l.body.bounds.max[ax(a)] - r.body.bounds.max[ax(a)];
    if (delta != 0) return delta < 0;
  }
  return l.body.id < r.body.id;
}

struct CutOutput {
  WorkingBody working;
  double volume = 0;
};

CutOutput createOutput(const SegmentationExecutionRequest& request, const WorkingBody& parent, const SolidPtr& solid,
                       IMeshGeometryEngine& engine, const SupportedPlaneCutIntent& plane, const std::string& side,
                       int cutIndex, std::size_t remainingFrom) {
  if (!solid->isValid()) fail("non_manifold_output", side + " split output is not a valid Manifold solid.");
  if (solid->isEmpty() || solid->triangleCount() == 0) fail("invalid_output_geometry", side + " split output is empty.");
  const std::size_t components = engine.decompose(solid).size();
  if (components != 1) {
    fail("detached_fragment_detected", side + " split output contains " + std::to_string(components) + " connected components.");
  }
  const double volume = solid->volume();
  if (!std::isfinite(volume) || volume <= 0) fail("invalid_output_geometry", side + " split output has invalid volume.");
  const Bounds3 manifoldBounds = solid->bounds();
  MeshPayload payload = engine.meshFromSolid(solid, {}, "Mesh export");
  const Bounds3 bounds = boundsFromPayload(payload);
  bool indicesOk = true;
  for (std::uint32_t index : payload.indices) indicesOk = indicesOk && index < payload.positions.size() / 3;
  if (!finiteBounds(manifoldBounds) || !indicesOk) fail("invalid_output_geometry", side + " split output has invalid indexed geometry.");

  const double serializationTolerance = std::max(request.policy.boundsToleranceMm, payloadSerializationTolerance(manifoldBounds));
  if (!boundsMatch(bounds, manifoldBounds, serializationTolerance)) {
    fail("invalid_output_geometry", side + " split output changed beyond Float32 serialization precision.");
  }
  const bool onExpectedSide = side == "positive" ? bounds.min[ax(plane.axis)] >= plane.coordinateMm - request.policy.sideToleranceMm
                                                 : bounds.max[ax(plane.axis)] <= plane.coordinateMm + request.policy.sideToleranceMm;
  if (!onExpectedSide || !boundsInside(bounds, parent.body.bounds, request.policy.boundsToleranceMm + serializationTolerance)) {
    fail("invalid_output_geometry", side + " split output is outside its immediate input bounds or plane side.");
  }
  const auto size = sizeOfBounds(bounds);
  const bool fits = size && evaluatePrintableSize(*size, request.printerVolume).status == FitStatus::Fits;
  bool futureCut = false;
  for (std::size_t i = remainingFrom; i < request.planes.size(); ++i) {
    futureCut = futureCut || straddlesPlane(bounds, request.planes[i], request.policy.sideToleranceMm);
  }
  if (!fits && !futureCut) fail("printer_fit_failed", side + " terminal split output does not fit the printer volume.");

  const Json seed = Json::object({{"parentBodyId", jStr(parent.body.id)},
                                  {"parentGeometryVersion", jStr(parent.body.geometryVersion)},
                                  {"acceptedPlanId", jStr(request.acceptedPlanId)},
                                  {"planeSequenceSignature", jStr(request.planeSequenceSignature)},
                                  {"boundary", toJson(plane.boundary)},
                                  {"side", jStr(side)},
                                  {"cutIndex", jNum(cutIndex)},
                                  {"policyId", jStr(request.policy.id)},
                                  {"policyVersion", jNum(request.policy.version)}});
  SegmentationOutputProvenance provenance;
  provenance.sourceBodyId = request.sourceBody.id;
  provenance.sourceGeometryVersion = request.sourceBody.geometryVersion;
  provenance.segmentationRequestId = request.segmentationRequestId;
  provenance.acceptedPlanId = request.acceptedPlanId;
  provenance.axis = plane.axis;
  provenance.boundaryId = plane.boundaryId;
  provenance.side = side;
  provenance.parentBodyId = parent.body.id;
  provenance.parentGeometryVersion = parent.body.geometryVersion;
  provenance.cutIndex = cutIndex;
  provenance.boundaryLineage = parent.provenance ? parent.provenance->boundaryLineage : std::vector<std::string>{};
  provenance.boundaryLineage.push_back(plane.boundaryId);
  provenance.executionRequestId = request.id;
  provenance.executionPolicyId = request.policy.id;
  provenance.executionPolicyVersion = request.policy.version;

  CutOutput out;
  out.volume = volume;
  MoldBody& body = out.working.body;
  body.id = deterministicSegmentationId("segmentation-body", seed);
  body.geometryVersion = deterministicSegmentationId("segmentation-geometry", seed);
  body.name = request.sourceBody.name + " (segment " + std::to_string(cutIndex + 1) + " " + side + ")";
  body.visible = request.sourceBody.visible;
  body.bounds = bounds;
  body.centroid = bounds.center();
  body.triangleCount = solid->triangleCount();
  body.volumeMm3 = volume;
  body.watertight = true;
  body.mesh = std::move(payload);
  out.working.provenance = std::move(provenance);
  out.working.printable = fits;
  return out;
}

struct CutResult {
  CutOutput negative, positive;
  SegmentationCutValidation validation;
};

CutResult splitOneBody(IMeshGeometryEngine& engine, const SegmentationExecutionRequest& request, const WorkingBody& input,
                       const SupportedPlaneCutIntent& plane, int cutIndex) {
  const SolidPtr source = engine.solidFromMesh(input.body.mesh, request.policy.linearToleranceMm, "Mesh preparation");
  if (engine.decompose(source).size() != 1) fail("detached_fragment_detected", "Cut input contains detached connected components.");
  const double inputVolume = source->volume();
  if (!std::isfinite(inputVolume) || inputVolume <= 0 || std::fabs(inputVolume - input.body.volumeMm3) > request.policy.volumeToleranceMm3) {
    fail(cutIndex == 0 ? "invalid_source_body" : "intermediate_cut_failed", "Cut input metadata does not match its Manifold geometry.");
  }
  auto [positive, negative] = engine.splitByPlane(source, plane.normal, plane.originOffset);
  CutOutput positiveOutput = createOutput(request, input, positive, engine, plane, "positive", cutIndex, cutIndex + 1);
  CutOutput negativeOutput = createOutput(request, input, negative, engine, plane, "negative", cutIndex, cutIndex + 1);

  const SolidPtr overlap = engine.intersect(positive, negative);
  if (!overlap->isValid()) fail("split_operation_failed", "Split overlap validation failed.");
  const double overlapVolume = std::fabs(overlap->volume());
  if (overlapVolume > request.policy.overlapToleranceMm3) fail("invalid_output_geometry", "Split outputs overlap beyond tolerance.");
  const double outputVolume = positiveOutput.volume + negativeOutput.volume;
  const double volumeDelta = std::fabs(outputVolume - inputVolume);
  if (volumeDelta > request.policy.volumeToleranceMm3) {
    fail("volume_conservation_failed", "Split output volume does not conserve its immediate input volume.");
  }
  CutResult result;
  result.validation = {cutIndex, plane.axis, plane.boundaryId, input.body.id, inputVolume, outputVolume, volumeDelta, overlapVolume};
  result.negative = std::move(negativeOutput);
  result.positive = std::move(positiveOutput);
  return result;
}

SegmentationExecutionResult cancellationResult(const SegmentationExecutionRequest& request, int cutIndex) {
  SegmentationExecutionResult r = executionResult("cancelled", "geometry-execution", "execution_cancelled",
                                                  "Segmentation execution was cancelled.", "split");
  r.executionRequest = request;
  r.diagnostics.front().message = "Execution stopped at a request-scoped cancellation checkpoint.";
  r.diagnostics.front().axis = request.executionAxis;
  r.diagnostics.front().cutIndex = cutIndex;
  r.diagnostics.front().cutCount = static_cast<int>(request.planes.size());
  return r;
}

}  // namespace

SegmentationExecutionResult executePlaneSegmentation(IMeshGeometryEngine& engine, const SegmentationExecutionRequest& request,
                                                     const CancellationToken& cancel) {
  const MoldBody& sourceBody = request.sourceBody;
  {
    bool valid = sourceBody.watertight && !request.sourceBody.geometryVersion.empty() && !sourceBody.mesh.positions.empty() &&
                 sourceBody.mesh.positions.size() % 3 == 0 && !sourceBody.mesh.indices.empty() &&
                 sourceBody.mesh.indices.size() % 3 == 0 && std::isfinite(sourceBody.volumeMm3) && sourceBody.volumeMm3 > 0 &&
                 finiteBounds(sourceBody.bounds);
    for (double v : sourceBody.mesh.positions) valid = valid && std::isfinite(v);
    for (std::uint32_t i : sourceBody.mesh.indices) valid = valid && i < sourceBody.mesh.positions.size() / 3;
    if (!valid) {
      SegmentationExecutionResult r = executionResult("failed", "geometry-execution", "invalid_source_body",
                                                      "The authoritative source body is invalid.", "preflight");
      r.executionRequest = request;
      return r;
    }
  }

  std::vector<WorkingBody> working;
  working.push_back({sourceBody, std::nullopt, std::nullopt});
  std::vector<SegmentationCutValidation> cuts;
  const SupportedPlaneCutIntent* activePlane = nullptr;
  int activeCutIndex = 0;
  std::size_t expectedFinalBodyCount = 1;

  try {
    for (std::size_t cutIndex = 0; cutIndex < request.planes.size(); ++cutIndex) {
      activeCutIndex = static_cast<int>(cutIndex);
      activePlane = &request.planes[cutIndex];
      if (cancel.isCancelled()) return cancellationResult(request, activeCutIndex);

      std::vector<std::size_t> targets;
      for (std::size_t i = 0; i < working.size(); ++i) {
        if (straddlesPlane(working[i].body.bounds, *activePlane, request.policy.sideToleranceMm)) targets.push_back(i);
      }
      const bool isExtensionBroadcast = activePlane->boundary.broadcastToAllStraddlingBodies;
      const bool isGridTargeting = activePlane->boundary.allStraddling;
      std::string upper = axisName(activePlane->axis);
      upper[0] = static_cast<char>(std::toupper(upper[0]));
      if (targets.empty()) fail("missing_cut_target", "No current body straddles the accepted " + upper + " plane.");
      if (!(isExtensionBroadcast || isGridTargeting) && targets.size() > 1) {
        fail("ambiguous_cut_target", "Multiple current bodies straddle the accepted " + upper + " plane.");
      }
      if (isExtensionBroadcast && targets.size() != working.size()) {
        fail("missing_cut_target", "A broadcast " + upper + " plane must straddle every currently active body, but only " +
                                       std::to_string(targets.size()) + " of " + std::to_string(working.size()) + " do.");
      }
      expectedFinalBodyCount += targets.size();

      std::vector<WorkingBody> produced;
      std::vector<bool> isTarget(working.size(), false);
      for (std::size_t t : targets) isTarget[t] = true;
      for (std::size_t t : targets) {
        CutResult result = splitOneBody(engine, request, working[t], *activePlane, activeCutIndex);
        produced.push_back(std::move(result.negative.working));
        produced.push_back(std::move(result.positive.working));
        cuts.push_back(result.validation);
      }
      std::vector<WorkingBody> next;
      for (std::size_t i = 0; i < working.size(); ++i) {
        if (!isTarget[i]) next.push_back(std::move(working[i]));
      }
      for (WorkingBody& p : produced) next.push_back(std::move(p));
      working = std::move(next);
      std::stable_sort(working.begin(), working.end(), workingLess);
    }

    if (working.size() != expectedFinalBodyCount) fail("unexpected_output_count", "The final body count does not match the accepted plane sequence.");
    bool grid = false;
    for (const SupportedPlaneCutIntent& p : request.planes) grid = grid || p.boundary.allStraddling;
    if (grid && working.size() != request.acceptedPlan.segments.size()) {
      fail("unexpected_output_count", "The final body count does not match the accepted Cartesian segmentation plan.");
    }

    SegmentationExecutionResult result;
    std::set<std::string> bodyIds, versions;
    for (const WorkingBody& w : working) {
      if (!w.provenance) fail("invalid_output_geometry", "The final working set contains an unexecuted source body.");
    }
    for (const WorkingBody& w : working) {
      if (!w.printable || !*w.printable) fail("printer_fit_failed", "Every final segmented body must fit the captured printer volume.");
      bodyIds.insert(w.body.id);
      versions.insert(w.body.geometryVersion);
    }
    if (bodyIds.size() != working.size() || versions.size() != working.size()) fail("invalid_output_geometry", "Final body identities are not unique.");

    double overlapVolume = 0;
    for (std::size_t l = 0; l < working.size(); ++l) {
      for (std::size_t r = l + 1; r < working.size(); ++r) {
        if (!boundsOverlap(working[l].body.bounds, working[r].body.bounds, request.policy.boundsToleranceMm)) continue;
        const SolidPtr left = engine.solidFromMesh(working[l].body.mesh, request.policy.linearToleranceMm, "Mesh preparation");
        const SolidPtr right = engine.solidFromMesh(working[r].body.mesh, request.policy.linearToleranceMm, "Mesh preparation");
        const SolidPtr overlap = engine.intersect(left, right);
        if (!overlap->isValid()) fail("split_operation_failed", "Aggregate overlap validation failed.");
        overlapVolume += std::fabs(overlap->volume());
      }
    }
    if (overlapVolume > request.policy.overlapToleranceMm3) fail("invalid_output_geometry", "Final bodies overlap beyond execution tolerance.");
    double outputVolume = 0;
    for (const WorkingBody& w : working) outputVolume += w.body.volumeMm3;
    const double sourceVolume = sourceBody.volumeMm3;
    const double volumeDelta = std::fabs(outputVolume - sourceVolume);
    if (volumeDelta > request.policy.volumeToleranceMm3 * static_cast<double>(cuts.size())) {
      fail("volume_conservation_failed", "Final body volume does not conserve root source volume.");
    }
    for (const WorkingBody& w : working) {
      if (!boundsInside(w.body.bounds, sourceBody.bounds, request.policy.boundsToleranceMm)) {
        fail("invalid_output_geometry", "A final body lies outside the authoritative source bounds.");
      }
    }

    result.status = "executed";
    result.executionRequest = request;
    for (WorkingBody& w : working) result.bodies.push_back({std::move(w.body), *w.provenance});
    result.validation = SegmentationExecutionValidation{sourceVolume, outputVolume, volumeDelta, overlapVolume, cuts, request.policy};
    result.diagnostics = {{"aggregate-validation", "",
                           std::to_string(request.planes.size()) + " ordered plane cut(s) produced " +
                               std::to_string(result.bodies.size()) + " valid bodies; manufacturing safety is not established.",
                           request.executionAxis, {}, -1, static_cast<int>(request.planes.size())}};
    return result;
  } catch (const ExecutionFailure& failure) {
    SegmentationExecutionResult r = executionResult(
        "failed", failure.reasonCode == "split_operation_failed" ? "geometry-execution" : "result-validation",
        failure.reasonCode, failure.message, "split");
    r.executionRequest = request;
    r.diagnostics.front().axis = activePlane ? activePlane->axis : request.executionAxis;
    if (activePlane) r.diagnostics.front().boundaryId = activePlane->boundaryId;
    r.diagnostics.front().cutIndex = activeCutIndex;
    r.diagnostics.front().cutCount = static_cast<int>(request.planes.size());
    return r;
  } catch (const std::exception& error) {
    SegmentationExecutionResult r = executionResult("failed", "geometry-execution", "split_operation_failed", error.what(), "split");
    r.executionRequest = request;
    r.diagnostics.front().axis = activePlane ? activePlane->axis : request.executionAxis;
    r.diagnostics.front().cutIndex = activeCutIndex;
    r.diagnostics.front().cutCount = static_cast<int>(request.planes.size());
    return r;
  }
}

// --- preview / committed registration ------------------------------------------------------------------------------

std::vector<MoldBody> buildSegmentationPlanPreviewBodies(const SegmentationPlan& plan, const ReferenceMoldDefinition& definition) {
  std::vector<const SegmentDefinition*> ordered;
  for (const SegmentDefinition& s : plan.segments) ordered.push_back(&s);
  std::stable_sort(ordered.begin(), ordered.end(), [](const auto* l, const auto* r) {
    return l->ordinal != r->ordinal ? l->ordinal < r->ordinal : l->id < r->id;
  });
  std::vector<MoldBody> bodies;
  for (const SegmentDefinition* s : ordered) {
    MoldBody body = createWholeMoldBody(s->predictedBounds, definition.definitionId + ":preview:" + s->id,
                                        "Planned Mold Section " + std::to_string(s->ordinal + 1));
    body.geometryVersion = deterministicSegmentationId(
        "segmentation-preview-body", Json::object({{"planId", jStr(plan.id)},
                                                   {"segmentId", jStr(s->id)},
                                                   {"bounds", jsonBounds(s->predictedBounds)}}));
    bodies.push_back(std::move(body));
  }
  return bodies;
}

DerivedRegistrationState generateSegmentationRegistration(IMeshGeometryEngine& engine, const SegmentationPlan& plan,
                                                          const SegmentationSourceSnapshot& source,
                                                          const ReferenceMoldDefinition& definition,
                                                          const std::vector<MoldBody>& bodies,
                                                          const std::string& revisionPrefix) {
  RegistrationDependencyInput input;
  input.bodies = bodies;
  input.definitionId = definition.definitionId;
  input.selectionBoxBounds = definition.selectionBoxBounds;
  input.referenceBlockBounds = definition.referenceMoldBlockBounds;
  input.referenceBlockClearanceMm = definition.clearanceMm;
  input.sizingPolicy = automaticSegmentationRegistrationSizingPolicy();
  RegistrationDependencySnapshot snapshot = buildRegistrationDependencySnapshot(input);

  std::vector<Json> regionJson;
  for (const SegmentationProtectedRegion& region : source.protectedRegions) {
    RegistrationProtectedRegion mapped;
    mapped.id = region.id;
    mapped.kind = region.source == "cavity" ? "cavity" : region.source == "sprue" ? "sprue" : "functional";
    mapped.bounds = region.bounds;
    regionJson.push_back(Json::object({{"id", jStr(mapped.id)}, {"kind", jStr(mapped.kind)}, {"bounds", jsonBounds(mapped.bounds)}}));
    snapshot.protectedRegions.push_back(std::move(mapped));
  }
  snapshot.revision = deterministicSegmentationId(
      revisionPrefix, Json::object({{"baseRevision", jStr(snapshot.revision)},
                                    {"planId", jStr(plan.id)},
                                    {"protectedRegions", Json::array(regionJson)}}));
  return generateDerivedRegistration(engine, snapshot);
}

}  // namespace craft
