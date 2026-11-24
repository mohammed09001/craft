// The Sprue resize gizmo compared with the REAL reference runtime (sprueResizeRuntime.ts under Three.js and jsdom, real
// DOM pointer events) through native/tests/fixtures/reference/sprue-resize-reference.json: the handles built for each
// sprue, which handle 182 pointer probes resolve, drag arithmetic with snapping/limits/label, what the numeric editor
// commits, and the presentation selector's pending/resolved/invalid precedence.

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>
#include <set>

#include "mold/SprueGizmo.h"

using namespace craft;

namespace {

QJsonObject loadFixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/sprue-resize-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

Vec3 vec(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {o.value("x").toDouble(), o.value("y").toDouble(), o.value("z").toDouble()};
}
Point3 point(const QJsonValue& v) {
  const Vec3 p = vec(v);
  return {p.x, p.y, p.z};
}

bool approx(double a, double b, double tolerance = 1e-9) { return std::fabs(a - b) <= tolerance * std::max(1.0, std::fabs(b)); }

SprueProfileDimensions profileOf(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  SprueProfileDimensions p;
  p.mainDiameterMm = o.value("mainDiameterMm").toDouble();
  p.entryNeckDiameterMm = o.value("entryNeckDiameterMm").toDouble();
  p.entryNeckLengthMm = o.value("entryNeckLengthMm").toDouble();
  return p;
}

SpruePresentation presentationOf(const QJsonObject& o) {
  SpruePresentation p;
  p.operationId = o.value("operationId").toString().toStdString();
  p.position = point(o.value("position"));
  p.inwardDirection = point(o.value("inwardDirection"));
  p.profile = profileOf(o.value("profile"));
  if (o.contains("depthMm")) p.depthMm = o.value("depthMm").toDouble();
  if (o.contains("targetBodyIds")) {
    std::vector<std::string> ids;
    for (const QJsonValue& id : o.value("targetBodyIds").toArray()) ids.push_back(id.toString().toStdString());
    p.targetBodyIds = ids;
  }
  p.status = o.value("status").toString().toStdString();
  return p;
}

std::vector<SpruePresentation> fixtureDefinitions(const QJsonObject& fixture) {
  std::vector<SpruePresentation> out;
  for (const QJsonValue& d : fixture.value("definitions").toArray()) out.push_back(presentationOf(d.toObject()));
  return out;
}

QString nameOf(const SprueHandle& h) { return QStringLiteral("SprueResizeHandle:") + QString::fromStdString(h.id()); }

int indexOf(const std::vector<SprueHandle>& handles, const QString& name) {
  for (std::size_t i = 0; i < handles.size(); ++i) {
    if (nameOf(handles[i]) == name) return static_cast<int>(i);
  }
  return -1;
}

}  // namespace

class SprueGizmoEquivalenceTest : public QObject {
  Q_OBJECT

 private slots:
  void handlesAreBuiltLikeTheReference() {
    const QJsonObject fixture = loadFixture();
    QVERIFY2(!fixture.isEmpty(), "sprue-resize-reference.json is missing; run scripts/native/generate-reference-fixtures.ps1 -Only sprueresize");
    const auto handles = buildSprueHandles(fixtureDefinitions(fixture));
    const QJsonArray expected = fixture.value("handles").toArray();
    QCOMPARE(static_cast<int>(handles.size()), expected.size());
    QVERIFY(fixture.value("objectVisible").toBool());
    for (int i = 0; i < expected.size(); ++i) {
      const QJsonObject e = expected.at(i).toObject();
      const SprueHandle& h = handles[static_cast<std::size_t>(i)];
      const QString where = e.value("name").toString();
      QCOMPARE(nameOf(h), where);
      const Vec3 p = vec(e.value("position"));
      QVERIFY2(approx(h.position.x, p.x) && approx(h.position.y, p.y) && approx(h.position.z, p.z), qPrintable(where + " position"));
      const QJsonObject q = e.value("quaternion").toObject();
      QVERIFY2(approx(h.orientation.x, q.value("x").toDouble()) && approx(h.orientation.y, q.value("y").toDouble()) &&
                   approx(h.orientation.z, q.value("z").toDouble()) && approx(h.orientation.w, q.value("w").toDouble()),
               qPrintable(where + " orientation"));
      const QJsonObject visual = e.value("visual").toObject(), target = e.value("target").toObject();
      QVERIFY2(approx(h.radiusMm, visual.value("radius").toDouble()), qPrintable(where + " radius"));
      QVERIFY2(approx(h.visualTubeMm(), visual.value("tube").toDouble()), qPrintable(where + " visual tube"));
      QVERIFY2(approx(h.radiusMm, target.value("radius").toDouble()), qPrintable(where + " pick radius"));
      QVERIFY2(approx(h.targetTubeMm(), target.value("tube").toDouble()), qPrintable(where + " pick tube"));
      QCOMPARE(visual.value("radialSegments").toInt(), 8);
      QCOMPARE(visual.value("tubularSegments").toInt(), 32);
      QCOMPARE(handleColorRgb(h.status, SprueHandleVisual::Idle), static_cast<unsigned>(visual.value("colorHex").toInt()));
      QCOMPARE(handleOpacity(SprueHandleVisual::Idle), visual.value("opacity").toDouble());
      QCOMPARE(handleVisualScale(SprueHandleVisual::Idle), visual.value("scale").toDouble());
    }
    QCOMPARE(kSprueDiameterSnapMm, fixture.value("constants").toObject().value("snapMm").toDouble());
    QCOMPARE(kSprueDiameterSensitivityMmPerPixel, fixture.value("constants").toObject().value("sensitivityMmPerPixel").toDouble());
  }

  void everyPointerProbeResolvesTheSameHandle() {
    const QJsonObject fixture = loadFixture();
    const auto handles = buildSprueHandles(fixtureDefinitions(fixture));
    int hovered = 0, idle = 0;
    std::set<QString> seen;
    for (const QJsonValue& value : fixture.value("picks").toArray()) {
      const QJsonObject p = value.toObject();
      const QJsonObject ray = p.value("ray").toObject();
      const Ray r{vec(ray.value("origin")), vec(ray.value("direction")).normalized()};
      const auto pick = pickSprueHandle(r, handles);
      const QJsonValue expected = p.value("hovered");
      const QString label = p.value("label").toString();
      if (expected.isNull()) {
        QVERIFY2(!pick.has_value(), qPrintable(label + QStringLiteral(": native hits %1, the reference nothing").arg(pick ? nameOf(handles[static_cast<std::size_t>(pick->handle)]) : QString())));
        ++idle;
        continue;
      }
      QVERIFY2(pick.has_value(), qPrintable(label + ": the reference hits " + expected.toString()));
      QCOMPARE(nameOf(handles[static_cast<std::size_t>(pick->handle)]), expected.toString());
      // Hovering a resolved handle hides the bodies the sprue cuts (and only those).
      const SprueHandle& h = handles[static_cast<std::size_t>(pick->handle)];
      QStringList hidden;
      for (const std::string& id : h.targetBodyIds) hidden << QString::fromStdString(id);
      QStringList expectedHidden;
      for (const QJsonValue& b : p.value("hiddenBodies").toArray()) expectedHidden << b.toString();
      QCOMPARE(hidden, expectedHidden);
      seen.insert(expected.toString());
      ++hovered;
    }
    // The probes must cover every handle and both outcomes, or this proves nothing.
    QVERIFY(hovered >= 80);
    QVERIFY(idle >= 80);
    QCOMPARE(seen.size(), std::size_t{5});
  }

  void dragsProduceTheSameDiametersLabelsAndCommits() {
    const QJsonObject fixture = loadFixture();
    const auto handles = buildSprueHandles(fixtureDefinitions(fixture));
    int commits = 0, none = 0;
    for (const QJsonValue& value : fixture.value("drags").toArray()) {
      const QJsonObject d = value.toObject();
      const QString name = d.value("name").toString();
      const int index = indexOf(handles, d.value("handle").toString());
      QVERIFY2(index >= 0, qPrintable(name));
      const SprueHandle& handle = handles[static_cast<std::size_t>(index)];
      QCOMPARE(d.value("started").toObject().value("state").toString(), QStringLiteral("resizing"));

      std::optional<double> preview;
      for (const QJsonValue& stepValue : d.value("steps").toArray()) {
        const QJsonObject step = stepValue.toObject();
        preview = dragDiameter(handle, step.value("dx").toDouble(), step.value("dy").toDouble(), step.value("shift").toBool());
        QVERIFY2(preview.has_value(), qPrintable(name));
        QCOMPARE(QString::fromStdString(diameterLabel(*preview)), step.value("label").toString());
        QVERIFY2(approx(*preview / handle.diameterMm(), step.value("scale").toDouble(), 1e-12), qPrintable(name + " preview scale"));
        QVERIFY2(approx(*preview / handle.diameterMm(), step.value("scaleY").toDouble(), 1e-12), qPrintable(name + " preview scale y"));
        QCOMPARE(diameterLabelWarns(handle, *preview), step.value("labelColor").toString().contains("warning"));
      }
      const QJsonObject after = d.value("after").toObject();
      const QJsonArray expectedCommits = after.value("commits").toArray();
      const bool released = d.value("release").toString() == "up";
      const bool changed = preview && *preview != handle.diameterMm();
      if (released && changed) {
        QCOMPARE(expectedCommits.size(), 1);
        const QJsonObject c = expectedCommits.at(0).toObject();
        QCOMPARE(c.value("kind").toString(), handle.opening == SprueHandleOpening::Top ? QStringLiteral("main") : QStringLiteral("neck"));
        QCOMPARE(c.value("operationId").toString().toStdString(), handle.operationId);
        QVERIFY2(approx(*preview, c.value("diameterMm").toDouble()), qPrintable(name + " committed diameter"));
        ++commits;
      } else {
        QVERIFY2(expectedCommits.isEmpty(), qPrintable(name + ": the reference commits nothing here"));
        ++none;
      }
      // After Escape the preview is reverted; after a release it stays until the new definition arrives.
      if (!released) QCOMPARE(after.value("scale").toDouble(), 1.0);
      QVERIFY(after.value("controlsEnabled").toBool());
    }
    QVERIFY(commits >= 9);
    QVERIFY(none >= 3);
  }

  void numericEditorOpensWithTheSameLimitsAndCommitsTheSameValues() {
    const QJsonObject fixture = loadFixture();
    const auto handles = buildSprueHandles(fixtureDefinitions(fixture));
    for (const QJsonValue& value : fixture.value("numeric").toArray()) {
      const QJsonObject n = value.toObject();
      const QString name = n.value("name").toString();
      const SprueHandle& handle = handles[static_cast<std::size_t>(indexOf(handles, n.value("handle").toString()))];
      const QJsonObject opened = n.value("opened").toObject();
      char buffer[32];
      std::snprintf(buffer, sizeof buffer, "%.2f", handle.diameterMm());
      QCOMPARE(QString::fromLatin1(buffer), opened.value("value").toString());
      QCOMPARE(opened.value("min").toString().toDouble(), kMinSprueDiameterMm);
      QCOMPARE(opened.value("max").toString().toDouble(), handle.maximumDiameterMm());
      QCOMPARE(opened.value("step").toString().toDouble(), kSprueDiameterSnapMm);
      QCOMPARE(opened.value("state").toString(), QStringLiteral("numeric-edit"));

      // A browser number input turns anything unparseable into "", which Number() reads as 0.
      bool ok = false;
      double typed = n.value("input").toString().toDouble(&ok);
      if (!ok) typed = 0;
      const auto committed = normalizeHandleDiameter(handle, typed);
      QVERIFY2(committed.has_value(), qPrintable(name));
      const QJsonArray commits = n.value("afterEnter").toObject().value("commits").toArray();
      QCOMPARE(commits.size(), 1);
      const QJsonObject c = commits.at(0).toObject();
      QCOMPARE(c.value("kind").toString(), handle.opening == SprueHandleOpening::Top ? QStringLiteral("main") : QStringLiteral("neck"));
      QVERIFY2(approx(*committed, c.value("diameterMm").toDouble()), qPrintable(name + QStringLiteral(": native %1, reference %2").arg(*committed).arg(c.value("diameterMm").toDouble())));
      QVERIFY(!n.value("afterEnter").toObject().value("stillOpen").toBool());
    }
    // A non-finite request has no valid diameter (the editor then stays open with a validation message).
    const SprueHandle& top = handles.front();
    QVERIFY(!normalizeHandleDiameter(top, std::nan("")).has_value());
    QVERIFY(!normalizeHandleDiameter(top, INFINITY).has_value());
  }

  void rebuildingAfterAResizeUsesTheNewDiameter() {
    const QJsonObject fixture = loadFixture();
    const QJsonObject lifecycle = fixture.value("lifecycle").toObject();
    std::vector<SpruePresentation> definitions = fixtureDefinitions(fixture);
    definitions.resize(1);
    definitions[0].profile.mainDiameterMm = 7;
    const auto handles = buildSprueHandles(definitions);
    for (const QJsonValue& r : lifecycle.value("rebuilt").toArray()) {
      const QJsonObject o = r.toObject();
      const int index = indexOf(handles, o.value("name").toString());
      QVERIFY(index >= 0);
      QVERIFY(approx(handles[static_cast<std::size_t>(index)].radiusMm, o.value("radius").toDouble()));
    }
  }

  void presentationFollowsTheReferencePrecedence() {
    const QJsonObject fixture = loadFixture();
    int cases = 0;
    for (const QJsonValue& value : fixture.value("selectorCases").toArray()) {
      const QJsonObject c = value.toObject();
      const QString name = c.value("name").toString();
      std::vector<SprueOperationDefinition> intents;
      for (const QJsonValue& d : c.value("definitions").toArray()) {
        const QJsonObject o = d.toObject();
        SprueOperationDefinition intent;
        intent.operationId = o.value("operationId").toString().toStdString();
        intent.position = point(o.value("anchor").toObject().value("position"));
        intent.inwardDirection = point(o.value("inwardDirection"));
        intent.profileDesign.profile = profileOf(o.value("profileDesign").toObject().value("profile"));
        intent.validation.status = o.value("validation").toObject().value("status").toString().toStdString();
        intents.push_back(intent);
      }
      std::vector<SprueDefinition> resolved;
      for (const QJsonValue& s : c.value("sprues").toArray()) {
        const QJsonObject o = s.toObject();
        SprueDefinition r;
        r.operationId = o.value("operationId").toString().toStdString();
        r.position = point(o.value("position"));
        r.inwardDirection = point(o.value("inwardDirection"));
        r.profile = profileOf(o.value("profile"));
        r.depthMm = o.value("depthMm").toDouble();
        for (const QJsonValue& id : o.value("targetBodyIds").toArray()) r.targetBodyIds.push_back(id.toString().toStdString());
        resolved.push_back(r);
      }
      const auto presented = presentSprues(intents, resolved);
      const QJsonArray expected = c.value("presentation").toArray();
      QVERIFY2(presented.size() == static_cast<std::size_t>(expected.size()), qPrintable(name));
      for (int i = 0; i < expected.size(); ++i) {
        const SpruePresentation expectedPresentation = presentationOf(expected.at(i).toObject());
        const SpruePresentation& p = presented[static_cast<std::size_t>(i)];
        const QString where = name + "/" + QString::fromStdString(p.operationId);
        QCOMPARE(p.operationId, expectedPresentation.operationId);
        QCOMPARE(p.status, expectedPresentation.status);
        QVERIFY2(approx(p.position.x, expectedPresentation.position.x) && approx(p.position.y, expectedPresentation.position.y) && approx(p.position.z, expectedPresentation.position.z), qPrintable(where + " position"));
        QVERIFY2(p.profile == expectedPresentation.profile, qPrintable(where + " profile"));
        QCOMPARE(p.depthMm.has_value(), expectedPresentation.depthMm.has_value());
        if (p.depthMm) QVERIFY(approx(*p.depthMm, *expectedPresentation.depthMm));
        QCOMPARE(p.targetBodyIds.has_value(), expectedPresentation.targetBodyIds.has_value());
        if (p.targetBodyIds) QVERIFY(*p.targetBodyIds == *expectedPresentation.targetBodyIds);
      }
      ++cases;
    }
    QCOMPARE(cases, 6);
  }

  // --- properties written from the reference source (not observable through the fixture) ------------------------

  void rampingTheMainDiameterBelowTheNeckClampsToTheNeck() {
    SprueHandle top;
    top.opening = SprueHandleOpening::Top;
    top.mainDiameterMm = 6;
    top.entryNeckDiameterMm = 4;
    QCOMPARE(top.minimumDiameterMm(), 4.0);
    QCOMPARE(top.maximumDiameterMm(), kMaxSprueDiameterMm);
    QCOMPARE(*normalizeHandleDiameter(top, 1.0), 4.0);
    SprueHandle bottom = top;
    bottom.opening = SprueHandleOpening::Bottom;
    QCOMPARE(bottom.minimumDiameterMm(), kMinSprueDiameterMm);
    QCOMPARE(bottom.maximumDiameterMm(), 6.0);
    QCOMPARE(*normalizeHandleDiameter(bottom, 20.0), 6.0);
    // Warning colour exactly at either limit.
    QVERIFY(diameterLabelWarns(top, 4.0));
    QVERIFY(diameterLabelWarns(top, 50.0));
    QVERIFY(!diameterLabelWarns(top, 4.25));
  }

  void halfwaySnapGoesUpLikeMathRound() {
    // Math.round sends halves up; a drag that lands exactly between two 0.25 mm steps must agree with the reference.
    SprueHandle h;
    h.opening = SprueHandleOpening::Top;
    h.mainDiameterMm = 10;
    h.entryNeckDiameterMm = 2;
    const auto d = dragDiameter(h, -47.5, 0, false);  // raw = 10 - 2.375 = 7.625: halfway between 7.5 and 7.75
    QVERIFY(d.has_value());
    QCOMPARE(*d, 7.75);
    QCOMPARE(*dragDiameter(h, -47.5, 0, true), 7.625);  // Shift: no snapping
  }

  void theLabelUsesTheDiameterSignAndTwoDecimals() {
    QCOMPARE(diameterLabel(7), std::string("\xC3\x98 7.00 mm"));
    QCOMPARE(diameterLabel(3.2), std::string("\xC3\x98 3.20 mm"));
    QCOMPARE(diameterLabel(50), std::string("\xC3\x98 50.00 mm"));
  }

  void thePickRingIsFrontFaceOnly() {
    // A ray that starts inside the tube only sees the tube's back faces ahead of it, which the reference's FrontSide
    // pick mesh ignores.
    SprueHandle h;
    h.operationId = "s";
    h.opening = SprueHandleOpening::Top;
    h.position = {0, 0, 0};
    h.radiusMm = 5;
    h.mainDiameterMm = 10;
    h.entryNeckDiameterMm = 4;
    const std::vector<SprueHandle> handles{h};
    // From above the ring plane straight down onto the tube at (5, 0, 0): a front-face hit.
    QVERIFY(pickSprueHandle(Ray{{5, 0, 10}, {0, 0, -1}}, handles).has_value());
    // The same line starting at the middle of the tube, inside it.
    QVERIFY(!pickSprueHandle(Ray{{5, 0, 0}, {0, 0, -1}}, handles).has_value());
    // Through the hole of the ring and out the other side: nothing.
    QVERIFY(!pickSprueHandle(Ray{{0, 0, 10}, {0, 0, -1}}, handles).has_value());
  }

  void torusMatchesThreeJsLayout() {
    const IndexedSurface s = torusSurface(2.5, 0.12);
    QCOMPARE(s.positions.size(), std::size_t{(8 + 1) * (32 + 1) * 3});
    QCOMPARE(s.indices.size(), std::size_t{8 * 32 * 6});
    // Vertex 0: u = 0, v = 0 -> (radius + tube, 0, 0).
    QVERIFY(approx(s.positions[0], 2.62, 1e-6));
    QCOMPARE(s.positions[1], 0.0);
    QCOMPARE(s.positions[2], 0.0);
    // First triangle of three.js: (a, b, d) = (stride + 0, 0, stride + 1).
    QCOMPARE(s.indices[0], std::uint32_t{33});
    QCOMPARE(s.indices[1], std::uint32_t{0});
    QCOMPARE(s.indices[2], std::uint32_t{34});
  }
};

QTEST_APPLESS_MAIN(SprueGizmoEquivalenceTest)
#include "tst_sprue_gizmo_equivalence.moc"
