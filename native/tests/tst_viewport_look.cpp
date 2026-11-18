// The native viewport look against the reference's own modules (look-reference.json, generated from the real code by
// craftLookReference.test.ts): the lighting rig, the surface colours and materials, the grid opacities, the feature-edge
// style and the angle at which an edge appears.
#include <QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include "MeshGeometryAdapter.h"
#include "view/ViewportLook.h"

using namespace craft;

namespace {

QJsonObject fixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/look-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

void compareLight(const LookLight& native, const QJsonObject& reference) {
  const QJsonArray position = reference.value("position").toArray();
  QCOMPARE(native.position.x, position.at(0).toDouble());
  QCOMPARE(native.position.y, position.at(1).toDouble());
  QCOMPARE(native.position.z, position.at(2).toDouble());
  QCOMPARE(static_cast<int>(native.colorRgb), reference.value("colorHex").toInt());
  QCOMPARE(native.intensity, reference.value("intensity").toDouble());
}

// Two triangles sharing the edge (0,0,0)-(1,0,0), the second bent up by `bendDegrees` from the first's plane.
TriangleSoup hinge(double bendDegrees) {
  const double bend = bendDegrees * 3.14159265358979323846 / 180.0;
  TriangleSoup soup;
  soup.positions = {0, 0, 0, 1, 0, 0, 0, -1, 0,
                    1, 0, 0, 0, 0, 0, 0, static_cast<float>(std::cos(bend)), static_cast<float>(std::sin(bend))};
  return soup;
}

}  // namespace

class ViewportLookTest : public QObject {
  Q_OBJECT
 private slots:
  void theLightingRigIsTheReferencesDarkRig() {
    const QJsonObject f = fixture();
    QVERIFY2(!f.isEmpty(), "look-reference.json is missing");
    const QJsonObject rig = f.value("lightingRig").toObject().value("dark").toObject();
    const ViewportLook look = referenceLook(true);
    compareLight(look.key, rig.value("key").toObject());
    compareLight(look.fill, rig.value("fill").toObject());
    compareLight(look.rim, rig.value("rim").toObject());
    QCOMPARE(look.ambientIntensity, rig.value("ambient").toObject().value("intensity").toDouble());
    QCOMPARE(static_cast<int>(look.ambientRgb), rig.value("ambient").toObject().value("colorHex").toInt());
    const QJsonObject hemisphere = rig.value("hemisphere").toObject();
    QCOMPARE(static_cast<int>(look.hemisphereSkyRgb), hemisphere.value("skyHex").toInt());
    QCOMPARE(static_cast<int>(look.hemisphereGroundRgb), hemisphere.value("groundHex").toInt());
    QCOMPARE(look.hemisphereIntensity, hemisphere.value("intensity").toDouble());
  }

  void bothThemesShowTheDarkRigAndTheDarkPartColours() {
    // The reference code has a light rig and a light part colour; the application does not show them (D-081), so the
    // theme changes only the background and the grid.
    const ViewportLook dark = referenceLook(true), light = referenceLook(false);
    QCOMPARE(light.partRgb, dark.partRgb);
    QCOMPARE(light.moldRgb, dark.moldRgb);
    QCOMPARE(light.key.intensity, dark.key.intensity);
    QCOMPARE(light.ambientIntensity, dark.ambientIntensity);
    QVERIFY(light.backgroundRgb != dark.backgroundRgb);
    QVERIFY(light.gridMinor.colorRgb != dark.gridMinor.colorRgb);
    // ... and the reference really does have different light-theme values, so this is a deliberate difference.
    const QJsonObject f = fixture();
    QVERIFY(f.value("lightingRig").toObject().value("light").toObject().value("key").toObject().value("intensity").toDouble() !=
            f.value("lightingRig").toObject().value("dark").toObject().value("key").toObject().value("intensity").toDouble());
  }

  void surfacesFollowTheDarkCadTheme() {
    const QJsonObject f = fixture();
    const QJsonObject dark = f.value("themes").toObject().value("dark").toObject();
    const QJsonObject part = f.value("materials").toObject().value("importedPartDark").toObject();
    const QJsonObject mold = f.value("materials").toObject().value("outerMoldDark").toObject();
    const ViewportLook look = referenceLook(true);
    QCOMPARE(static_cast<int>(look.partRgb), dark.value("importedPartColor").toInt());
    QCOMPARE(static_cast<int>(look.moldRgb), dark.value("outerMoldColor").toInt());
    QCOMPARE(static_cast<int>(look.partRgb), part.value("colorHex").toInt());
    QCOMPARE(static_cast<int>(look.moldRgb), mold.value("colorHex").toInt());
    QCOMPARE(look.roughness, part.value("roughness").toDouble());
    QCOMPARE(look.metalness, part.value("metalness").toDouble());
    QCOMPARE(look.roughness, mold.value("roughness").toDouble());
    QCOMPARE(look.metalness, mold.value("metalness").toDouble());
    QVERIFY(part.value("doubleSided").toBool());
  }

  void gridAndEdgeStyle() {
    const QJsonObject f = fixture();
    const ViewportLook look = referenceLook(true);
    QCOMPARE(look.gridMinor.opacity, f.value("grid").toObject().value("minorOpacity").toDouble());
    QCOMPARE(look.gridMajor.opacity, f.value("grid").toObject().value("majorOpacity").toDouble());
    const QJsonObject edge = f.value("featureEdges").toObject().value("colorHex").toObject();
    QCOMPARE(static_cast<int>(look.edgeRgb), edge.value("color").toInt());
    QCOMPARE(look.edgeOpacity, edge.value("opacity").toDouble());
  }

  void featureEdgesAppearAtTheReferencesAngles() {
    const QJsonObject appears = fixture().value("featureEdges").toObject().value("appearsAtBend").toObject();
    QVERIFY(appears.size() >= 8);
    const double threshold = referenceLook(true).edgeAngleDegrees;
    for (auto it = appears.begin(); it != appears.end(); ++it) {
      const double bend = it.key().toDouble();
      const viewport::LineBuffers lines = viewport::buildFeatureEdgeBuffers(hinge(bend), threshold);
      const bool native = lines.vertexCount / 2 > 4;  // the four border edges always, the shared edge when it is a feature
      QVERIFY2(native == it.value().toBool(), qPrintable(QStringLiteral("bend %1 degrees: native %2, reference %3")
                                                             .arg(bend).arg(native).arg(it.value().toBool())));
    }
  }
};

QTEST_MAIN(ViewportLookTest)
#include "tst_viewport_look.moc"
