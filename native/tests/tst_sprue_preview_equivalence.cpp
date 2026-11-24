// The Sprue 3D preview compared with the REAL reference runtime (spruePreview3dRuntime.ts under Three.js) through
// native/tests/fixtures/reference/sprue-preview-reference.json: the placement it resolves for each ray, the exact
// vertices/normals/indices of the funnel, main stem and entry neck, the preview material, and the glass look applied
// to the mold bodies (opacity, edge overlay).

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>
#include <cmath>
#include <set>

#include "MeshGeometryAdapter.h"
#include "TestMeshes.h"
#include "mold/SprueGeneration.h"
#include "mold/SpruePreview.h"

using namespace craft;

namespace {

QJsonObject loadFixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/sprue-preview-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

Vec3 vec(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {o.value("x").toDouble(), o.value("y").toDouble(), o.value("z").toDouble()};
}

bool approx(double a, double b, double tolerance = 1e-9) { return std::fabs(a - b) <= tolerance * std::max(1.0, std::fabs(b)); }

Bounds3 boundsFrom(const QJsonObject& size, const QJsonObject& offset) {
  const Vec3 s = vec(size), o = vec(offset);
  return {{o.x - s.x / 2, o.y - s.y / 2, o.z - s.z / 2}, {o.x + s.x / 2, o.y + s.y / 2, o.z + s.z / 2}};
}

std::vector<double> numbers(const QJsonValue& array) {
  std::vector<double> out;
  for (const QJsonValue& v : array.toArray()) out.push_back(v.toDouble());
  return out;
}

}  // namespace

class SpruePreviewEquivalenceTest : public QObject {
  Q_OBJECT

 private slots:
  void everyRayResolvesTheSamePlacementAndTheSamePreviewSolids() {
    const QJsonObject fixture = loadFixture();
    QVERIFY2(!fixture.isEmpty(), "sprue-preview-reference.json is missing; run scripts/native/generate-reference-fixtures.ps1 -Only spruepreview");
    int rays = 0, nullRays = 0, validRays = 0, invalidRays = 0, scaledProfiles = 0;

    for (const QJsonValue& sceneValue : fixture.value("scenes").toArray()) {
      const QJsonObject scene = sceneValue.toObject();
      const QString label = scene.value("name").toString();
      const Vec3 moldSize = vec(scene.value("mold"));
      const double topZ = scene.value("topZ").toDouble();
      const QJsonObject cavity = scene.value("cavity").toObject();
      const Bounds3 cavityBounds = boundsFrom(cavity.value("size").toObject(), cavity.value("offset").toObject());
      const Vec3 cavitySize = vec(cavity.value("size"));

      // The native twin of the reference scene: one mold body and a cavity box.
      MoldBody body;
      body.id = "body-1";
      body.mesh = test::cubeMesh({{-moldSize.x / 2, -moldSize.y / 2, -moldSize.z / 2}, {moldSize.x / 2, moldSize.y / 2, moldSize.z / 2}});
      body.bounds = {{-moldSize.x / 2, -moldSize.y / 2, -moldSize.z / 2}, {moldSize.x / 2, moldSize.y / 2, moldSize.z / 2}};
      body.triangleCount = body.mesh.triangleCount();
      const MeshPayload cavityMesh = test::cubeMesh(cavityBounds);
      const SprueCavityFacts facts{&cavityMesh, cavitySize.x * cavitySize.y * cavitySize.z, cavityBounds};

      for (const QJsonValue& rayValue : scene.value("rays").toArray()) {
        const QJsonObject r = rayValue.toObject();
        const QString where = label + "/" + r.value("name").toString();
        const Ray ray{vec(r.value("origin")), vec(r.value("direction")).normalized()};
        const auto placement = computeSpruePlacement(ray, {body}, topZ, facts);
        const QJsonValue referencePlacement = r.value("placement");
        ++rays;

        if (referencePlacement.isNull()) {
          QVERIFY2(!placement.has_value(), qPrintable(where + ": the reference rejects this ray"));
          QVERIFY(r.value("meshes").toArray().isEmpty());
          ++nullRays;
          continue;
        }
        QVERIFY2(placement.has_value(), qPrintable(where + ": the reference places a sprue"));
        const QJsonObject p = referencePlacement.toObject();
        const bool referenceValid = p.value("status").toString() == "valid";
        QCOMPARE(placement->valid, referenceValid);
        referenceValid ? ++validRays : ++invalidRays;
        const Vec3 top = vec(p.value("topPoint"));
        QVERIFY2(approx(placement->topPoint.x, top.x) && approx(placement->topPoint.y, top.y) && approx(placement->topPoint.z, top.z), qPrintable(where + " top point"));
        if (referenceValid) {
          const Vec3 cavityPoint = vec(p.value("cavityPoint"));
          QVERIFY2(approx(placement->cavityPoint.x, cavityPoint.x) && approx(placement->cavityPoint.y, cavityPoint.y) && approx(placement->cavityPoint.z, cavityPoint.z), qPrintable(where + " cavity point"));
        }
        QVERIFY2(approx(placement->stemLengthMm, p.value("stemLengthMm").toDouble()), qPrintable(where + " stem length"));
        const QJsonObject profile = p.value("profileDesign").toObject().value("profile").toObject();
        const SprueProfileDimensions& native = placement->profileDesign.profile;
        QVERIFY2(approx(native.mainDiameterMm, profile.value("mainDiameterMm").toDouble()), qPrintable(where + " main diameter"));
        QVERIFY2(approx(native.entryNeckDiameterMm, profile.value("entryNeckDiameterMm").toDouble()), qPrintable(where + " neck diameter"));
        QVERIFY2(approx(native.entryNeckLengthMm, profile.value("entryNeckLengthMm").toDouble()), qPrintable(where + " neck length"));
        if (std::fabs(native.mainDiameterMm - 2.5) > 1e-6) ++scaledProfiles;

        // The three solids, vertex by vertex.
        const auto preview = buildSpruePreview(*placement);
        QVERIFY2(preview.has_value(), qPrintable(where));
        QCOMPARE(preview->valid, referenceValid);
        QCOMPARE(preview->colorRgb, static_cast<unsigned>(r.value("colorHex").toInt()));
        QVERIFY(r.value("previewVisible").toBool());
        const QJsonArray meshes = r.value("meshes").toArray();
        QCOMPARE(meshes.size(), 3);
        for (int m = 0; m < 3; ++m) {
          const QJsonObject expected = meshes.at(m).toObject();
          const SpruePreviewPart& part = preview->parts[static_cast<std::size_t>(m)];
          const QString partWhere = where + "/" + expected.value("name").toString();
          QCOMPARE(QString::fromStdString(part.name), expected.value("name").toString());
          QCOMPARE(part.visible, expected.value("visible").toBool());
          if (!part.visible) continue;
          const auto positions = numbers(expected.value("positions"));
          const auto normals = numbers(expected.value("normals"));
          QVERIFY2(part.surface.positions.size() == positions.size(), qPrintable(partWhere + " vertex count"));
          QVERIFY2(part.surface.normals.size() == normals.size(), qPrintable(partWhere + " normal count"));
          for (std::size_t i = 0; i < positions.size(); ++i) {
            QVERIFY2(approx(part.surface.positions[i], positions[i], 1e-9), qPrintable(QStringLiteral("%1 position %2: %3 vs %4").arg(partWhere).arg(i).arg(part.surface.positions[i]).arg(positions[i])));
            QVERIFY2(approx(part.surface.normals[i], normals[i], 1e-9), qPrintable(QStringLiteral("%1 normal %2: %3 vs %4").arg(partWhere).arg(i).arg(part.surface.normals[i]).arg(normals[i])));
          }
          const QJsonArray indices = expected.value("indices").toArray();
          QVERIFY2(part.surface.indices.size() == static_cast<std::size_t>(indices.size()), qPrintable(partWhere + " index count"));
          for (int i = 0; i < indices.size(); ++i) QVERIFY2(part.surface.indices[static_cast<std::size_t>(i)] == static_cast<std::uint32_t>(indices.at(i).toInt()), qPrintable(partWhere + " index"));
        }
      }
    }
    // The fixture must exercise every outcome, including a profile that is not the default (radial scaling).
    QVERIFY(rays >= 48);
    QVERIFY(nullRays >= 12);
    QVERIFY(validRays >= 20);
    QVERIFY(invalidRays >= 12);
    QVERIFY(scaledProfiles >= 6);
  }

  void presentationConstantsMatchTheReference() {
    const QJsonObject fixture = loadFixture();
    for (const QJsonValue& sceneValue : fixture.value("scenes").toArray()) {
      const QJsonObject scene = sceneValue.toObject();
      // The preview material: green when valid, red when not, the same finish otherwise.
      std::set<unsigned> colours;
      for (const QJsonValue& m : scene.value("previewMaterials").toArray()) {
        const QJsonObject material = m.toObject();
        colours.insert(static_cast<unsigned>(material.value("hex").toInt()));
        QCOMPARE(material.value("opacity").toDouble(), kSpruePreviewOpacity);
        QCOMPARE(material.value("roughness").toDouble(), kSpruePreviewRoughness);
        QCOMPARE(material.value("metalness").toDouble(), kSpruePreviewMetalness);
        QVERIFY(material.value("transparent").toBool());
        QVERIFY(material.value("depthWrite").toBool());
      }
      QVERIFY(colours.count(kSpruePreviewValidRgb) == 1 && colours.count(kSpruePreviewInvalidRgb) == 1);

      // The glass applied to mold bodies while the tool is active, and restored after.
      const QJsonObject glass = scene.value("glass").toObject();
      QCOMPARE(glass.value("moldOpacity").toDouble(), kSprueGlassOpacity);
      QVERIFY(glass.value("moldTransparent").toBool());
      QVERIFY(!glass.value("moldDepthWrite").toBool());
      QCOMPARE(static_cast<unsigned>(glass.value("edgeColorHex").toInt()), kSprueGlassEdgeRgb);
      QCOMPARE(glass.value("edgeOpacity").toDouble(), kSprueGlassEdgeOpacity);
      QCOMPARE(glass.value("edgeRenderOrder").toInt(), 9);
      const QJsonObject restored = scene.value("restored").toObject();
      QCOMPARE(restored.value("moldOpacity").toDouble(), 0.67);  // the body's own state comes back untouched
      QVERIFY(!restored.value("moldTransparent").toBool());
      QVERIFY(restored.value("moldDepthWrite").toBool());
    }
  }

  void glassEdgeOverlayMatchesTheReferenceEdges() {
    // The reference outlines each mold body with EdgesGeometry at its default 1 degree threshold. The native overlay
    // uses the same threshold through the feature-edge extractor; for the box bodies of the fixture the segments are
    // the twelve box edges.
    const QJsonObject fixture = loadFixture();
    for (const QJsonValue& sceneValue : fixture.value("scenes").toArray()) {
      const QJsonObject scene = sceneValue.toObject();
      const Vec3 size = vec(scene.value("mold"));
      const MeshPayload mesh = test::cubeMesh({{-size.x / 2, -size.y / 2, -size.z / 2}, {size.x / 2, size.y / 2, size.z / 2}});
      const viewport::LineBuffers native = viewport::buildFeatureEdgeBuffers(mesh, kSprueGlassEdgeAngleDegrees);

      using Key = std::array<float, 6>;
      const auto canonical = [](float ax, float ay, float az, float bx, float by, float bz) {
        const std::array<float, 3> a{ax, ay, az}, b{bx, by, bz};
        return a < b ? Key{ax, ay, az, bx, by, bz} : Key{bx, by, bz, ax, ay, az};
      };
      std::set<Key> expected, actual;
      for (const QJsonValue& e : scene.value("glass").toObject().value("edgeSegments").toArray()) {
        const Vec3 f = vec(e.toObject().value("from")), t = vec(e.toObject().value("to"));
        expected.insert(canonical(float(f.x), float(f.y), float(f.z), float(t.x), float(t.y), float(t.z)));
      }
      const auto* v = reinterpret_cast<const float*>(native.vertexData.constData());
      for (int i = 0; i + 1 < native.vertexCount; i += 2) actual.insert(canonical(v[i * 3], v[i * 3 + 1], v[i * 3 + 2], v[i * 3 + 3], v[i * 3 + 4], v[i * 3 + 5]));
      QCOMPARE(expected.size(), std::size_t{12});
      QVERIFY2(actual == expected, qPrintable(scene.value("name").toString() + ": glass edge segments differ"));
    }
  }

  void aStemBelowTheToleranceHidesThePreview() {
    SpruePlacement placement;
    placement.valid = true;
    placement.topPoint = {0, 0, 10};
    placement.stemLengthMm = 5e-5;
    QVERIFY(!buildSpruePreview(placement).has_value());
    placement.stemLengthMm = std::nan("");
    QVERIFY(!buildSpruePreview(placement).has_value());
    placement.stemLengthMm = 2e-4;  // just above: shown, but with a stem and neck too short to draw separately
    const auto preview = buildSpruePreview(placement);
    QVERIFY(preview.has_value());
    QVERIFY(preview->parts[0].visible);
  }

  void theNeckIsClampedToTheStemAndTheMainStemKeepsTheRest() {
    SpruePlacement placement;
    placement.valid = true;
    placement.topPoint = {1, 2, 30};
    placement.stemLengthMm = 3;
    placement.profileDesign.profile.mainDiameterMm = 5;
    placement.profileDesign.profile.entryNeckDiameterMm = 2.5;
    placement.profileDesign.profile.entryNeckLengthMm = 10;  // longer than the 3 mm stem: clamped, nothing left for the main stem
    const auto preview = buildSpruePreview(placement);
    QVERIFY(preview.has_value());
    QVERIFY(preview->parts[0].visible);
    QVERIFY(!preview->parts[1].visible);  // main stem length 0
    QVERIFY(preview->parts[2].visible);
    // The neck spans exactly the stem: from z = 30 down to z = 27.
    double minZ = 1e9, maxZ = -1e9;
    for (std::size_t i = 2; i < preview->parts[2].surface.positions.size(); i += 3) {
      minZ = std::min(minZ, preview->parts[2].surface.positions[i]);
      maxZ = std::max(maxZ, preview->parts[2].surface.positions[i]);
    }
    QVERIFY(approx(minZ, 27.0, 1e-9));
    QVERIFY(approx(maxZ, 30.0, 1e-9));
  }
};

QTEST_APPLESS_MAIN(SpruePreviewEquivalenceTest)
#include "tst_sprue_preview_equivalence.moc"
