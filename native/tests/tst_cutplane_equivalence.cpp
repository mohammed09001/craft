// The Cut by Face plane slabs and the Eraser's picking compared with the REAL reference runtime
// (cuttingPlane3dRuntime.ts under Three.js and jsdom, real DOM pointer events) through
// native/tests/fixtures/reference/cutplane-reference.json: the slab drawn for every enabled plane, the plane the
// eraser hovers/erases for 51 pointer probes, and the partition the removal lifecycle rebuilds.

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>
#include <set>

#include "mold/CuttingPlaneSlabs.h"
#include "mold/ReferenceMold.h"

using namespace craft;

namespace {

QJsonObject loadFixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/cutplane-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

Vec3 vec(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {o.value("x").toDouble(), o.value("y").toDouble(), o.value("z").toDouble()};
}

Bounds3 boundsOf(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  const Vec3 mn = vec(o.value("min")), mx = vec(o.value("max"));
  return {{mn.x, mn.y, mn.z}, {mx.x, mx.y, mx.z}};
}

bool approx(double a, double b, double tolerance = 1e-9) { return std::fabs(a - b) <= tolerance * std::max(1.0, std::fabs(b)); }

QString faceOfPlaneId(const QString& id) { return id.mid(QStringLiteral("cutting-plane:").size()); }

std::vector<CuttingPlane> planesOf(const QJsonArray& records) {
  std::vector<CuttingPlane> planes;
  for (const QJsonValue& value : records) {
    const QJsonObject r = value.toObject();
    const auto face = faceIdFromName(r.value("sourceFaceId").toString().toStdString());
    CuttingPlane plane = createCuttingPlane(*face, r.value("normalizedPosition").toDouble());
    plane.enabled = r.value("enabled").toBool();
    planes.push_back(plane);
  }
  return planes;
}

}  // namespace

class CutPlaneEquivalenceTest : public QObject {
  Q_OBJECT

 private slots:
  void slabsAreBuiltLikeTheReference() {
    const QJsonObject fixture = loadFixture();
    QVERIFY2(!fixture.isEmpty(), "cutplane-reference.json is missing; run scripts/native/generate-reference-fixtures.ps1 -Only cutplane");
    const Bounds3 k1 = boundsOf(fixture.value("k1")), k2 = boundsOf(fixture.value("k2"));
    // K2 is the reference mold block around K1.
    const auto block = createReferenceMoldBlockBounds(k1, fixture.value("clearanceMm").toDouble());
    QVERIFY(block.has_value());
    QVERIFY(approx(block->min.z, k2.min.z) && approx(block->max.x, k2.max.x) && approx(block->min.y, k2.min.y));

    const auto planes = planesOf(fixture.value("records").toArray());
    const auto slabs = buildPlaneSlabs(k1, k2, planes);
    const QJsonArray expected = fixture.value("slabs").toArray();
    QCOMPARE(static_cast<int>(slabs.size()), expected.size());  // the disabled plane is not drawn
    for (int i = 0; i < expected.size(); ++i) {
      const QJsonObject e = expected.at(i).toObject();
      const PlaneSlab& s = slabs[static_cast<std::size_t>(i)];
      const QString where = e.value("planeId").toString();
      QCOMPARE(QString::fromLatin1(faceIdName(s.face)), faceOfPlaneId(where));
      const Vec3 position = vec(e.value("position"));
      QVERIFY2(approx(s.center.x, position.x) && approx(s.center.y, position.y) && approx(s.center.z, position.z), qPrintable(where + " centre"));
      const QJsonObject dims = e.value("dims").toObject();
      QVERIFY2(approx(s.size.x, dims.value("width").toDouble()) && approx(s.size.y, dims.value("height").toDouble()) && approx(s.size.z, dims.value("depth").toDouble()), qPrintable(where + " size"));
      const QJsonObject idle = e.value("idle").toObject();
      QCOMPARE(cutPlaneColorRgb(CutPlaneVisual::Idle), static_cast<unsigned>(idle.value("colorHex").toInt()));
      QCOMPARE(cutPlaneSurfaceOpacity(CutPlaneVisual::Idle), idle.value("opacity").toDouble());
      QVERIFY(idle.value("transparent").toBool());
      QVERIFY(!idle.value("depthWrite").toBool());
      QVERIFY(idle.value("doubleSided").toBool());
      const QJsonObject edges = e.value("edges").toObject();
      QCOMPARE(cutPlaneColorRgb(CutPlaneVisual::Idle), static_cast<unsigned>(edges.value("colorHex").toInt()));
      QCOMPARE(cutPlaneEdgeOpacity(CutPlaneVisual::Idle), edges.value("opacity").toDouble());
      QCOMPARE(edges.value("vertexCount").toInt(), 24);  // the twelve box edges
    }
    QCOMPARE(kCutPlaneSlabThicknessMm, 0.02);
  }

  void eraserHoverLookMatchesTheReference() {
    const QJsonObject look = loadFixture().value("hoverLook").toObject();
    QCOMPARE(cutPlaneColorRgb(CutPlaneVisual::EraseHover), static_cast<unsigned>(look.value("colorHex").toInt()));
    QCOMPARE(cutPlaneSurfaceOpacity(CutPlaneVisual::EraseHover), look.value("opacity").toDouble());
    QCOMPARE(cutPlaneColorRgb(CutPlaneVisual::EraseHover), static_cast<unsigned>(look.value("edgeColorHex").toInt()));
    QCOMPARE(cutPlaneEdgeOpacity(CutPlaneVisual::EraseHover), look.value("edgeOpacity").toDouble());
  }

  void everyProbeHoversAndErasesTheSamePlane() {
    const QJsonObject fixture = loadFixture();
    const Bounds3 k1 = boundsOf(fixture.value("k1")), k2 = boundsOf(fixture.value("k2"));
    const auto slabs = buildPlaneSlabs(k1, k2, planesOf(fixture.value("records").toArray()));
    const QJsonArray picks = fixture.value("picks").toArray(), presses = fixture.value("presses").toArray();
    QCOMPARE(picks.size(), presses.size());
    int hovered = 0, idle = 0;
    std::set<QString> seen;
    for (int i = 0; i < picks.size(); ++i) {
      const QJsonObject p = picks.at(i).toObject();
      const QString label = p.value("label").toString();
      const QJsonObject ray = p.value("ray").toObject();
      const auto pick = pickPlaneSlab(Ray{vec(ray.value("origin")), vec(ray.value("direction")).normalized()}, slabs);
      const QJsonArray erased = presses.at(i).toObject().value("erased").toArray();
      if (p.value("hovered").isNull()) {
        QVERIFY2(!pick.has_value(), qPrintable(label + ": the reference hovers nothing"));
        QVERIFY(erased.isEmpty());
        ++idle;
        continue;
      }
      QVERIFY2(pick.has_value(), qPrintable(label + ": the reference hovers " + p.value("hovered").toString()));
      const QString face = QString::fromLatin1(faceIdName(slabs[static_cast<std::size_t>(pick->slab)].face));
      QCOMPARE(face, faceOfPlaneId(p.value("hovered").toString()));
      // A primary press on a hovered plane asks to erase exactly that plane's face.
      QCOMPARE(erased.size(), 1);
      QCOMPARE(erased.at(0).toString(), face);
      seen.insert(face);
      ++hovered;
    }
    QVERIFY(hovered >= 40);
    QVERIFY(idle >= 5);
    QCOMPARE(seen.size(), std::size_t{4});  // every enabled plane was reached
    QVERIFY(fixture.value("secondaryPress").toObject().value("erased").toArray().isEmpty());  // only the primary button erases
    QCOMPARE(fixture.value("deactivate").toObject().value("hoverAfter").isNull(), true);
  }

  void removingAPlaneRebuildsTheSamePartition() {
    // The reference rebuilds the mold parts without the removed plane. The partition is the native reference mold's, which
    // has its own equivalence tests; here the body counts of the lifecycle scenarios are reproduced from the plane sets.
    const QJsonObject fixture = loadFixture();
    const Bounds3 k1{{0, 0, 0}, {30, 30, 30}};
    const auto block = createReferenceMoldBlockBounds(k1, kDefaultReferenceMoldClearanceMm);
    QVERIFY(block.has_value());
    const auto bodyCount = [&](const QJsonArray& planes) {
      std::vector<CuttingPlane> list;
      for (const QJsonValue& v : planes) {
        const QJsonObject o = v.toObject();
        list.push_back(createCuttingPlane(*faceIdFromName(o.value("sourceFaceId").toString().toStdString()), o.value("normalizedPosition").toDouble()));
      }
      ReferenceMoldDefinition definition;
      definition.definitionId = "def";
      definition.selectionBoxBounds = k1;
      definition.referenceMoldBlockBounds = *block;
      return partitionOrthogonalMold(definition, cuttingPlanesToCutPlaneData(k1, list)).bodies.size();
    };
    int checked = 0;
    for (const QJsonValue& value : fixture.value("lifecycle").toArray()) {
      const QJsonObject s = value.toObject();
      if (s.value("how").toString() == "remove") continue;
      const QJsonObject before = s.value("before").toObject(), after = s.value("after").toObject();
      if (!before.value("bodyCount").isNull()) QCOMPARE(static_cast<int>(bodyCount(before.value("planes").toArray())), before.value("bodyCount").toInt());
      if (!after.value("bodyCount").isNull()) {
        QCOMPARE(static_cast<int>(bodyCount(after.value("planes").toArray())), after.value("bodyCount").toInt());
        ++checked;
      }
    }
    QVERIFY(checked >= 3);
  }
};

QTEST_APPLESS_MAIN(CutPlaneEquivalenceTest)
#include "tst_cutplane_equivalence.moc"
