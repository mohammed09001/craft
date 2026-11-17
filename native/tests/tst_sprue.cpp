// Sprue tests: profile design arithmetic, normalisation rules, placement from
// a ray, and generation through the real kernel. Reference equivalence for
// generation lives in tst_reference_equivalence.

#include <QtTest/QtTest>

#include <cmath>

#include "ManifoldMeshEngine.h"
#include "TestMeshes.h"
#include "geometry/MeshAnalysis.h"
#include "mold/CavityGeneration.h"
#include "mold/SprueGeneration.h"

using namespace craft;
using craft::test::box;

namespace {
SprueGeometryContext contextFor(double volume, double totalLength) {
  return *buildSprueGeometryContext({volume, {20, 20, 20}, totalLength});
}
bool approx(double a, double b, double tol) { return std::fabs(a - b) <= tol; }

MoldGenerationResult cubeMold(IMeshGeometryEngine& engine, bool split = false) {
  MoldGenerationRequest request;
  request.modelId = "1:cube.stl:1";
  auto soup = std::make_shared<TriangleSoup>(test::soupFromMesh(test::cubeMesh(box(-10, -10, 0, 10, 10, 20))));
  request.partGeometryVersion = partGeometryVersion(*soup);
  request.groundedPart = std::move(soup);
  if (split) request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
  return generateMold(engine, request);
}

std::vector<MoldBody> bodiesOf(const MoldGenerationResult& r) {
  std::vector<MoldBody> bodies;
  for (const CavityMoldBody& b : r.cavity.bodies) bodies.push_back(b.body);
  return bodies;
}

SprueOperationDefinition intent(double x, double y, double z, const SprueProfileDesignResult& design) {
  SprueOperationDefinition d;
  d.operationId = "sprue:t";
  d.position = {x, y, z};
  d.profileDesign = design;
  return d;
}
}  // namespace

class SprueTest : public QObject {
  Q_OBJECT
  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();

 private slots:
  // --- profile design ---------------------------------------------------------
  void equivalentDiameterAndAspectRatio() {
    QVERIFY(approx(*calculateEquivalentDiameterMm(M_PI / 6 * 1000), 10.0, 1e-9));  // sphere d=10
    QVERIFY(!calculateEquivalentDiameterMm(0));
    QCOMPARE(*calculateCavityAspectRatio({10, 20, 40}), 4.0);
    QVERIFY(!calculateCavityAspectRatio({10, 0, 40}));
  }

  void mainDiameterFollowsEquationAndLimits() {
    // Equivalent diameter 100 mm -> 0.08 * 100 = 8 mm (equation).
    auto main = designMainSprueDiameterMm(contextFor(M_PI / 6 * 1e6, 50));
    QCOMPARE(main->source, SprueDesignSource::Equation);
    QVERIFY(approx(main->valueMm, 8.0, 1e-9));
    // Tiny cavity -> clamps to 2.5; huge cavity -> clamps to 20.
    QCOMPARE(designMainSprueDiameterMm(contextFor(100, 50))->valueMm, 2.5);
    QCOMPARE(designMainSprueDiameterMm(contextFor(100, 50))->source, SprueDesignSource::MinimumLimit);
    main = designMainSprueDiameterMm(contextFor(M_PI / 6 * 1e9, 50));
    QCOMPARE(main->valueMm, 20.0);
    QCOMPARE(main->source, SprueDesignSource::MaximumLimit);
    SprueGeometryPolicy bad;
    bad.entryNeckDiameterRatio = 1.5;
    QVERIFY(!designMainSprueDiameterMm(contextFor(1000, 50), bad));
  }

  void entryNeckDiameterNeverExceedsMain() {
    QVERIFY(approx(designEntryNeckDiameterMm(10)->valueMm, 7.0, 1e-12));
    QCOMPARE(designEntryNeckDiameterMm(3)->valueMm, 2.5);  // minimum, below the 2.1 equation value
    QCOMPARE(designEntryNeckDiameterMm(2.0)->valueMm, 2.0);  // capped by the main diameter
    QCOMPARE(designEntryNeckDiameterMm(40)->valueMm, 12.0);
    QVERIFY(!designEntryNeckDiameterMm(0));
  }

  void fullProfileIntegration() {
    const double volume = M_PI / 6 * 1e6;  // 100 mm equivalent sphere
    const auto integration = resolveSprueIntegration({volume, {100, 100, 100}, 60});
    QCOMPARE(integration.design.source, std::string("geometry-derived"));
    QVERIFY(approx(integration.design.profile.mainDiameterMm, 8.0, 1e-9));
    QVERIFY(approx(integration.design.profile.entryNeckDiameterMm, 5.6, 1e-9));
    // 5.6 * 1.6 = 8.96, below min(12, 60 * 0.4 = 24) -> equation.
    QVERIFY(approx(integration.design.profile.entryNeckLengthMm, 8.96, 1e-9));
    QCOMPARE(integration.design.entryNeckLength->source, SprueDesignSource::Equation);
    // Short stems cap the neck at 40% of their length.
    const auto shortStem = resolveSprueIntegration({volume, {100, 100, 100}, 10});
    QVERIFY(approx(shortStem.design.profile.entryNeckLengthMm, 4.0, 1e-9));
    QCOMPARE(shortStem.design.entryNeckLength->source, SprueDesignSource::MaximumLimit);
  }

  void unusableGeometryFallsBackToTheDefaultProfile() {
    const auto integration = resolveSprueIntegration({0, {0, 0, 0}, 5});
    QCOMPARE(integration.design.source, std::string("fallback"));
    QVERIFY(!integration.context);
    QCOMPARE(integration.design.profile, SprueProfileDimensions{});
    QCOMPARE(integration.design.warnings.front(), std::string("Sprue geometry context is unavailable. Default profile applied."));
  }

  void normalisationRules() {
    QCOMPARE(*normalizeSprueDiameterMm(1.0), 2.0);
    QCOMPARE(*normalizeSprueDiameterMm(80), 50.0);
    QCOMPARE(*normalizeSprueDiameterMm(3, 4), 4.0);  // coupled to the entry neck
    QVERIFY(!normalizeSprueDiameterMm(NAN));
    QCOMPARE(*normalizeSprueEntryNeckDiameterMm(9, 6), 6.0);  // never above the main diameter
    QCOMPARE(*normalizeSprueEntryNeckDiameterMm(1, 6), 2.0);
  }

  void tolerancePolicyMatchesFormulas() {
    MoldBody body;
    body.bounds = box(-20, -20, 0, 20, 20, 40);
    body.volumeMm3 = 64000;
    const auto p = buildSprueTolerancePolicy(body, 1e-6);
    const double diagonal = std::hypot(40.0, 40.0, 40.0);
    QCOMPARE(p.linearToleranceMm, 1e-6);  // diagonal * 1e-8 = 6.9e-7 is smaller
    QCOMPARE(p.surfaceToleranceMm, 4e-6);
    QCOMPARE(p.outsideMarginMm, std::max(8e-6, diagonal * 1e-6));
    QCOMPARE(p.beyondMarginMm, std::max(16e-6, diagonal * 2e-6));
    QCOMPARE(p.meaningfulVolumeMm3, std::max(64e-18, 64000 * 1e-12));
    body.bounds = box(0, 0, 0, 0, 1, 1);
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument, buildSprueTolerancePolicy(body, 1e-6));
  }

  // --- generation ---------------------------------------------------------------
  void sprueCutsTheCavityRoofAndRemovesTheExpectedVolume() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const auto design = resolveSprueIntegration({mold.cavity.cavityTool.solid.volumeMm3, {20, 20, 20}, 10}).design;
    const SprueEvaluation evaluation =
        evaluateSprues(*engine_, bodiesOf(mold), mold.cavity.cavityTool.solid.mesh, mold.cavity.sourceSignature,
                       "frame", {intent(0, 0, 40, design)});
    QCOMPARE(evaluation.resolvedSprues.size(), std::size_t{1});
    QCOMPARE(evaluation.definitions.front().validation.status, std::string("resolved"));
    QVERIFY(evaluation.warnings.empty());
    const SprueDefinition& sprue = evaluation.resolvedSprues.front();
    QCOMPARE(sprue.depthMm, 10.0);  // block top z=40 down to the cavity roof z=30
    QCOMPARE(sprue.targetBodyIds.size(), std::size_t{1});

    // Removed material = 32-gon prism of the profile: neck 4 mm @ d2.5 + main 6 mm @ d2.5,
    // plus the outside margin; the polygon area is 16 * r^2 * sin(2 pi / 16)... (32 sides).
    const double area = 0.5 * 32 * 1.25 * 1.25 * std::sin(2 * M_PI / 32);
    const MoldBody& body = evaluation.bodies.front();
    const double removed = mold.cavity.bodies.front().body.volumeMm3 - body.volumeMm3;
    QVERIFY(approx(removed, area * 10.0, 1e-6));
    QCOMPARE(body.sprueOperationId, std::string("sprue:t"));
    QVERIFY(meshTopology(body.mesh).closedManifold());
    QVERIFY(approx(signedVolume(body.mesh), body.volumeMm3, body.volumeMm3 * 1e-9));
    std::size_t funnel = 0;
    for (const MeshFaceRun& run : body.mesh.faceRuns) {
      if (run.role == FaceRole::SprueFunnel) funnel += run.triangleCount;
    }
    QVERIFY(funnel > 0);
  }

  void generationIsDeterministicAndDoesNotMutateInputs() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const auto design = resolveSprueIntegration({mold.cavity.cavityTool.solid.volumeMm3, {20, 20, 20}, 10}).design;
    const auto bodies = bodiesOf(mold);
    const auto run = [&] {
      return evaluateSprues(*engine_, bodies, mold.cavity.cavityTool.solid.mesh, mold.cavity.sourceSignature,
                            "frame", {intent(0, 0, 40, design)});
    };
    const auto a = run();
    const auto b = run();
    QCOMPARE(a.bodies.front().geometryVersion, b.bodies.front().geometryVersion);
    QVERIFY(a.bodies.front().geometryVersion != bodies.front().geometryVersion);
    QCOMPARE(bodies.front().sprueOperationId, std::string());
  }

  void moldRevisionChangesTheDerivedVersion() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const auto design = resolveSprueIntegration({mold.cavity.cavityTool.solid.volumeMm3, {20, 20, 20}, 10}).design;
    const auto a = evaluateSprues(*engine_, bodiesOf(mold), mold.cavity.cavityTool.solid.mesh, "sig-a", "f", {intent(0, 0, 40, design)});
    const auto b = evaluateSprues(*engine_, bodiesOf(mold), mold.cavity.cavityTool.solid.mesh, "sig-b", "f", {intent(0, 0, 40, design)});
    QVERIFY(a.bodies.front().geometryVersion != b.bodies.front().geometryVersion);
  }

  void failuresAreStructuredAndLaterSpruesStillRun() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const auto design = resolveSprueIntegration({mold.cavity.cavityTool.solid.volumeMm3, {20, 20, 20}, 10}).design;
    SprueOperationDefinition bad = intent(15, 0, 40, design);  // beside the cavity
    bad.operationId = "sprue:bad";
    bad.creationOrder = 0;
    SprueOperationDefinition good = intent(0, 0, 40, design);
    good.operationId = "sprue:good";
    good.creationOrder = 1;
    const auto evaluation = evaluateSprues(*engine_, bodiesOf(mold), mold.cavity.cavityTool.solid.mesh,
                                           mold.cavity.sourceSignature, "frame", {good, bad});  // order given reversed
    QCOMPARE(evaluation.definitions.size(), std::size_t{2});
    QCOMPARE(evaluation.definitions[0].operationId, std::string("sprue:bad"));  // sorted by creationOrder
    QCOMPARE(evaluation.definitions[0].validation.reasonCode, std::string("SPRUE_DOES_NOT_REACH_CAVITY"));
    QCOMPARE(evaluation.definitions[1].validation.status, std::string("resolved"));
    QCOMPARE(evaluation.warnings.size(), std::size_t{1});
  }

  void inputValidationCodes() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    SprueGenerationInput input;
    input.operationId = "s";
    input.position = {0, 0, 40};
    input.profileDesign.profile = {2.5, 2.5, 4};
    input.targetBodies = bodiesOf(mold);
    input.cavity = mold.cavity.cavityTool.solid.mesh;

    auto codeFor = [&](const SprueGenerationInput& in) { return generateSprue(*engine_, in).failure.reasonCode; };
    SprueGenerationInput missingBodies = input;
    missingBodies.targetBodies.clear();
    QCOMPARE(codeFor(missingBodies), std::string("SPRUE_TARGET_BODY_MISSING"));
    SprueGenerationInput noCavity = input;
    noCavity.cavity = {};
    QCOMPARE(codeFor(noCavity), std::string("SPRUE_CAVITY_MISSING"));
    SprueGenerationInput badProfile = input;
    badProfile.profileDesign.profile = {2.0, 3.0, 4};  // neck wider than main
    QCOMPARE(codeFor(badProfile), std::string("SPRUE_INVALID_PROFILE"));
    SprueGenerationInput tiny = input;
    tiny.profileDesign.profile = {1e-6, 1e-6, 1e-6};
    QCOMPARE(codeFor(tiny), std::string("SPRUE_INVALID_PROFILE"));
    SprueGenerationInput nan = input;
    nan.position.x = NAN;
    QCOMPARE(codeFor(nan), std::string("SPRUE_INVALID_PLACEMENT"));
    SprueGenerationInput duplicate = input;
    duplicate.targetBodies.push_back(duplicate.targetBodies.front());
    QCOMPARE(codeFor(duplicate), std::string("SPRUE_RESULT_INVALID"));
    SprueGenerationInput off = input;
    off.position.z = 39;
    QCOMPARE(codeFor(off), std::string("SPRUE_NOT_ON_TOP_FACE"));
    QVERIFY(generateSprue(*engine_, input).success);
  }

  // --- placement ------------------------------------------------------------------
  void placementOnTheTopFaceReachesTheCavity() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const SprueCavityFacts facts{&mold.cavity.cavityTool.solid.mesh, mold.cavity.cavityTool.solid.volumeMm3,
                                 mold.cavity.cavityTool.solid.bounds};
    const auto placement =
        computeSpruePlacement(Ray{{0.5, 0.25, 100}, {0, 0, -1}}, bodiesOf(mold), 40.0, facts);
    QVERIFY(placement.has_value());
    QVERIFY(placement->valid);
    QCOMPARE(placement->topPoint, (Point3{0.5, 0.25, 40}));
    QVERIFY(approx(placement->cavityPoint.z, 30.0, 1e-9));
    QVERIFY(approx(placement->stemLengthMm, 10.0, 1e-9));
    QCOMPARE(placement->profileDesign.source, std::string("geometry-derived"));
    QCOMPARE(placement->profileDesign.profile.entryNeckLengthMm, 4.0);  // 40% of the 10 mm stem
  }

  void placementOverSolidMaterialIsInvalidButReportsAStem() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const SprueCavityFacts facts{&mold.cavity.cavityTool.solid.mesh, mold.cavity.cavityTool.solid.volumeMm3,
                                 mold.cavity.cavityTool.solid.bounds};
    const auto placement = computeSpruePlacement(Ray{{15, 0, 100}, {0, 0, -1}}, bodiesOf(mold), 40.0, facts);
    QVERIFY(placement.has_value());
    QVERIFY(!placement->valid);
    QVERIFY(approx(placement->stemLengthMm, 40.0, 1e-9));  // down to the body floor
  }

  void placementRejectsSidesAndMisses() {
    const MoldGenerationResult mold = cubeMold(*engine_);
    const SprueCavityFacts facts{&mold.cavity.cavityTool.solid.mesh, mold.cavity.cavityTool.solid.volumeMm3,
                                 mold.cavity.cavityTool.solid.bounds};
    // Side wall: normal is horizontal.
    QVERIFY(!computeSpruePlacement(Ray{{100, 0, 20}, {-1, 0, 0}}, bodiesOf(mold), 40.0, facts));
    // Miss.
    QVERIFY(!computeSpruePlacement(Ray{{100, 100, 100}, {0, 0, -1}}, bodiesOf(mold), 40.0, facts));
    // Bottom face seen from below: not the top plane.
    QVERIFY(!computeSpruePlacement(Ray{{0, 0, -50}, {0, 0, 1}}, bodiesOf(mold), 40.0, facts));
    // Without a cavity the placement is invalid but still produced.
    const auto noCavity = computeSpruePlacement(Ray{{0, 0, 100}, {0, 0, -1}}, bodiesOf(mold), 40.0, {});
    QVERIFY(noCavity && !noCavity->valid);
  }

  void splitMoldCutsOnlyTheBodyUnderTheSprue() {
    const MoldGenerationResult mold = cubeMold(*engine_, true);
    const auto design = resolveSprueIntegration({mold.cavity.cavityTool.solid.volumeMm3, {20, 20, 20}, 10}).design;
    const auto evaluation = evaluateSprues(*engine_, bodiesOf(mold), mold.cavity.cavityTool.solid.mesh,
                                           mold.cavity.sourceSignature, "frame", {intent(0, 0, 40, design)});
    QCOMPARE(evaluation.resolvedSprues.front().targetBodyIds.size(), std::size_t{1});
    QCOMPARE(evaluation.bodies[0].sprueOperationId, std::string());
    QCOMPARE(evaluation.bodies[1].sprueOperationId, std::string("sprue:t"));
    QCOMPARE(evaluation.bodies[0].volumeMm3, mold.cavity.bodies[0].body.volumeMm3);  // untouched
  }
};

QTEST_APPLESS_MAIN(SprueTest)
#include "tst_sprue.moc"
