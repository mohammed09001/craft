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

  void roleBuffersColourEachTriangleByItsFaceRun() {
    // A cube's twelve triangles: the first four are the cavity's surface, the next two a registration key, the next one a sprue funnel,
    // the rest (and anything no run covers) the outer mold.
    MeshPayload mesh = test::cubeMesh(test::box(0, 0, 0, 2, 2, 2));
    QVERIFY(!hasRoleRuns(mesh));
    mesh.faceRuns = {{0, 4, FaceRole::CavitySurface}, {4, 2, FaceRole::RegistrationKey}, {6, 1, FaceRole::SprueFunnel}, {7, 2, FaceRole::OuterMold}};
    QVERIFY(hasRoleRuns(mesh));
    const RoleTints tints{{{1, 1, 1}, {0.5f, 0.6f, 0.7f}, {2.0f, 3.0f, 4.0f}, {0.1f, 0.2f, 0.3f}}};

    const TriangleBuffers plain = buildTriangleBuffers(mesh);
    const TriangleBuffers coloured = buildRoleTriangleBuffers(mesh, tints);
    QVERIFY(coloured.hasColor);
    QCOMPARE(coloured.stride(), TriangleBuffers::kColoredStride);
    QCOMPARE(coloured.vertexCount, plain.vertexCount);
    QCOMPARE(coloured.vertexData.size(), qsizetype(coloured.vertexCount * TriangleBuffers::kColoredStride));
    QCOMPARE(coloured.boundsMin, plain.boundsMin);
    QCOMPARE(coloured.boundsMax, plain.boundsMax);

    const auto role = [](int triangle) { return triangle < 4 ? 1 : triangle < 6 ? 2 : triangle < 7 ? 3 : 0; };
    for (int v = 0; v < coloured.vertexCount; ++v) {
      float pos[6], col[4];
      std::memcpy(pos, coloured.vertexData.constData() + v * TriangleBuffers::kColoredStride, 24);
      std::memcpy(col, coloured.vertexData.constData() + v * TriangleBuffers::kColoredStride + TriangleBuffers::kColorOffset, 16);
      float expected[6];
      std::memcpy(expected, plain.vertexData.constData() + v * TriangleBuffers::kStride, 24);
      for (int k = 0; k < 6; ++k) QCOMPARE(pos[k], expected[k]);   // position and normal are untouched
      const auto& tint = tints[static_cast<std::size_t>(role(v / 3))];
      QCOMPARE(col[0], tint[0]);
      QCOMPARE(col[1], tint[1]);
      QCOMPARE(col[2], tint[2]);
      QCOMPARE(col[3], 1.0f);
    }
  }

  void aRunThatOverrunsTheMeshIsClipped() {
    MeshPayload mesh = test::cubeMesh(test::box(0, 0, 0, 1, 1, 1));
    mesh.faceRuns = {{10, 50, FaceRole::CavitySurface}};   // two triangles exist from 10; the rest of the run does not
    const RoleTints tints{{{1, 1, 1}, {9, 9, 9}, {1, 1, 1}, {1, 1, 1}}};
    const TriangleBuffers b = buildRoleTriangleBuffers(mesh, tints);
    float first[4], last[4];
    std::memcpy(first, b.vertexData.constData() + TriangleBuffers::kColorOffset, 16);
    std::memcpy(last, b.vertexData.constData() + (b.vertexCount - 1) * TriangleBuffers::kColoredStride + TriangleBuffers::kColorOffset, 16);
    QCOMPARE(first[0], 1.0f);   // triangle 0: outside the run
    QCOMPARE(last[0], 9.0f);    // triangle 11: inside it
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

  void segmentListBuffersConcatenateEverySegment() {
    const LineBuffers none = buildSegmentListBuffers({});
    QCOMPARE(none.vertexCount, 0);
    const LineBuffers lines = buildSegmentListBuffers({{QVector3D(0, 0, 0), QVector3D(1, 0, 0)}, {QVector3D(0, 2, 0), QVector3D(0, 2, 5)}});
    QCOMPARE(lines.vertexCount, 4);
    QCOMPARE(lines.vertexData.size(), qsizetype(4 * LineBuffers::kStride));
    QCOMPARE(lines.boundsMin, QVector3D(0, 0, 0));
    QCOMPARE(lines.boundsMax, QVector3D(1, 2, 5));
    const auto* f = reinterpret_cast<const float*>(lines.vertexData.constData());
    QCOMPARE(f[11], 5.0f);  // the last vertex (0, 2, 5): 3 floats per vertex
  }

  void quadBuffersAreTwoOutwardTrianglesPerQuad() {
    // A quad facing +Z at z = 3 (counter-clockwise seen from above).
    const std::array<QVector3D, 4> quad{QVector3D(0, 0, 3), QVector3D(4, 0, 3), QVector3D(4, 2, 3), QVector3D(0, 2, 3)};
    const TriangleBuffers buffers = buildQuadBuffers({quad, quad});
    QCOMPARE(buffers.vertexCount, 12);
    QCOMPARE(buffers.boundsMin, QVector3D(0, 0, 3));
    QCOMPARE(buffers.boundsMax, QVector3D(4, 2, 3));
    const auto* f = reinterpret_cast<const float*>(buffers.vertexData.constData());
    // Triangles (a, b, c) and (a, c, d); 6 floats (position + normal) per vertex.
    QCOMPARE(QVector3D(f[0], f[1], f[2]), quad[0]);
    QCOMPARE(QVector3D(f[6], f[7], f[8]), quad[1]);
    QCOMPARE(QVector3D(f[12], f[13], f[14]), quad[2]);
    QCOMPARE(QVector3D(f[18], f[19], f[20]), quad[0]);
    QCOMPARE(QVector3D(f[24], f[25], f[26]), quad[2]);
    QCOMPARE(QVector3D(f[30], f[31], f[32]), quad[3]);
    for (int v = 0; v < buffers.vertexCount; ++v) {
      QCOMPARE(f[v * 6 + 3], 0.0f);
      QCOMPARE(f[v * 6 + 4], 0.0f);
      QCOMPARE(f[v * 6 + 5], 1.0f);
    }
    QCOMPARE(buildQuadBuffers({}).vertexCount, 0);
  }

  void smoothSurfaceBuffersKeepPerVertexNormals() {
    // One triangle with three different normals (a smooth surface), referenced twice through the index list.
    const std::vector<double> positions{0, 0, 0, 1, 0, 0, 0, 1, 0};
    const std::vector<double> normals{0, 0, 1, 1, 0, 0, 0, 1, 0};
    const std::vector<std::uint32_t> indices{0, 1, 2, 2, 1, 0};
    const TriangleBuffers buffers = buildSmoothSurfaceBuffers({{&positions, &normals, &indices}});
    QCOMPARE(buffers.vertexCount, 6);
    QCOMPARE(buffers.vertexData.size(), qsizetype(6 * TriangleBuffers::kStride));
    QCOMPARE(buffers.boundsMin, QVector3D(0, 0, 0));
    QCOMPARE(buffers.boundsMax, QVector3D(1, 1, 0));
    const auto* f = reinterpret_cast<const float*>(buffers.vertexData.constData());
    QCOMPARE(QVector3D(f[6], f[7], f[8]), QVector3D(1, 0, 0));    // second vertex: position
    QCOMPARE(QVector3D(f[9], f[10], f[11]), QVector3D(1, 0, 0));  // its own normal, not the face normal
    QCOMPARE(QVector3D(f[3], f[4], f[5]), QVector3D(0, 0, 1));
    QCOMPARE(buildSmoothSurfaceBuffers({}).vertexCount, 0);
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
