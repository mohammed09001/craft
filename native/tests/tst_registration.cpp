// Registration tests with hand-derived expectations. Reference equivalence
// (ids, features, geometry, key triangles) is in tst_reference_equivalence.

#include <QtTest/QtTest>

#include <cmath>

#include "ManifoldMeshEngine.h"
#include "TestMeshes.h"
#include "geometry/MeshAnalysis.h"
#include "mold/Registration.h"

using namespace craft;
using craft::test::box;

namespace {

MoldBody bodyFrom(const std::string& id, const Bounds3& bounds) {
  MoldBody body;
  body.id = id;
  body.name = id;
  body.bounds = bounds;
  body.mesh = test::cubeMesh(bounds);
  body.triangleCount = body.mesh.triangleCount();
  const Point3 s = bounds.size();
  body.volumeMm3 = s.x * s.y * s.z;
  body.geometryVersion = meshGeometryVersion(id, body.mesh, bounds);
  return body;
}

/// Two 40 x 40 x 10 blocks stacked on the plane z = 10.
std::vector<MoldBody> stackedPair() {
  return {bodyFrom("a", box(0, 0, 0, 40, 40, 10)), bodyFrom("b", box(0, 0, 10, 40, 40, 20))};
}

RegistrationProtectedRegion regionOf(const std::string& id, const std::string& kind, const Bounds3& bounds,
                                     bool withMesh = true) {
  RegistrationProtectedRegion region;
  region.id = id;
  region.kind = kind;
  region.bounds = bounds;
  if (withMesh) region.mesh = test::cubeMesh(bounds);
  return region;
}

bool approx(double a, double b, double tol) { return std::fabs(a - b) <= tol; }
}  // namespace

class RegistrationTest : public QObject {
  Q_OBJECT
  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();

 private slots:
  void javascriptNumberFormatting() {
    QCOMPARE(jsNumberToString(0), std::string("0"));
    QCOMPARE(jsNumberToString(-0.0), std::string("0"));
    QCOMPARE(jsNumberToString(100), std::string("100"));
    QCOMPARE(jsNumberToString(1.5), std::string("1.5"));
    QCOMPARE(jsNumberToString(-2.5), std::string("-2.5"));
    QCOMPARE(jsNumberToString(0.1 + 0.2), std::string("0.30000000000000004"));
    QCOMPARE(jsNumberToString(0.000001), std::string("0.000001"));
    QCOMPARE(jsNumberToString(1e-7), std::string("1e-7"));
    QCOMPARE(jsNumberToString(5e-7), std::string("5e-7"));
    QCOMPARE(jsNumberToString(1e21), std::string("1e+21"));
    QCOMPARE(jsNumberToString(123456789012345680000.0), std::string("123456789012345680000"));
  }

  void defaultTolerancePolicy() {
    const auto p = resolveRegistrationTolerance(std::nullopt);
    QCOMPARE(p.policyId, std::string("registration-conservative-fdm-v1"));
    QCOMPARE(p.radialClearanceMm, 0.3);
    QCOMPARE(p.minimumWallMm, 1.2);
    QCOMPARE(p.minimumFeatureRadiusMm, 0.8);
    QCOMPARE(p.maximumFeatureRadiusMm, 2.5);
    QCOMPARE(p.booleanToleranceMm, 5e-5);
    QCOMPARE(p.cavitySafetyMarginMm, 1.2);
    QCOMPARE(p.outerEdgeMarginMm, 1.2);

    RegistrationManufacturingProfile resin;
    resin.process = "resin";
    resin.xyAccuracyMm = 0.05;
    const auto r = resolveRegistrationTolerance(resin);
    QCOMPARE(r.policyId, std::string("registration-resin-v1"));
    QCOMPARE(r.radialClearanceMm, 0.15);  // max(0.15, 0.09)
    QCOMPARE(r.maximumFeatureRadiusMm, 10.0);

    RegistrationSizingPolicy wide;
    wide.preferredNominalWidthMm = 30;
    QCOMPARE(applyRegistrationSizingToTolerancePolicy(p, wide).maximumFeatureRadiusMm, 15.0);
    QCOMPARE(applyRegistrationSizingToTolerancePolicy(p, normalMoldRegistrationSizingPolicy()).maximumFeatureRadiusMm, 2.5);
  }

  void detectsTheSharedPlane() {
    const auto interfaces = detectMatingInterfaces(stackedPair(), 1e-3);
    QCOMPARE(interfaces.size(), std::size_t{1});
    const RegistrationInterface& i = interfaces.front();
    QCOMPARE(i.bodyAId, std::string("a"));  // the lower body
    QCOMPARE(i.bodyBId, std::string("b"));
    QCOMPARE(i.axis, Axis::Z);
    QCOMPARE(i.planeCoordinateMm, 10.0);
    QCOMPARE(i.matingBounds, box(0, 0, 10, 40, 40, 10));
    QCOMPARE(i.assemblyDirection, (Point3{0, 0, 1}));
    QVERIFY(i.id.rfind("mold-interface:", 0) == 0);
    QCOMPARE(detectMatingInterfaces(stackedPair(), 1e-3).front().id, i.id);  // deterministic

    // Touching only along an edge or a gap is not an interface.
    QVERIFY(detectMatingInterfaces({bodyFrom("a", box(0, 0, 0, 10, 10, 10)), bodyFrom("b", box(10, 10, 10, 20, 20, 20))}, 1e-3).empty());
    QVERIFY(detectMatingInterfaces({bodyFrom("a", box(0, 0, 0, 10, 10, 10)), bodyFrom("b", box(0, 0, 11, 10, 10, 21))}, 1e-3).empty());
  }

  void twoPartPlanUsesAsymmetricLeftRightKeys() {
    const auto bodies = stackedPair();
    const auto policy = resolveRegistrationTolerance(std::nullopt);
    const auto interfaces = detectMatingInterfaces(bodies, 1e-3);
    const auto attempts = planRegistrationLayout(interfaces.front(), bodies, {}, policy, {}, &interfaces);
    QVERIFY(!attempts.empty());
    const RegistrationLayoutAttempt& attempt = attempts.front();  // smallest profile first
    QCOMPARE(attempt.radiusMm, 1.2);
    QCOMPARE(attempt.candidates.size(), std::size_t{2});
    const RegistrationFeature& left = attempt.candidates[0];
    const RegistrationFeature& right = attempt.candidates[1];
    QCOMPARE(left.side, KeySide::Left);
    QCOMPARE(right.side, KeySide::Right);
    QCOMPARE(left.geometry.widthMm, 2.4);
    QCOMPARE(left.geometry.depthMm, 1.0);
    // Equal thickness: the lexicographically smaller id receives the groove.
    QCOMPARE(left.femaleBodyId, std::string("a"));
    QCOMPARE(left.maleBodyId, std::string("b"));
    // Corridors sit at the edge margin (1.2 + 0.2) plus half the key width.
    QCOMPARE(left.startPoint.x, 2.6);
    QCOMPARE(right.startPoint.x, 37.4);
    QCOMPARE(left.startPoint.z, 10.0);
    // Length differential prevents assembling the halves rotated by 180 degrees.
    QCOMPARE(left.geometry.lengthMm, 34.0);
    QCOMPARE(right.geometry.lengthMm, 28.0);
    QCOMPARE(left.startPoint.y, 2.2);
    QCOMPARE(right.startPoint.y, 5.8);
    QCOMPARE(left.direction, (Point3{0, 1, 0}));
    QCOMPARE(left.normal, (Point3{0, 0, -1}));  // towards the female body, which is body A (below)
    QCOMPARE(left.clearanceMm, policy.radialClearanceMm);
    QVERIFY(left.id != right.id);
  }

  void preferredFirstSearchStartsFromTheLargestProfile() {
    const auto bodies = stackedPair();
    const auto interfaces = detectMatingInterfaces(bodies, 1e-3);
    RegistrationSizingPolicy sizing;
    sizing.preferredNominalWidthMm = 30;
    sizing.profileSearchOrder = ProfileSearchOrder::PreferredFirst;
    const auto policy = applyRegistrationSizingToTolerancePolicy(resolveRegistrationTolerance(std::nullopt), sizing);
    const auto attempts = planRegistrationLayout(interfaces.front(), bodies, {}, policy, {}, &interfaces, sizing);
    QVERIFY(attempts.size() >= 2);
    // Profile 3 width = min(30, max(2.4, 40 * 0.11 = 4.4)) = 4.4; profile 0 is 2.4.
    QCOMPARE(attempts.front().radiusMm, 2.2);
    QCOMPARE(attempts.back().radiusMm, 1.2);
  }

  void protectedRegionsAndThinBodiesBlockPlanning() {
    const auto bodies = stackedPair();
    const auto policy = resolveRegistrationTolerance(std::nullopt);
    const auto interfaces = detectMatingInterfaces(bodies, 1e-3);
    // A cavity that covers the whole interface leaves no safe area.
    const std::vector<RegistrationProtectedRegion> cavity{regionOf("product-cavity", "cavity", box(-5, -5, 5, 45, 45, 15))};
    QVERIFY(planRegistrationLayout(interfaces.front(), bodies, cavity, policy, {}, &interfaces).empty());
    // A cavity in the middle only narrows the corridor around it.
    const std::vector<RegistrationProtectedRegion> middle{regionOf("product-cavity", "cavity", box(15, 15, 5, 25, 25, 15))};
    QVERIFY(!planRegistrationLayout(interfaces.front(), bodies, middle, policy, {}, &interfaces).empty());
    // Bodies at or under 1.05 x the minimum wall cannot carry a key.
    const std::vector<MoldBody> thin{bodyFrom("a", box(0, 0, 0, 40, 40, 1.2)), bodyFrom("b", box(0, 0, 1.2, 40, 40, 2.4))};
    const auto thinInterfaces = detectMatingInterfaces(thin, 1e-3);
    QVERIFY(planRegistrationLayout(thinInterfaces.front(), thin, {}, policy, {}, &thinInterfaces).empty());
    // A mating face narrower than two key radii is rejected up front.
    const std::vector<MoldBody> narrow{bodyFrom("a", box(0, 0, 0, 1.0, 40, 10)), bodyFrom("b", box(0, 0, 10, 1.0, 40, 20))};
    const auto narrowInterfaces = detectMatingInterfaces(narrow, 1e-3);
    QVERIFY(planRegistrationLayout(narrowInterfaces.front(), narrow, {}, policy, {}, &narrowInterfaces).empty());
  }

  void wallThicknessFieldIsExactDistanceToTheKeepOut() {
    WallThicknessField none({}, 1e-4);
    QVERIFY(std::isinf(none.clearanceAt({0, 0, 0})));
    const std::vector<RegistrationProtectedRegion> regions{regionOf("c", "cavity", box(10, 10, 10, 20, 20, 20)),
                                                            regionOf("v", "vent", box(0, 0, 0, 1, 1, 1), false)};
    WallThicknessField field(regions, 1e-4);  // regions without a mesh are ignored
    QVERIFY(approx(field.clearanceAt({25, 15, 15}), 5.0, 1e-9));
    QVERIFY(field.clearanceAt({15, 15, 15}) < 0);  // inside the cavity: negative clearance
  }

  void generationAddsTonguesAndCutsGrooves() {
    RegistrationRequest request;
    request.sourceRevision = "rev";
    request.bodies = stackedPair();
    const RegistrationResult result = generateRegistration(*engine_, request);
    QCOMPARE(result.report.status, std::string("generated"));
    QCOMPARE(result.report.reasonCode, std::string("registration_generated"));
    QCOMPARE(result.report.message,
             std::string("2 complementary linear registration keys were generated across 1 mating interface."));
    QCOMPARE(result.report.features.size(), std::size_t{2});
    for (const RegistrationFeature& f : result.report.features) QCOMPARE(f.status, std::string("generated"));
    QCOMPARE(result.bodies.size(), std::size_t{2});

    const MoldBody& female = result.bodies[0];  // "a": grooves
    const MoldBody& male = result.bodies[1];    // "b": tongues
    QVERIFY(male.volumeMm3 > 16000.0);
    QVERIFY(female.volumeMm3 < 16000.0);
    for (const MoldBody& body : result.bodies) {
      QVERIFY(meshTopology(body.mesh).closedManifold());
      QVERIFY(approx(signedVolume(body.mesh), body.volumeMm3, body.volumeMm3 * 1e-9));
      std::size_t keys = 0;
      for (const MeshFaceRun& run : body.mesh.faceRuns) {
        if (run.role == FaceRole::RegistrationKey) keys += run.triangleCount;
      }
      QVERIFY(keys > 0);
      QVERIFY(body.geometryVersion.rfind("registration:", 0) == 0);
    }
    // The groove is wider than the tongue by the radial clearance, so the
    // material removed from the female exceeds the material added to the male.
    QVERIFY(16000.0 - female.volumeMm3 > male.volumeMm3 - 16000.0);
    // Bounds do not grow: tongues stay within the mating footprint.
    QCOMPARE(female.bounds, box(0, 0, 0, 40, 40, 10));
    QVERIFY(male.bounds.max.z <= 20.0 + 1e-6);
  }

  void generationIsDeterministic() {
    RegistrationRequest request;
    request.sourceRevision = "rev";
    request.bodies = stackedPair();
    const auto a = generateRegistration(*engine_, request);
    const auto b = generateRegistration(*engine_, request);
    QCOMPARE(a.bodies[0].geometryVersion, b.bodies[0].geometryVersion);
    QCOMPARE(a.report.features[1].id, b.report.features[1].id);
    QCOMPARE(a.bodies[1].volumeMm3, b.bodies[1].volumeMm3);
  }

  void blockedOutcomesPreserveTheMold() {
    RegistrationRequest request;
    request.sourceRevision = "rev";
    request.bodies = stackedPair();

    RegistrationRequest ineligible = request;
    ineligible.eligible = false;
    auto result = generateRegistration(*engine_, ineligible);
    QCOMPARE(result.report.reasonCode, std::string("registration_ineligible"));
    QCOMPARE(result.bodies[0].geometryVersion, request.bodies[0].geometryVersion);

    RegistrationRequest single = request;
    single.bodies.pop_back();
    result = generateRegistration(*engine_, single);
    QCOMPARE(result.report.reasonCode, std::string("registration_interface_not_found"));
    QCOMPARE(result.report.status, std::string("blocked"));

    RegistrationRequest covered = request;
    covered.protectedRegions = {regionOf("product-cavity", "cavity", box(-5, -5, 5, 45, 45, 15))};
    result = generateRegistration(*engine_, covered);
    QCOMPARE(result.report.reasonCode, std::string("registration_insufficient_safe_area"));
    QVERIFY(result.report.message.find("safe area clearance constraints") != std::string::npos);
    QCOMPARE(result.bodies[1].mesh.positions, request.bodies[1].mesh.positions);  // untouched
  }

  void meshGeometryAtAKeyDropsOnlyThatKeyViaTheExactWallCheck() {
    RegistrationRequest request;
    request.sourceRevision = "rev";
    request.bodies = stackedPair();
    // The region's declared bounds are far away, so the planner's bounds test
    // lets every key through; its mesh sits on the left key. The exact
    // signed-distance wall check must refuse that key and keep the other.
    RegistrationProtectedRegion vent = regionOf("vent", "vent", box(100, 100, 100, 101, 101, 101));
    vent.mesh = test::cubeMesh(box(1.5, 10, 9, 3.7, 20, 11));
    request.protectedRegions = {vent};
    const RegistrationResult result = generateRegistration(*engine_, request);
    QCOMPARE(result.report.status, std::string("generated"));
    QCOMPARE(result.report.features.size(), std::size_t{1});
    QCOMPARE(result.report.features.front().side, KeySide::Right);
    QCOMPARE(result.report.message,
             std::string("1 complementary linear registration keys were generated across 1 mating interface."));

    // With the keep-out covering both corridors nothing is safe by wall thickness.
    RegistrationProtectedRegion both = regionOf("vent", "vent", box(100, 100, 100, 101, 101, 101));
    both.mesh = test::cubeMesh(box(0.5, 1, 9, 39.5, 39, 11));
    request.protectedRegions = {both};
    const RegistrationResult blockedResult = generateRegistration(*engine_, request);
    QCOMPARE(blockedResult.report.status, std::string("blocked"));
    QCOMPARE(blockedResult.report.reasonCode, std::string("registration_insufficient_wall_thickness"));
    QVERIFY(blockedResult.report.message.find("wall thickness constraints") != std::string::npos);
    QVERIFY(!blockedResult.report.attempts.empty());
    QCOMPARE(blockedResult.report.attempts.front().selectedCount, std::size_t{0});
    QCOMPARE(blockedResult.bodies[0].mesh.positions, request.bodies[0].mesh.positions);
  }
  void dependencySnapshotTracksItsInputs() {
    RegistrationDependencyInput input;
    input.bodies = stackedPair();
    input.definitionId = "def";
    input.selectionBoxBounds = box(5, 5, 5, 35, 35, 15);
    input.referenceBlockBounds = box(0, 0, 0, 40, 40, 20);
    input.referenceBlockClearanceMm = 5;
    input.cavityRevision = "cav-1";
    const auto base = buildRegistrationDependencySnapshot(input);
    QCOMPARE(base.interfaces.size(), std::size_t{1});
    QVERIFY(base.protectedRegions.empty());
    QVERIFY(base.revision.rfind("registration-input:", 0) == 0);
    QCOMPARE(buildRegistrationDependencySnapshot(input).revision, base.revision);

    input.cavityRevision = "cav-2";
    QVERIFY(buildRegistrationDependencySnapshot(input).revision != base.revision);
    input.cavityRevision = "cav-1";
    input.sizingPolicy.policyId = "registration-sizing-automatic-segmentation-v5";
    QVERIFY(buildRegistrationDependencySnapshot(input).revision != base.revision);

    // Cavity and sprites become protected regions (cavity first).
    const MeshPayload cavity = test::cubeMesh(box(10, 10, 5, 30, 30, 15));
    input.sizingPolicy = normalMoldRegistrationSizingPolicy();
    input.cavityMesh = &cavity;
    input.cavityBounds = box(10, 10, 5, 30, 30, 15);
    SprueDefinition sprue;
    sprue.operationId = "sprue:1";
    sprue.position = {20, 20, 20};
    sprue.inwardDirection = {0, 0, -1};
    sprue.profile = {2.5, 2.5, 4};
    sprue.depthMm = 5;
    sprue.tolerancePolicy.surfaceToleranceMm = 4e-6;
    input.sprues = {sprue};
    const auto withRegions = buildRegistrationDependencySnapshot(input);
    QCOMPARE(withRegions.protectedRegions.size(), std::size_t{2});
    QCOMPARE(withRegions.protectedRegions[0].id, std::string("product-cavity"));
    QCOMPARE(withRegions.protectedRegions[1].id, std::string("sprue:1"));
    QCOMPARE(withRegions.protectedRegions[1].kind, std::string("sprue"));
    QCOMPARE(withRegions.protectedRegions[1].mesh->vertexCount(), std::size_t{66});  // 2 x 32 + 2 centres
    QCOMPARE(withRegions.protectedRegions[1].mesh->triangleCount(), std::size_t{128});
    QVERIFY(withRegions.revision != base.revision);
  }

  void derivedRegistrationNeverThrows() {
    RegistrationDependencySnapshot snapshot;
    snapshot.revision = "rev";
    snapshot.bodies = stackedPair();
    snapshot.bodies[0].mesh = MeshPayload{};  // unusable mesh: the kernel refuses it
    const DerivedRegistrationState state = generateDerivedRegistration(*engine_, snapshot);
    QVERIFY(state.status == "blocked" || state.status == "failed");
    QVERIFY(state.report.has_value());
    QCOMPARE(state.bodies.size(), std::size_t{2});
  }
};

QTEST_APPLESS_MAIN(RegistrationTest)
#include "tst_registration.moc"
