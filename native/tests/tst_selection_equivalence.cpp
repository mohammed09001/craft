// Selection box, face picking and highlight colour compared with the REAL reference (Three.js objectSelectionBoxRuntime
// and modelSelectionHighlight), through native/tests/fixtures/reference/selection-reference.json, plus the properties
// that do not need the reference (dash pattern, naming consistency with Cut by Face, parsing edge cases).

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

#include "mold/ReferenceMold.h"
#include "view/SelectionBox.h"

using namespace craft;

namespace {

QJsonObject loadFixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/selection-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

Vec3 vec(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {o.value("x").toDouble(), o.value("y").toDouble(), o.value("z").toDouble()};
}

Bounds3 boundsOf(const QJsonObject& box) {
  const Vec3 mn = vec(box.value("min")), mx = vec(box.value("max"));
  return {{mn.x, mn.y, mn.z}, {mx.x, mx.y, mx.z}};
}

bool approx(double a, double b, double tolerance = 1e-9) { return std::fabs(a - b) <= tolerance * std::max(1.0, std::fabs(b)); }

}  // namespace

class SelectionEquivalenceTest : public QObject {
  Q_OBJECT

 private slots:
  void faceNamesAndOrderMatchTheReference() {
    const QJsonObject fixture = loadFixture();
    QVERIFY2(!fixture.isEmpty(), "selection-reference.json is missing; run scripts/native/generate-reference-fixtures.ps1 -Only selection");
    const QJsonArray names = fixture.value("faceNames").toArray();
    QCOMPARE(names.size(), 6);
    for (int i = 0; i < 6; ++i) QCOMPARE(QString::fromLatin1(selectionBoxFaceName(kSelectionBoxFaces[static_cast<std::size_t>(i)])), names.at(i).toString());
  }

  void faceQuadsAndEdgesMatchTheReference() {
    const QJsonObject fixture = loadFixture();
    for (const QJsonValue& boxValue : fixture.value("boxes").toArray()) {
      const QJsonObject box = boxValue.toObject();
      const QString label = box.value("name").toString();
      const Bounds3 bounds = boundsOf(box);

      const auto quads = selectionBoxFaceQuads(bounds);
      const QJsonArray definitions = box.value("definitions").toArray();
      QCOMPARE(definitions.size(), 6);
      for (int f = 0; f < 6; ++f) {
        const QJsonObject d = definitions.at(f).toObject();
        QCOMPARE(QString::fromLatin1(selectionBoxFaceName(quads[static_cast<std::size_t>(f)].face)), d.value("face").toString());
        const QJsonArray corners = d.value("corners").toArray();
        for (int c = 0; c < 4; ++c) {
          const Vec3 expected = vec(corners.at(c));
          const Vec3 actual = quads[static_cast<std::size_t>(f)].corners[static_cast<std::size_t>(c)];
          QVERIFY2(actual.x == expected.x && actual.y == expected.y && actual.z == expected.z,
                   qPrintable(QStringLiteral("%1 face %2 corner %3").arg(label).arg(f).arg(c)));
        }
      }

      const auto edges = selectionBoxEdges(bounds);
      const QJsonArray expectedEdges = box.value("edges").toArray();
      QCOMPARE(expectedEdges.size(), 12);
      double accumulated = 0;
      for (int e = 0; e < 12; ++e) {
        const QJsonObject x = expectedEdges.at(e).toObject();
        const Vec3 from = vec(x.value("from")), to = vec(x.value("to"));
        const Segment3& s = edges[static_cast<std::size_t>(e)];
        QVERIFY2(s.from.x == from.x && s.from.y == from.y && s.from.z == from.z && s.to.x == to.x && s.to.y == to.y && s.to.z == to.z,
                 qPrintable(QStringLiteral("%1 edge %2").arg(label).arg(e)));
        // The reference's line distance accumulates over the consecutive edges (LineSegments.computeLineDistances):
        // each edge starts where the previous one ended, so the dash pattern runs on from edge to edge.
        QVERIFY2(approx(x.value("distanceAtFrom").toDouble(), accumulated), qPrintable(QStringLiteral("%1 edge %2 start").arg(label).arg(e)));
        accumulated += (to - from).length();
        QVERIFY2(approx(x.value("distanceAtTo").toDouble(), accumulated), qPrintable(QStringLiteral("%1 edge %2 end").arg(label).arg(e)));
      }
    }
  }

  void faceHitsAndHoverResolutionMatchTheReference() {
    const QJsonObject fixture = loadFixture();
    int rays = 0, withHits = 0, misses = 0;
    for (const QJsonValue& boxValue : fixture.value("boxes").toArray()) {
      const QJsonObject box = boxValue.toObject();
      const QString label = box.value("name").toString();
      const Bounds3 bounds = boundsOf(box);
      for (const QJsonValue& rayValue : box.value("rays").toArray()) {
        const QJsonObject r = rayValue.toObject();
        const QString where = label + "/" + r.value("name").toString();
        const Ray ray{vec(r.value("origin")), vec(r.value("direction")).normalized()};
        const auto hits = pickSelectionBoxFaces(ray, bounds);
        const QJsonArray expected = r.value("hits").toArray();
        QVERIFY2(hits.size() == static_cast<std::size_t>(expected.size()), qPrintable(where + QStringLiteral(": %1 hits, reference %2").arg(hits.size()).arg(expected.size())));
        for (int i = 0; i < expected.size(); ++i) {
          const QJsonObject h = expected.at(i).toObject();
          QCOMPARE(QString::fromLatin1(selectionBoxFaceName(hits[static_cast<std::size_t>(i)].face)), h.value("face").toString());
          QVERIFY2(approx(hits[static_cast<std::size_t>(i)].distance, h.value("distance").toDouble()), qPrintable(where + " distance"));
          const Vec3 p = vec(h.value("point"));
          QVERIFY2(approx(hits[static_cast<std::size_t>(i)].point.x, p.x) && approx(hits[static_cast<std::size_t>(i)].point.y, p.y) && approx(hits[static_cast<std::size_t>(i)].point.z, p.z), qPrintable(where + " point"));
        }
        const auto hovered = pickSelectionBoxFace(ray, bounds);
        const QJsonValue referenceHover = r.value("hovered");
        if (referenceHover.isNull()) {
          QVERIFY2(!hovered, qPrintable(where + ": the reference resolves no face"));
          ++misses;
        } else {
          QVERIFY2(hovered.has_value(), qPrintable(where + ": the reference hovers " + referenceHover.toString()));
          QCOMPARE(QString::fromLatin1(selectionBoxFaceName(hovered->face)), referenceHover.toString());
        }
        ++rays;
        if (!expected.isEmpty()) ++withHits;
      }
    }
    // The fixture must exercise both outcomes, or this test proves nothing.
    QVERIFY(rays >= 150);
    QVERIFY(withHits > 100);
    QVERIFY(misses >= 10);
  }

  void highlightColourRuleMatchesTheReferenceIncludingTheLinearSpaceThreshold() {
    const QJsonObject fixture = loadFixture();
    const QJsonArray highlights = fixture.value("highlights").toArray();
    QVERIFY(highlights.size() >= 7);
    bool sawThreshold = false;
    for (const QJsonValue& value : highlights) {
      const QJsonObject h = value.toObject();
      const QString background = h.value("background").toString();
      const unsigned expected = static_cast<unsigned>(h.value("colorHex").toInt());
      QCOMPARE(highlightColorRgb(background.toStdString()), expected);
      QCOMPARE(static_cast<unsigned>(h.value("emissiveHex").toInt()), expected);  // the emissive is the highlight colour
      QCOMPARE(h.value("emissiveIntensity").toDouble(), kHighlightEmissiveIntensity);
      QCOMPARE(h.value("roughness").toDouble(), kHighlightMaxRoughness);  // min(0.6, 0.58)
      QVERIFY(h.value("selectionBoxPresent").toBool());
      if (background == "#bbbbbb" || background == "#bcbcbc") sawThreshold = true;
    }
    QVERIFY(sawThreshold);
    QVERIFY(!isLightBackground("#808080"));  // sRGB mid-grey is dark in the linear working space
    QVERIFY(isLightBackground("#f7f9fb"));   // the app's light viewport
    QVERIFY(!isLightBackground("#0b1118"));  // the app's dark viewport
    QCOMPARE(highlightColorRgb("#0b1118"), kHighlightOnDarkRgb);
    QCOMPARE(highlightColorRgb("#f7f9fb"), kHighlightOnLightRgb);
  }

  void stylingConstantsMatchTheReference() {
    const QJsonObject fixture = loadFixture();
    QCOMPARE(fixture.value("clickDragThresholdPx").toInt(), 4);
    QCOMPARE(kClickDragThresholdPx, 4.0);
    for (const QJsonValue& boxValue : fixture.value("boxes").toArray()) {
      const QJsonObject style = boxValue.toObject().value("style").toObject();
      QCOMPARE(style.value("dashSize").toDouble(), kSelectionBoxDashMm);
      QCOMPARE(style.value("gapSize").toDouble(), kSelectionBoxGapMm);
      QCOMPARE(static_cast<unsigned>(style.value("lineColorHex").toInt()), kSelectionBoxColorRgb);
      QCOMPARE(static_cast<unsigned>(style.value("hoverColorHex").toInt()), kSelectionBoxColorRgb);
      QCOMPARE(static_cast<unsigned>(style.value("selectedColorHex").toInt()), kSelectionBoxColorRgb);
      QCOMPARE(style.value("lineOpacity").toDouble(), kSelectionBoxLineOpacity);
      QCOMPARE(style.value("hoverOpacity").toDouble(), kSelectionBoxHoverOpacity);
      QCOMPARE(style.value("selectedOpacity").toDouble(), kSelectionBoxSelectedOpacity);
    }
  }

  // --- properties that need no reference -------------------------------------------------------------------------

  void faceNamesAndNormalsAgreeWithCutByFace() {
    // Clicking a box face toggles the Cut by Face plane of the same name, so the two vocabularies must coincide.
    for (FaceId face : kFaceIds) {
      const auto boxFace = selectionBoxFaceFromName(faceIdName(face));
      QVERIFY2(boxFace.has_value(), faceIdName(face));
      QCOMPARE(std::string(selectionBoxFaceName(*boxFace)), std::string(faceIdName(face)));
      const CuttingPlane plane = createCuttingPlane(face, std::nullopt);
      const Vec3 normal = selectionBoxFaceNormal(*boxFace);
      QCOMPARE(plane.normal.x, normal.x);
      QCOMPARE(plane.normal.y, normal.y);
      QCOMPARE(plane.normal.z, normal.z);
    }
    QVERIFY(!selectionBoxFaceFromName("Front").has_value());
    QVERIFY(!selectionBoxFaceFromName("").has_value());
  }

  void aRayFromEachSideHitsTheMatchingFace() {
    const Bounds3 bounds{{-10, -20, 0}, {10, 20, 30}};
    struct Case { Vec3 origin, direction; const char* face; };
    const Case cases[] = {{{0, 100, 15}, {0, -1, 0}, "front"}, {{0, -100, 15}, {0, 1, 0}, "back"}, {{-100, 0, 15}, {1, 0, 0}, "left"},
                          {{100, 0, 15}, {-1, 0, 0}, "right"}, {{0, 0, 100}, {0, 0, -1}, "top"},   {{0, 0, -100}, {0, 0, 1}, "bottom"}};
    for (const Case& c : cases) {
      const auto hit = pickSelectionBoxFace({c.origin, c.direction}, bounds);
      QVERIFY2(hit.has_value(), c.face);
      QCOMPARE(std::string(selectionBoxFaceName(hit->face)), std::string(c.face));
    }
    // Looking away, or passing beside the box: no face.
    QVERIFY(!pickSelectionBoxFace({{0, 100, 15}, {0, 1, 0}}, bounds));
    QVERIFY(!pickSelectionBoxFace({{50, 100, 15}, {0, -1, 0}}, bounds));
  }

  void dashPatternStartsWithADashAndCoversTheEdge() {
    const Segment3 edge{{0, 0, 0}, {40, 0, 0}};
    const auto dashes = dashEdge(edge, 0.35, 0.22);
    QCOMPARE(dashes.size(), std::size_t{71});  // ceil(40 / 0.57)
    QCOMPARE(dashes.front().from.x, 0.0);
    QVERIFY(approx(dashes.front().to.x, 0.35));
    QVERIFY(approx(dashes[1].from.x, 0.57));
    QVERIFY(approx(dashes[1].to.x, 0.92));
    QVERIFY(dashes.back().to.x <= 40.0 + 1e-12);        // the last dash is clipped to the edge
    QVERIFY(dashes.back().from.x > 40.0 - 0.57);        // and starts within the last period
    for (const Segment3& d : dashes) QVERIFY(d.from.y == 0 && d.to.z == 0);
    QVERIFY(dashEdge({{1, 2, 3}, {1, 2, 3}}, 0.35, 0.22).empty());  // zero-length edge

    // Very long edges stay bounded: the pattern is scaled up instead of producing a million dashes.
    const auto longEdge = dashEdge({{0, 0, 0}, {0, 0, 50000}}, 0.35, 0.22, 0, 400);
    QVERIFY(longEdge.size() <= 401);
    QVERIFY(longEdge.size() >= 399);
    QVERIFY(approx(longEdge.back().to.z, 50000, 0.01));
  }

  void dashPatternRunsOnFromOneEdgeIntoTheNext() {
    // Edge 2 of a 40 mm box starts 40 mm into the pattern: 40 = 70 periods of 0.57 + 0.1, so it opens inside a dash.
    const Segment3 edge{{0, 0, 0}, {10, 0, 0}};
    const auto dashes = dashEdge(edge, 0.35, 0.22, 40.0);
    QVERIFY(approx(dashes.front().from.x, 0.0));
    QVERIFY(approx(dashes.front().to.x, 0.25, 1e-6));   // the rest of the dash that began 0.1 before the edge
    QVERIFY(approx(dashes[1].from.x, 0.47, 1e-6));      // next period starts 0.57 - 0.1 into the edge
    // A start exactly on a period boundary opens with a full dash.
    const auto aligned = dashEdge(edge, 0.35, 0.22, 0.57 * 10);
    QVERIFY(approx(aligned.front().from.x, 0.0, 1e-6));
    QVERIFY(approx(aligned.front().to.x, 0.35, 1e-6));
    // A start inside a gap opens with that gap.
    const auto inGap = dashEdge(edge, 0.35, 0.22, 0.4);
    QVERIFY(approx(inGap.front().from.x, 0.17, 1e-6));  // the gap ends 0.57 - 0.4 = 0.17 into the edge
  }

  void theTwelveEdgesTogetherKeepTheDashRatio() {
    const Bounds3 bounds{{0, 0, 0}, {40, 30, 12}};
    const auto dashes = selectionBoxDashes(bounds, 0.35, 0.22);
    double dashed = 0;
    for (const Segment3& d : dashes) dashed += (d.to - d.from).length();
    const double total = 4 * (40 + 30 + 12);
    QVERIFY(std::fabs(dashed - total * 0.35 / 0.57) < 0.57 * 12);  // within a period per edge junction
    // No dash crosses an edge: every piece lies on a single axis-parallel line.
    for (const Segment3& d : dashes) {
      const int moving = (d.from.x != d.to.x) + (d.from.y != d.to.y) + (d.from.z != d.to.z);
      QVERIFY(moving <= 1);
    }
  }

  void backgroundParsingIsStrict() {
    QVERIFY(!isLightBackground(""));
    QVERIFY(!isLightBackground("red"));
    QVERIFY(!isLightBackground("#12"));
    QVERIFY(!isLightBackground("#gggggg"));
    QVERIFY(isLightBackground("#fff"));
    QVERIFY(isLightBackground("#FFFFFF"));
    QVERIFY(!isLightBackground("#000"));
  }
};

QTEST_APPLESS_MAIN(SelectionEquivalenceTest)
#include "tst_selection_equivalence.moc"
