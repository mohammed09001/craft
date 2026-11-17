// Viewport adapter and camera tests: pure conversions, no GPU required.

#include <QtTest/QtTest>

#include <cmath>
#include <cstring>

#include "MeshGeometryAdapter.h"
#include "TestMeshes.h"
#include "ViewportCamera.h"

using namespace craft;
using namespace craft::viewport;

class ViewportTest : public QObject {
  Q_OBJECT
 private slots:
  void triangleBuffersKeepEngineCoordinates() {
    const Bounds3 b = test::box(-5, -2, 0, 5, 2, 10);
    const TriangleBuffers buffers = buildTriangleBuffers(test::soupFromMesh(test::cubeMesh(b)));
    QCOMPARE(buffers.vertexCount, 36);
    QCOMPARE(buffers.vertexData.size(), qsizetype(36 * TriangleBuffers::kStride));
    // No axis swap, no rescale: bounds are the millimeter, Z-up bounds.
    QCOMPARE(buffers.boundsMin, QVector3D(-5, -2, 0));
    QCOMPARE(buffers.boundsMax, QVector3D(5, 2, 10));
  }

  void normalsAreUnitAndOutward() {
    const TriangleBuffers buffers = buildTriangleBuffers(test::cubeMesh(test::box(0, 0, 0, 2, 2, 2)));
    const auto* f = reinterpret_cast<const float*>(buffers.vertexData.constData());
    for (int v = 0; v < buffers.vertexCount; ++v, f += 6) {
      QVERIFY(std::fabs(std::hypot(f[3], f[4], f[5]) - 1.0) < 1e-5);
      const double outward = f[3] * (f[0] - 1) + f[4] * (f[1] - 1) + f[5] * (f[2] - 1);
      QVERIFY(outward > 0);
    }
  }

  void cubeHasTwelveFeatureEdges() {
    // A cube has 12 edges meeting at 90 degrees; face diagonals are coplanar.
    const LineBuffers edges = buildFeatureEdgeBuffers(test::cubeMesh(test::box(0, 0, 0, 1, 1, 1)));
    QCOMPARE(edges.vertexCount, 24);
    QCOMPARE(buildFeatureEdgeBuffers(test::soupFromMesh(test::cubeMesh(test::box(0, 0, 0, 1, 1, 1)))).vertexCount, 24);
  }

  void smoothSphereHasNoInteriorFeatureEdges() {
    const LineBuffers edges = buildFeatureEdgeBuffers(test::sphereMesh({0, 0, 0}, 10, 48, 24), 30.0);
    QCOMPARE(edges.vertexCount, 0);
  }

  void gridSkipsMajorLinesInMinorGrid() {
    // size 100, minor 10 -> lines at -50..50 (11 per direction, 2 directions).
    QCOMPARE(buildGridBuffers(100, 10).vertexCount, 11 * 2 * 2);
    // Skipping multiples of 50 removes -50, 0, 50 -> 8 per direction.
    QCOMPARE(buildGridBuffers(100, 10, 50).vertexCount, 8 * 2 * 2);
    QCOMPARE(buildGridBuffers(0, 10).vertexCount, 0);
  }

  void cameraRotationLooksAtTargetWithZUp() {
    ViewportCamera camera;
    camera.setViewportSize(800, 600);
    camera.setSceneBounds(test::box(-10, -10, 0, 10, 10, 20));
    camera.reset();
    const QVector3D forward = camera.rotation().rotatedVector(QVector3D(0, 0, -1));
    const QVector3D toTarget = (camera.target() - camera.position()).normalized();
    QVERIFY((forward - toTarget).length() < 1e-4);
    QVERIFY(camera.rotation().rotatedVector(QVector3D(0, 1, 0)).z() > 0);  // up stays up
  }

  void namedViewsUseCutFaceNaming() {
    ViewportCamera camera;
    camera.setViewportSize(800, 600);
    camera.setSceneBounds(test::box(-10, -10, 0, 10, 10, 20));
    camera.lookFrom("top");
    QVERIFY(camera.position().z() > camera.target().z());
    QVERIFY(std::fabs(camera.position().x() - camera.target().x()) < 1e-3);
    camera.lookFrom("front");  // the +Y face
    QVERIFY(camera.position().y() > camera.target().y());
    camera.lookFrom("right");
    QVERIFY(camera.position().x() > camera.target().x());
  }
};

QTEST_MAIN(ViewportTest)
#include "tst_viewport.moc"
