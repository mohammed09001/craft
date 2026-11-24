// Segmentation unit tests with hand-derived expectations. Reference
// equivalence (ids, plans, execution, keyed registration) is in
// tst_segmentation_equivalence.

#include <QtTest/QtTest>

#include <cmath>

#include "ManifoldMeshEngine.h"
#include "geometry/MeshAnalysis.h"
#include "mold/Segmentation.h"

using namespace craft;

namespace {
Bounds3 box(double x0, double y0, double z0, double x1, double y1, double z1) { return {{x0, y0, z0}, {x1, y1, z1}}; }

PreliminarySource source(const Bounds3& part = box(-20, -15, 0, 20, 15, 12), double clearance = 10) {
  return *capturePreliminaryWholeBlockSnapshot(part, clearance, "test-model");
}

SegmentationPlan planFor(const PreliminarySource& s, const Point3& printer) {
  const auto request = createSegmentationRequest(s.snapshot, printer);
  const auto result = planSegmentation(request, s.snapshot);
  return *result.plan;
}
}  // namespace

class SegmentationTest : public QObject {
  Q_OBJECT
  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();

 private slots:
  // --- identity ----------------------------------------------------------------------------
  void canonicalJsonSortsKeysAndEscapes() {
    const Json value = Json::object({{"b", Json::number(1.5)},
                                     {"a", Json::string("q\"\\\n\t\x01")},
                                     {"c", Json::array({Json::boolean(true), Json::null(), Json::number(1e-7)})},
                                     {"omitted", Json()}});
    QCOMPARE(canonicalize(value), std::string("{\"a\":\"q\\\"\\\\\\n\\t\\u0001\",\"b\":1.5,\"c\":[true,null,1e-7]}"));
    // Non-finite numbers serialize as null, like JSON.stringify.
    QCOMPARE(canonicalize(Json::number(NAN)), std::string("null"));
  }

  void identityIsFnvOverTheCanonicalText() {
    const Json value = Json::object({{"x", Json::number(1)}});
    QCOMPARE(deterministicSegmentationId("p", value), "p:" + finishHash(hashText("{\"x\":1}")));
    QCOMPARE(deterministicSegmentationId("p", value), deterministicSegmentationId("p", value));
    QVERIFY(deterministicSegmentationId("p", value) != deterministicSegmentationId("q", Json::object({{"x", Json::number(2)}})));
    // Non-ASCII text hashes UTF-16 code units: U+00E9 is the single unit 0x00E9.
    std::uint32_t expected = kFingerprintSeed;
    for (unsigned unit : {0x22u, 0xE9u, 0x22u}) expected = (expected ^ unit) * 16777619u;
    QCOMPARE(deterministicSegmentationId("p", Json::string("\xC3\xA9")), "p:" + finishHash(expected));
    // U+1F600 is the surrogate pair D83D DE00.
    expected = kFingerprintSeed;
    for (unsigned unit : {0x22u, 0xD83Du, 0xDE00u, 0x22u}) expected = (expected ^ unit) * 16777619u;
    QCOMPARE(deterministicSegmentationId("p", Json::string("\xF0\x9F\x98\x80")), "p:" + finishHash(expected));
  }

  void keyOrderApproximatesLocaleCompare() {
    QVERIFY(localeKeyLess("algorithmId", "axis"));   // l < x
    QVERIFY(localeKeyLess("bodyId", "bodyIds"));     // prefix first
    QVERIFY(localeKeyLess("idA", "idB"));
    QVERIFY(localeKeyLess("Apple", "banana"));       // case-insensitive primary order
    QVERIFY(localeKeyLess("id", "Id"));              // lowercase before uppercase on a tie
    QVERIFY(!localeKeyLess("Id", "id"));
  }

  // --- fit -------------------------------------------------------------------------------------
  void fitIsInclusiveAtTheLimit() {
    const FitStageResult exact = evaluatePrintableSize({100, 100, 100}, {100, 100, 100});
    QCOMPARE(exact.status, FitStatus::Fits);
    const FitStageResult over = evaluatePrintableSize({100.001, 90, 120}, {100, 100, 100});
    QCOMPARE(over.status, FitStatus::DoesNotFit);
    QCOMPARE(over.failingAxes, (std::vector<Axis>{Axis::X, Axis::Z}));
    QVERIFY(!over.axisFit[0] && over.axisFit[1] && !over.axisFit[2]);
  }

  // --- source and planning -----------------------------------------------------------------------
  void automaticBlockUsesAtLeastOneHundredMillimetres() {
    const PreliminarySource small = source(box(-20, -15, 0, 20, 15, 12), 10);
    QCOMPARE(small.definition.clearanceMm, 100.0);
    QCOMPARE(small.snapshot.aggregateBounds, box(-120, -115, 0, 120, 115, 212));
    QCOMPARE(small.definition.partOffset, (Point3{0, 0, 100}));
    QCOMPARE(small.snapshot.bodies.size(), std::size_t{1});
    QCOMPARE(small.snapshot.bodies.front().volumeMm3, 240.0 * 230 * 212);
    QVERIFY(small.snapshot.bodies.front().geometryVersion.rfind("preliminary:", 0) == 0);
    QCOMPARE(small.snapshot.warnings.front().reasonCode, std::string("protected_region_evidence_incomplete"));
    QCOMPARE(source(box(-20, -15, 0, 20, 15, 12), 150).definition.clearanceMm, 150.0);
    QVERIFY(!capturePreliminaryWholeBlockSnapshot(box(0, 0, 0, 0, 1, 1), 10).has_value());
  }

  void sectionCountIsTheCeilingPerAxis() {
    const PreliminarySource s = source();  // block 240 x 230 x 212
    const SegmentationPlan plan = planFor(s, {100, 120, 300});  // 240/100 -> 3, 230/120 -> 2, z fits
    QCOMPARE(plan.requiredAxes, (std::vector<Axis>{Axis::X, Axis::Y}));
    QCOMPARE(plan.perAxisSegmentCount[0], 3);
    QCOMPARE(plan.perAxisSegmentCount[1], 2);
    QCOMPARE(plan.perAxisSegmentCount[2], 1);
    QCOMPARE(plan.segments.size(), std::size_t{6});
    QCOMPARE(plan.boundaries.size(), std::size_t{3});  // 2 on x + 1 on y
    QCOMPARE(plan.boundaries[0].coordinateMm, -120 + 240.0 / 3);
    QCOMPARE(plan.boundaries[2].axis, Axis::Y);
    QVERIFY(!plan.boundaries[0].allStraddling);  // first required axis: plain boundaries
    QVERIFY(plan.boundaries[2].allStraddling);   // later axes keep the Cartesian grid
    for (std::size_t i = 0; i < plan.boundaries.size(); ++i) QCOMPARE(plan.boundaries[i].sequenceIndex, static_cast<int>(i) + 1);
    for (const SegmentDefinition& seg : plan.segments) QCOMPARE(seg.predictedFit.status, FitStatus::Fits);
    QCOMPARE(plan.validation.status, std::string("planning-valid"));
    QCOMPARE(plan.validation.manufacturingSafety, std::string("not-established"));  // incomplete evidence
  }

  void invalidAndFittingInputsAreReported() {
    const PreliminarySource s = source();
    auto request = createSegmentationRequest(s.snapshot, {0, 100, 100});
    auto result = planSegmentation(request, s.snapshot);
    QCOMPARE(result.status, std::string("failed"));
    QCOMPARE(result.reasonCode, std::string("invalid_printer_volume"));
    request = createSegmentationRequest(s.snapshot, {240, 230, 212});  // exact fit
    result = planSegmentation(request, s.snapshot);
    QCOMPARE(result.status, std::string("not-required"));
    QCOMPARE(result.validation->status, std::string("planning-valid"));
    QCOMPARE(result.validation->manufacturingSafety, std::string("not-applicable"));
  }

  void hardRegionsBlockAndAdvisoryOnesWarn() {
    PreliminarySource s = source();
    SegmentationProtectedRegion region{"r", "cavity-surface", "cavity", "r", {}, box(-5, -50, 0, 5, 50, 100), "hard", 0};
    s.snapshot.protectedRegions = {region};
    auto result = planSegmentation(createSegmentationRequest(s.snapshot, {150, 300, 300}), s.snapshot);
    QCOMPARE(result.status, std::string("failed"));  // the x = 0 boundary lies inside the region
    QCOMPARE(result.issues.front().reasonCode, std::string("protected_region_conflict"));
    s.snapshot.protectedRegions[0].hardness = "advisory";
    result = planSegmentation(createSegmentationRequest(s.snapshot, {150, 300, 300}), s.snapshot);
    QCOMPARE(result.status, std::string("planned"));
    bool warned = false;
    for (const auto& w : result.plan->validation.warnings) warned = warned || w.reasonCode == "protected_region_conflict";
    QVERIFY(warned);
    QVERIFY(coordinateConflictsWithRegion(region, Axis::X, 4.9));
    QVERIFY(!coordinateConflictsWithRegion(region, Axis::X, 5.0));  // strict interior
  }

  void extensionsMergeDeterministically() {
    const PreliminarySource s = source();
    const SegmentationPlan base = planFor(s, {150, 300, 300});
    const double suggested = suggestExtensionAxisPosition(s.snapshot, Axis::Y);
    QCOMPARE(suggested, 0.0);  // midpoint of y (-115..115)
    const SegmentationPlan merged = mergeExtensionBoundary(base, Axis::Y, suggested);
    QCOMPARE(merged.segments.size(), std::size_t{4});
    QCOMPARE(merged.boundaries.back().broadcastToAllStraddlingBodies, true);
    QCOMPARE(merged.boundaries.back().sequenceIndex, 2);
    QVERIFY(merged.id != base.id);
    QCOMPARE(mergeExtensionBoundary(base, Axis::Y, suggested).id, merged.id);
    QCOMPARE(mergeExtensionBoundary(base, Axis::X, 3).id, base.id);  // a required axis is a no-op
    const SegmentationPlan outside = mergeExtensionBoundary(base, Axis::Y, 500);
    QCOMPARE(outside.validation.status, std::string("invalid"));
    QCOMPARE(outside.validation.blockers.back().reasonCode, std::string("invalid_authoritative_geometry"));
    const AxisOwnership owned = deriveAxisOwnership(merged.requiredAxes, {Axis::Z});
    QCOMPARE(owned.availableAxes, std::vector<Axis>{});
  }

  void suggestionStepsAwayFromHardRegions() {
    PreliminarySource s = source();
    s.snapshot.protectedRegions = {{"r", "cavity-surface", "cavity", "r", {}, box(-200, -10, 0, 200, 10, 100), "hard", 0}};
    // y midpoint 0 conflicts; the search steps +5% of the 230 mm span first.
    QCOMPARE(suggestExtensionAxisPosition(s.snapshot, Axis::Y), 0.05 * 230);
  }

  // --- execution ---------------------------------------------------------------------------------------
  void preflightRejectsUnsupportedShapes() {
    const PreliminarySource s = source();
    const SegmentationPlan plan = planFor(s, {150, 300, 300});
    SegmentationSourceSnapshot two = s.snapshot;
    two.bodies.push_back(two.bodies.front());
    QCOMPARE(createSegmentationExecutionRequest(plan, two, {150, 300, 300}).failure.reasonCode, std::string("unsupported_execution_shape"));

    SegmentationPlan tampered = plan;
    tampered.segments.pop_back();  // the boundary sequence would produce 2 bodies
    const auto mismatch = createSegmentationExecutionRequest(tampered, s.snapshot, {150, 300, 300});
    QVERIFY(!mismatch.ok);
    QCOMPARE(mismatch.failure.status, std::string("unsupported"));

    SegmentationPlan outside = plan;
    outside.boundaries[0].coordinateMm = 500;
    QCOMPARE(createSegmentationExecutionRequest(outside, s.snapshot, {150, 300, 300}).failure.reasonCode, std::string("unsupported_boundary_intent"));

    const PreliminarySource three = source();
    SegmentationPlan duplicate = planFor(three, {100, 300, 300});
    duplicate.boundaries[1].coordinateMm = duplicate.boundaries[0].coordinateMm;
    const auto dup = createSegmentationExecutionRequest(duplicate, three.snapshot, {100, 300, 300});
    QCOMPARE(dup.failure.reasonCode, std::string("duplicate_cut_plane"));

    SegmentationSourceSnapshot unversioned = s.snapshot;
    unversioned.bodies.front().geometryVersion = "  ";
    QCOMPARE(createSegmentationExecutionRequest(plan, unversioned, {150, 300, 300}).failure.reasonCode, std::string("invalid_source_body"));
  }

  void executionSplitsAndConservesVolume() {
    const PreliminarySource s = source();
    const SegmentationPlan plan = planFor(s, {100, 300, 300});  // 3 sections along x
    const auto preflight = createSegmentationExecutionRequest(plan, s.snapshot, {100, 300, 300});
    QVERIFY(preflight.ok);
    QCOMPARE(preflight.request.planes.size(), std::size_t{2});
    QCOMPARE(preflight.request.planes[0].normal, (Point3{1, 0, 0}));
    const auto result = executePlaneSegmentation(*engine_, preflight.request);
    QCOMPARE(result.status, std::string("executed"));
    QCOMPARE(result.bodies.size(), std::size_t{3});
    double volume = 0;
    for (const SegmentationExecutedBody& b : result.bodies) {
      volume += b.body.volumeMm3;
      QVERIFY(meshTopology(b.body.mesh).closedManifold());
      QVERIFY(b.body.bounds.size().x <= 100 + 1e-6);
      QCOMPARE(b.provenance.sourceBodyId, s.snapshot.bodies.front().id);
      QVERIFY(!b.provenance.boundaryLineage.empty());
    }
    QVERIFY(std::fabs(volume - 240.0 * 230 * 212) < 1e-3);
    // Ordered along x with no overlap.
    QVERIFY(result.bodies[0].body.bounds.max.x <= result.bodies[1].body.bounds.min.x + 1e-6);
    QCOMPARE(result.validation->cuts.size(), std::size_t{2});
    QVERIFY(result.validation->overlapVolumeMm3 <= preflight.request.policy.overlapToleranceMm3);
    QCOMPARE(result.diagnostics.front().message,
             std::string("2 ordered plane cut(s) produced 3 valid bodies; manufacturing safety is not established."));
  }

  void cancellationStopsBeforeTheFirstCut() {
    const PreliminarySource s = source();
    const SegmentationPlan plan = planFor(s, {150, 300, 300});
    const auto preflight = createSegmentationExecutionRequest(plan, s.snapshot, {150, 300, 300});
    CancellationToken cancel;
    cancel.cancel();
    const auto result = executePlaneSegmentation(*engine_, preflight.request, cancel);
    QCOMPARE(result.status, std::string("cancelled"));
    QCOMPARE(result.reasonCode, std::string("execution_cancelled"));
    QVERIFY(result.bodies.empty());
  }

  void aTerminalPieceThatDoesNotFitFailsValidation() {
    const PreliminarySource s = source();
    const SegmentationPlan plan = planFor(s, {150, 300, 300});
    auto preflight = createSegmentationExecutionRequest(plan, s.snapshot, {150, 300, 300});
    preflight.request.printerVolume = {100, 300, 300};  // pieces are 120 mm wide: no longer printable
    const auto result = executePlaneSegmentation(*engine_, preflight.request);
    QCOMPARE(result.status, std::string("failed"));
    QCOMPARE(result.reasonCode, std::string("printer_fit_failed"));
    QCOMPARE(result.stage, std::string("result-validation"));
  }

  void commitGateFollowsTheSourceAndPlan() {
    const PreliminarySource s = source();
    const SegmentationPlan plan = planFor(s, {150, 300, 300});
    const auto preflight = createSegmentationExecutionRequest(plan, s.snapshot, {150, 300, 300});
    const std::optional<SegmentationRequest> active = plan.request;
    QVERIFY(canCommitSegmentationExecution("executing", active, plan, preflight.request, s.snapshot, {150, 300, 300}));
    QVERIFY(!canCommitSegmentationExecution("planned", active, plan, preflight.request, s.snapshot, {150, 300, 300}));
    QVERIFY(!canCommitSegmentationExecution("executing", active, plan, preflight.request, s.snapshot, {151, 300, 300}));
    QVERIFY(!canCommitSegmentationExecution("executing", std::nullopt, plan, preflight.request, s.snapshot, {150, 300, 300}));
    const PreliminarySource other = source(box(-20, -15, 0, 20, 15, 14));
    QVERIFY(!canCommitSegmentationExecution("executing", active, plan, preflight.request, other.snapshot, {150, 300, 300}));
  }

  void previewBodiesFollowThePlan() {
    const PreliminarySource s = source();
    const SegmentationPlan plan = planFor(s, {150, 300, 300});
    const auto bodies = buildSegmentationPlanPreviewBodies(plan, s.definition);
    QCOMPARE(bodies.size(), std::size_t{2});
    QCOMPARE(bodies[0].name, std::string("Planned Mold Section 2"));  // the reference numbers from ordinal + 1
    QCOMPARE(bodies[0].bounds, plan.segments[0].predictedBounds);
    QVERIFY(bodies[0].id.find(":preview:") != std::string::npos);
    QVERIFY(meshTopology(bodies[0].mesh).closedManifold());
  }
};

QTEST_APPLESS_MAIN(SegmentationTest)
#include "tst_segmentation.moc"
