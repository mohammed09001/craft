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
    QCOMPARE(light.gridMinor.colorRgb, dark.gridMinor.colorRgb);        // white in both: three.js cannot parse the palette's rgba() string
    QVERIFY(light.gridMajor.colorRgb != dark.gridMajor.colorRgb);       // the major grid takes the palette's rgb() colour
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

  void everyRoleAndTheGlassAppearanceMatchTheReferencesMaterials() {
    const QJsonObject materials = fixture().value("materials").toObject();
    const QJsonObject roles = materials.value("roles").toObject();
    const ViewportLook look = referenceLook(true);
    const auto check = [&](const char* role, std::uint32_t rgb, double roughness, double metalness) {
      const QJsonObject m = roles.value(QLatin1String(role)).toObject();
      QVERIFY2(!m.isEmpty(), role);
      QCOMPARE(static_cast<int>(rgb), m.value("colorHex").toInt());
      QCOMPARE(roughness, m.value("roughness").toDouble());
      QCOMPARE(metalness, m.value("metalness").toDouble());
      QVERIFY(m.value("doubleSided").toBool());
      QVERIFY(!m.value("transparent").toBool());
      QCOMPARE(m.value("opacity").toDouble(), 1.0);
    };
    check("outer-mold", look.moldRgb, look.roughness, look.metalness);
    check("cavity-surface", look.cavitySurface.rgb, look.cavitySurface.roughness, look.cavitySurface.metalness);
    check("registration-key", look.registrationKey.rgb, look.registrationKey.roughness, look.registrationKey.metalness);
    check("sprue-funnel", look.sprueFunnel.rgb, look.sprueFunnel.roughness, look.sprueFunnel.metalness);

    // Glass: the outer mold's colour, translucent, for every role.
    const QJsonObject glass = materials.value("glass").toObject();
    QCOMPARE(static_cast<int>(look.moldRgb), glass.value("colorHex").toInt());
    QCOMPARE(look.glass.opacity, glass.value("opacity").toDouble());
    QCOMPARE(look.glass.roughness, glass.value("roughness").toDouble());
    QCOMPARE(look.glass.metalness, glass.value("metalness").toDouble());
    QCOMPARE(look.glass.transmission, glass.value("transmission").toDouble());
    QCOMPARE(look.glass.thickness, glass.value("thickness").toDouble());
    QCOMPARE(look.glass.ior, glass.value("ior").toDouble());
    QVERIFY(glass.value("transparent").toBool());
    QVERIFY(!glass.value("depthWrite").toBool());
    QVERIFY(materials.value("glassIsTheSameForEveryRole").toBool());
  }

  void aRoleTintTurnsTheOuterMoldColourIntoTheRoleColour() {
    const ViewportLook look = referenceLook(true);
    const auto linear = [](std::uint32_t rgb, int shift) {
      const double c = ((rgb >> shift) & 0xffu) / 255.0;
      return c <= 0.04045 ? c / 12.92 : std::pow((c + 0.055) / 1.055, 2.4);
    };
    for (const LookRole& role : {look.cavitySurface, look.registrationKey, look.sprueFunnel}) {
      const std::array<float, 3> tint = roleTint(role.rgb, look.moldRgb);
      for (int channel = 0; channel < 3; ++channel) {
        const int shift = 16 - 8 * channel;
        QVERIFY(std::fabs(tint[static_cast<std::size_t>(channel)] * linear(look.moldRgb, shift) - linear(role.rgb, shift)) < 1e-6);
      }
    }
    const std::array<float, 3> same = roleTint(look.moldRgb, look.moldRgb);
    QCOMPARE(same[0], 1.0f);
    QCOMPARE(same[1], 1.0f);
    QCOMPARE(same[2], 1.0f);
    // A yellow key on the red mold needs more green than the red body has: the factor exceeds 1, which a float vertex colour carries.
    QVERIFY(roleTint(look.registrationKey.rgb, look.moldRgb)[1] > 1.0f);
    QVERIFY(roleTint(look.cavitySurface.rgb, look.moldRgb)[0] < 1.0f);   // the cavity is a deeper red
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

  // The grid colours the reference really draws, from the real createEngineeringGrid with the palette strings the application
  // passes (ruler-reference.json): the minor colour is white in both themes (three.js cannot parse "rgba(r g b / a)"), the
  // major colour is the parseable rgb() of the palette.
  void gridColoursAreWhatTheReferenceDrawsInBothThemes() {
    QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/ruler-reference.json"));
    QVERIFY(file.open(QIODevice::ReadOnly));
    const QJsonObject grid = QJsonDocument::fromJson(file.readAll()).object().value("grid").toObject();
    for (const bool dark : {true, false}) {
      const QJsonObject reference = grid.value(dark ? "dark" : "light").toObject();
      const ViewportLook look = referenceLook(dark);
      QCOMPARE(static_cast<int>(look.gridMinor.colorRgb), reference.value("minorColorHex").toInt());
      QCOMPARE(look.gridMinor.opacity, reference.value("minorOpacity").toDouble());
      QCOMPARE(static_cast<int>(look.gridMajor.colorRgb), reference.value("majorColorHex").toInt());
      QCOMPARE(look.gridMajor.opacity, reference.value("majorOpacity").toDouble());
    }
    // The ruler labels: yellow on the dark background, blue on the light one.
    QCOMPARE(referenceLook(true).rulerLabelRgb, 0xfbbf24u);
    QCOMPARE(referenceLook(false).rulerLabelRgb, 0x1d4ed8u);
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
