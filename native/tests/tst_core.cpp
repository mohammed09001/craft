// Unit tests for craft_core: tolerance policy, mesh analysis, grounding, the
// adaptive grid, view-pose math, and picking. Expected numbers are derived
// from the reference TypeScript formulas cited next to each case.

#include <QtTest/QtTest>

#include <cmath>

#include "TestMeshes.h"
#include "geometry/GeometryTolerance.h"
#include "geometry/MeshAnalysis.h"
#include "geometry/RayPicking.h"
#include "model/ModelGrounding.h"
#include "view/ViewPose.h"

using namespace craft;
using craft::test::box;

class CoreTest : public QObject {
  Q_OBJECT

 private slots:
  // geometryTolerance.ts -----------------------------------------------------
  void tolerancePolicyForTypicalMoldBlock() {
    // 40 x 40 x 40 block resting on Z = 0, zero cavity clearance.
    const auto policy = buildGeometryTolerancePolicy(box(-20, -20, 0, 20, 20, 40), 0);
    const double diagonal = std::hypot(40.0, 40.0, 40.0);
    // clamp(diagonal * 1e-8, 1e-7, min(1e-3, 40e-4, featureLimit))
    QCOMPARE(policy.linearToleranceMm, diagonal * 1e-8);
    QCOMPARE(policy.booleanToleranceMm, policy.linearToleranceMm);
    QCOMPARE(policy.weldToleranceMm, policy.linearToleranceMm);
    QCOMPARE(policy.surfaceToleranceMm, policy.linearToleranceMm * 4);
    QCOMPARE(policy.volumeToleranceMm3, std::pow(policy.linearToleranceMm, 3));
    QCOMPARE(policy.affectedVolumeToleranceMm3, 64000.0 * 1e-10);
    QCOMPARE(policy.minimumFragmentVolumeMm3, 64000.0 * 1e-12);
    // Float32 spacing at 40 is 2^-18; the containment floor is 4 ULP.
    QCOMPARE(policy.containmentToleranceMm, 4 * std::ldexp(1.0, -18));
  }

  void tolerancePolicyClampsToLowerBoundForTinyBlocks() {
    const auto policy = buildGeometryTolerancePolicy(box(0, 0, 0, 1, 1, 1), 0);
    QCOMPARE(policy.linearToleranceMm, 1e-7);
  }

  void tolerancePolicyRejectsInvalidInput() {
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument,
                             buildGeometryTolerancePolicy(box(0, 0, 0, 0, 1, 1), 0));
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument,
                             buildGeometryTolerancePolicy(box(0, 0, 0, 1, 1, 1), -1));
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument,
                             buildGeometryTolerancePolicy(box(0, 0, 0, 1, 1, NAN), 0));
  }

  void float32UlpMatchesIeee() {
    QCOMPARE(float32Ulp(1.0), std::ldexp(1.0, -23));
    QCOMPARE(float32Ulp(-1.0), std::ldexp(1.0, -23));
    QCOMPARE(float32Ulp(100.0), std::ldexp(1.0, -17));
  }

  // meshTopology.ts ----------------------------------------------------------
  void topologyOfClosedCube() {
    const auto counts = meshTopology(test::cubeMesh(box(0, 0, 0, 1, 2, 3)));
    QCOMPARE(counts.openEdgeCount, std::size_t{0});
    QCOMPARE(counts.nonManifoldEdgeCount, std::size_t{0});
    QVERIFY(counts.closedManifold());
  }

  void topologyCountsOpenAndNonManifoldEdges() {
    MeshPayload mesh = test::cubeMesh(box(0, 0, 0, 1, 1, 1));
    mesh.indices.resize(mesh.indices.size() - 3);  // drop one triangle
    QCOMPARE(meshTopology(mesh).openEdgeCount, std::size_t{3});

    // Three triangles sharing the edge 0-1.
    MeshPayload fan;
    fan.indices = {0, 1, 2, 0, 1, 3, 0, 1, 4};
    QCOMPARE(meshTopology(fan).nonManifoldEdgeCount, std::size_t{1});
  }

  void signedVolumeOfCube() {
    QCOMPARE(signedVolume(test::cubeMesh(box(0, 0, 0, 2, 3, 4))), 24.0);
  }

  // fragmentClassification.ts ------------------------------------------------
  void fragmentClassificationSplitsAndSorts() {
    const auto result = classifyFragmentVolumes({5, 0.001, 10, 0.0005}, 0.01);
    QCOMPARE(result.meaningfulVolumes, (std::vector<double>{10, 5}));
    QCOMPARE(result.discardedVolumes, (std::vector<double>{0.001, 0.0005}));
    QVERIFY_THROWS_EXCEPTION(std::invalid_argument, classifyFragmentVolumes({-1}, 0.01));
  }

  void componentOrderingPrefersLargerVolumeThenLowerCorner() {
    const ComponentOrderingDescriptor big{100, box(5, 0, 0, 6, 1, 1)};
    const ComponentOrderingDescriptor small{10, box(0, 0, 0, 1, 1, 1)};
    QVERIFY(compareComponentDescriptors(big, small, 1e-6) < 0);
    const ComponentOrderingDescriptor left{10, box(-3, 0, 0, -2, 1, 1)};
    QVERIFY(compareComponentDescriptors(left, small, 1e-6) < 0);
    QCOMPARE(compareComponentDescriptors(small, small, 1e-6), 0);
  }

  // geometryFingerprint.ts ---------------------------------------------------
  void numericHashMatchesReferenceAlgorithm() {
    // FNV-1a over little-endian float64 bytes, seed 2166136261, 32-bit wrap.
    // 1.0 is 00 00 00 00 00 00 F0 3F.
    std::uint32_t expected = 2166136261u;
    for (std::uint8_t byte : {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F}) {
      expected = (expected ^ byte) * 16777619u;
    }
    QCOMPARE(hashNumericArray({1.0}), expected);
    QCOMPARE(finishHash(0xABCu), std::string("00000abc"));
  }

  void geometryVersionIsDeterministicAndContentSensitive() {
    const MeshPayload a = test::cubeMesh(box(0, 0, 0, 1, 1, 1));
    MeshPayload b = a;
    const Bounds3 bounds = box(0, 0, 0, 1, 1, 1);
    QCOMPARE(meshGeometryVersion("body", a, bounds), meshGeometryVersion("body", b, bounds));
    b.positions[0] += 1e-9;
    QVERIFY(meshGeometryVersion("body", a, bounds) != meshGeometryVersion("body", b, bounds));
    QVERIFY(meshGeometryVersion("body", a, bounds) != meshGeometryVersion("other", a, bounds));
    QVERIFY(meshGeometryVersion("body", a, bounds).starts_with("body:"));
  }

  // modelGrounding.ts --------------------------------------------------------
  void groundingCentersXYAndRestsOnZeroPlane() {
    const auto grounding = calculateModelGroundingTransform(box(10, 20, 5, 30, 60, 25));
    QVERIFY(grounding.has_value());
    QCOMPARE(grounding->translation, (Point3{-20, -40, -5}));
    QCOMPARE(grounding->groundedBounds, box(-10, -20, 0, 10, 20, 20));
  }

  void groundingRejectsInvalidBounds() {
    QVERIFY(!calculateModelGroundingTransform(box(1, 0, 0, 0, 1, 1)));
    QVERIFY(!calculateModelGroundingTransform(box(0, 0, 0, INFINITY, 1, 1)));
  }

  // adaptiveGrid.ts ----------------------------------------------------------
  void adaptiveGridMatchesReferenceCases() {
    QCOMPARE(deriveAdaptiveGridConfig(std::nullopt), kDefaultGridConfig);
    // footprint 100 -> target 150 -> raw minor 7.5 -> nice 10; major 50;
    // size = ceil(150 / 100) * 100 = 200.
    const auto grid = deriveAdaptiveGridConfig(box(-50, -20, 0, 50, 20, 30));
    QCOMPARE(grid.minorStep, 10.0);
    QCOMPARE(grid.majorStep, 50.0);
    QCOMPARE(grid.size, 200.0);
    // Tiny model: target clamps to 20 -> minor 1, major 5, size 20.
    const auto small = deriveAdaptiveGridConfig(box(-1, -1, 0, 1, 1, 1));
    QCOMPARE(small.minorStep, 1.0);
    QCOMPARE(small.size, 20.0);
  }

  void niceStepUsesOneTwoFiveTen() {
    QCOMPARE(*calculateNiceStep(7.5), 10.0);
    QCOMPARE(*calculateNiceStep(1.5), 2.0);
    QCOMPARE(*calculateNiceStep(0.3), 0.5);
    QVERIFY(!calculateNiceStep(0));
  }

  // viewPose.ts --------------------------------------------------------------
  void fitDistanceMatchesReferenceFormula() {
    // Wide viewport: vertical FOV limits. radius / sin(22.5 deg) * 1.35
    const double expected = 10.0 / std::sin(22.5 * M_PI / 180.0) * 1.35;
    QCOMPARE(*calculateFitDistance(10, 45, 2.0), expected);
    // Tall viewport: horizontal FOV limits.
    const double horizontalHalf = std::atan(std::tan(22.5 * M_PI / 180.0) * 0.5);
    QCOMPARE(*calculateFitDistance(10, 45, 0.5), 10.0 / std::sin(horizontalHalf) * 1.35);
    QVERIFY(!calculateFitDistance(0, 45, 1));
    QVERIFY(!calculateFitDistance(10, 45, 0));
  }

  void defaultPoseMatchesReferenceCamera() {
    const ViewPose pose;
    QCOMPARE(pose.position().x, 95.0);
    QCOMPARE(pose.position().y, -120.0);
    QCOMPARE(pose.position().z, 85.0);
    QCOMPARE(pose.target().z, 12.0);
    QCOMPARE(pose.verticalFovDegrees(), 45.0);
  }

  void resetFramesBoundsFromCanonicalDirection() {
    ViewPose pose;
    const Bounds3 bounds = box(-10, -10, 0, 10, 10, 20);
    QVERIFY(pose.resetToBounds(bounds, 1.5));
    const BoundingSphere sphere = boundingSphereOf(bounds);
    QCOMPARE(pose.target().z, 10.0);
    const double expectedDistance = *calculateFitDistance(sphere.radius, 45, 1.5);
    QVERIFY(std::fabs(pose.distance() - expectedDistance) < 1e-9);
    // Direction (1, -1, 0.78) normalised.
    const Vec3 direction = (pose.position() - pose.target()).normalized();
    const Vec3 expected = Vec3{1, -1, 0.78}.normalized();
    QVERIFY(std::fabs(direction.x - expected.x) < 1e-12);
    QVERIFY(std::fabs(direction.y - expected.y) < 1e-12);
    QVERIFY(std::fabs(direction.z - expected.z) < 1e-12);
    // Z stays up: the camera's up vector has a positive Z component.
    QVERIFY(pose.basis().up.z > 0);
  }

  void orbitKeepsDistanceAndTarget() {
    ViewPose pose;
    pose.resetToBounds(box(-10, -10, 0, 10, 10, 20), 1.0);
    const double before = pose.distance();
    const Vec3 target = pose.target();
    pose.orbit(0.7, 0.3);
    QVERIFY(std::fabs(pose.distance() - before) < 1e-9);
    QCOMPARE(pose.target().x, target.x);
    pose.orbit(0, 10);  // elevation clamps below the pole
    QVERIFY(pose.basis().up.z > 0);
  }

  void zoomIsClampedToFittedRange() {
    ViewPose pose;
    pose.resetToBounds(box(-10, -10, 0, 10, 10, 20), 1.0);
    const double fitted = pose.distance();
    pose.zoom(0.5);
    QVERIFY(std::fabs(pose.distance() - fitted * 0.5) < 1e-9);
    for (int i = 0; i < 200; ++i) pose.zoom(0.5);
    const double radius = boundingSphereOf(box(-10, -10, 0, 10, 10, 20)).radius;
    QVERIFY(std::fabs(pose.distance() - radius * 0.02) < 1e-9);
  }

  void panMovesEyeAndTargetTogether() {
    ViewPose pose;
    pose.resetToBounds(box(-10, -10, 0, 10, 10, 20), 1.0);
    const Vec3 offset = pose.position() - pose.target();
    pose.pan(40, -25, 600);
    const Vec3 after = pose.position() - pose.target();
    QVERIFY((offset - after).length() < 1e-9);
  }

  void centerPixelRayPointsAtTarget() {
    ViewPose pose;
    pose.resetToBounds(box(-10, -10, 0, 10, 10, 20), 800.0 / 600.0);
    const Ray ray = pose.rayThroughPixel(400, 300, 800, 600);
    const Vec3 toTarget = (pose.target() - pose.position()).normalized();
    QVERIFY((ray.direction - toTarget).length() < 1e-12);
  }

  // picking ------------------------------------------------------------------
  void pickHitsNearestFaceOfCube() {
    const TriangleSoup soup = test::soupFromMesh(test::cubeMesh(box(-5, -5, 0, 5, 5, 10)));
    const Ray ray{{0.5, 0.25, 100}, {0, 0, -1}};
    const auto hit = pickTriangleSoup(soup, ray);
    QVERIFY(hit.has_value());
    QCOMPARE(hit->distance, 90.0);
    QCOMPARE(hit->point.z, 10.0);
    QCOMPARE(hit->normal.z, 1.0);
    QVERIFY(!pickTriangleSoup(soup, Ray{{50, 50, 100}, {0, 0, -1}}));
  }

  void pickThroughCameraHitsModelCenterline() {
    const Bounds3 bounds = box(-5, -5, 0, 5, 5, 10);
    const TriangleSoup soup = test::soupFromMesh(test::cubeMesh(bounds));
    ViewPose pose;
    pose.resetToBounds(bounds, 1.0);
    const auto hit = pickTriangleSoup(soup, pose.rayThroughPixel(250, 250, 500, 500));
    QVERIFY(hit.has_value());
    // The reset view looks from +X, -Y, +Z, so the first surface along the
    // central ray is one of the three faces turned towards the camera.
    QVERIFY(hit->normal.x > 0.99 || hit->normal.y < -0.99 || hit->normal.z > 0.99);
  }
};

QTEST_APPLESS_MAIN(CoreTest)
#include "tst_core.moc"
