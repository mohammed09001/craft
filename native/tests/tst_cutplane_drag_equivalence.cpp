// The Cut by Face right-button plane drag compared with the REAL reference runtime
// (cuttingPlane3dRuntime.ts under Three.js and jsdom, real DOM pointer events) through
// native/tests/fixtures/reference/cutplane-drag-reference.json: for five cameras (two of them looking along a plane's axis)
// and every enabled plane, a drag recorded event by event with the plane's coordinate after each one; the ways a drag ends
// (release, cancel, the planes being replaced, the Eraser coming on) and what does not start one; and the split-face store's
// commitPlaneDrag (clamping, the 1e-9 no-change rule).

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>
#include <optional>

#include "mold/CuttingPlaneDrag.h"
#include "mold/CuttingPlaneSlabs.h"
#include "mold/ReferenceMold.h"

using namespace craft;

namespace {

QJsonObject loadFixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/cutplane-drag-reference.json"));
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

QStringList callsOf(const QJsonObject& after) {
  QStringList calls;
  for (const QJsonValue& c : after.value("calls").toArray()) calls << c.toObject().value("call").toString();
  return calls;
}

}  // namespace

class CutPlaneDragEquivalenceTest : public QObject {
  Q_OBJECT

 private slots:
  void everyRecordedDragFollowsTheReferenceStepByStep() {
    const QJsonObject fixture = loadFixture();
    QVERIFY2(!fixture.isEmpty(), "cutplane-drag-reference.json is missing; run scripts/native/generate-reference-fixtures.ps1 -Only cutplane");
    const Bounds3 k1 = boundsOf(fixture.value("k1")), k2 = boundsOf(fixture.value("k2"));
    const auto slabs = buildPlaneSlabs(k1, k2, planesOf(fixture.value("records").toArray()));
    const QJsonArray drags = fixture.value("drags").toArray();
    QVERIFY(drags.size() >= 40);

    int moves = 0, commits = 0, cancels = 0, clamped = 0, degenerate = 0, starts = 0, declined = 0;
    for (const QJsonValue& value : drags) {
      const QJsonObject scenario = value.toObject();
      const QString name = scenario.value("name").toString();
      const QString planeFace = faceOfPlaneId(scenario.value("planeId").toString());
      PlaneSlab slabState;
      bool found = false;
      for (const PlaneSlab& s : slabs)
        if (QString::fromLatin1(faceIdName(s.face)) == planeFace) { slabState = s; found = true; }
      QVERIFY2(found, qPrintable(name));
      const PlaneSlab* slab = &slabState;
      const Vec3 view = vec(scenario.value("camera").toObject().value("view"));
      const Vec3 up = vec(scenario.value("camera").toObject().value("up"));
      double startCoordinate = scenario.value("startCoordinate").toDouble();
      QVERIFY2(approx(slab->coordinate, startCoordinate), qPrintable(name + ": the slab is where the reference's is"));

      std::optional<CutPlaneDrag> drag;
      bool erasing = false;
      for (const QJsonValue& stepValue : scenario.value("steps").toArray()) {
        const QJsonObject entry = stepValue.toObject();
        const QJsonObject step = entry.value("step").toObject();
        const QJsonObject after = entry.value("after").toObject();
        const QString type = step.value("type").toString();
        const QStringList calls = callsOf(after);
        const QString where = name + " / " + type;
        const int button = step.value("button").toInt(0);
        const bool primary = step.value("isPrimary").toBool(true);
        const int pointerId = step.value("pointerId").toInt(1);
        std::optional<Ray> ray;
        if (!entry.value("ray").isNull()) {
          const QJsonObject r = entry.value("ray").toObject();
          ray = Ray{vec(r.value("origin")), vec(r.value("direction")).normalized()};
        }

        if (type == QLatin1String("applyCommit")) {
          // The host stores the committed position and the planes are rebuilt there: the next drag starts from it.
          QVERIFY2(!drag, qPrintable(where));
          slabState.coordinate = normalizedToWorldCoordinate(k1, slabState.axis, entry.value("record").toDouble());
          startCoordinate = slabState.coordinate;
        } else if (type == QLatin1String("eraser")) {
          erasing = step.value("active").toBool();
          if (erasing && drag) {  // the Eraser coming on cancels a drag in progress
            drag.reset();
            QVERIFY2(calls == QStringList{QStringLiteral("cancel")}, qPrintable(where));
            ++cancels;
          }
        } else if (type == QLatin1String("down")) {
          const auto pick = pickPlaneSlab(*ray, slabs);
          if (calls.contains(QStringLiteral("start"))) {
            QVERIFY2(button == 2 && primary && !erasing, qPrintable(where + ": only a primary secondary-button press starts"));
            QVERIFY2(pick && slabs[static_cast<std::size_t>(pick->slab)].face == slab->face, qPrintable(where + ": the press is on the plane"));
            drag = beginCutPlaneDrag(*slab, *ray, view, up, step.value("x").toDouble(), step.value("y").toDouble());
            QVERIFY2(drag.has_value(), qPrintable(where + ": the reference plane is met"));
            ++starts;
            if (lengthOf(drag->planeNormal) == 0.0) ++degenerate;
          } else if (button == 2 && primary && !erasing) {
            // Declined: either the press is not on the plane, or its ray never meets the reference drag plane.
            const bool onPlane = pick && slabs[static_cast<std::size_t>(pick->slab)].face == slab->face;
            QVERIFY2(!onPlane || !beginCutPlaneDrag(*slab, *ray, view, up, step.value("x").toDouble(), step.value("y").toDouble()).has_value(),
                     qPrintable(where + ": the reference found nothing to drag here"));
            if (onPlane) ++declined;
          }
        } else if (type == QLatin1String("move")) {
          if (drag && pointerId == 1) {
            if (updateCutPlaneDrag(*drag, *ray, step.value("x").toDouble(), step.value("y").toDouble(), k1)) ++moves;
          }
        } else if (type == QLatin1String("up")) {
          if (drag && pointerId == 1) {
            const CutPlaneDragEnd end = finishCutPlaneDrag(*drag, k1);
            if (end.commit) {
              QVERIFY2(calls == QStringList{QStringLiteral("commit")}, qPrintable(where + ": the reference commits"));
              const QJsonArray all = after.value("calls").toArray();
              QVERIFY2(approx(end.normalized, all.at(0).toObject().value("normalized").toDouble()), qPrintable(where + ": the committed position"));
              ++commits;
            } else {
              QVERIFY2(calls == QStringList{QStringLiteral("cancel")}, qPrintable(where + ": the reference cancels"));
              drag->coordinate = drag->startCoordinate;
              ++cancels;
            }
            const double keep = drag->coordinate;
            drag.reset();
            QVERIFY2(approx(keep, after.value("coordinate").toDouble()), qPrintable(where + ": the plane's coordinate after release"));
            continue;
          }
        } else if (type == QLatin1String("pointercancel") || type == QLatin1String("lostpointercapture") || type == QLatin1String("setPlanes")) {
          if (drag) {
            QVERIFY2(calls == QStringList{QStringLiteral("cancel")}, qPrintable(where));
            drag.reset();
            ++cancels;
          }
          continue;
        }

        // Where the plane is after the step: the drag's coordinate while dragging, else where it started.
        const double expected = after.value("coordinate").toDouble();
        const double actual = drag ? drag->coordinate : startCoordinate;
        QVERIFY2(approx(actual, expected, 1e-9), qPrintable(QStringLiteral("%1: coordinate %2, the reference has %3").arg(where).arg(actual).arg(expected)));
        // the limit is K1's face inset by the safe interval (a micrometre or less), not the face itself
        if (drag && drag->moved && (approx(actual, k1.min[static_cast<int>(drag->axis)], 1e-4) || approx(actual, k1.max[static_cast<int>(drag->axis)], 1e-4))) ++clamped;
      }
      QVERIFY2(!drag, qPrintable(name + ": every drag ended"));
    }
    const QString counts = QStringLiteral("starts %1 moves %2 commits %3 cancels %4 clamped %5 degenerate %6 declined %7").arg(starts).arg(moves).arg(commits).arg(cancels).arg(clamped).arg(degenerate).arg(declined);
    QVERIFY2(starts >= 35, qPrintable(counts));
    QVERIFY2(moves >= 90, qPrintable(counts));
    QVERIFY2(commits >= 15, qPrintable(counts));
    QVERIFY2(cancels >= 15, qPrintable(counts));
    QVERIFY2(clamped >= 10, qPrintable("drags that ran into the part box limits were compared: " + counts));
    QVERIFY2(degenerate >= 1, qPrintable("a drag whose reference plane has no normal was compared: " + counts));
  }

  void theDragPlaneDegeneratesLikeTheReferencesWhenLookingAlongTheAxis() {
    // Looking straight down a z plane the reference drag plane has no normal and the plane does not move.
    const QJsonObject fixture = loadFixture();
    int checked = 0;
    for (const QJsonValue& value : fixture.value("drags").toArray()) {
      const QJsonObject scenario = value.toObject();
      if (scenario.value("name").toString() != QLatin1String("topDown:cutting-plane:top:drag")) continue;
      for (const QJsonValue& s : scenario.value("steps").toArray())
        QVERIFY(approx(s.toObject().value("after").toObject().value("coordinate").toDouble(), scenario.value("startCoordinate").toDouble()));
      ++checked;
    }
    QCOMPARE(checked, 1);
  }

  void gatingMatchesTheReference() {
    // The scenarios that must not start a drag started none.
    const QSet<QString> mustNotStart{QStringLiteral("primary-button-does-not-drag"), QStringLiteral("middle-button-does-not-drag"),
                                     QStringLiteral("non-primary-pointer-does-not-drag"), QStringLiteral("empty-space-does-not-drag"),
                                     QStringLiteral("eraser-active-does-not-drag"), QStringLiteral("hover-without-drag")};
    int seen = 0;
    for (const QJsonValue& value : loadFixture().value("drags").toArray()) {
      const QJsonObject scenario = value.toObject();
      if (!mustNotStart.contains(scenario.value("name").toString())) continue;
      for (const QJsonValue& s : scenario.value("steps").toArray()) QVERIFY(callsOf(s.toObject().value("after").toObject()).isEmpty());
      ++seen;
    }
    QCOMPARE(seen, mustNotStart.size());
  }

  void commitFollowsTheStore() {
    const QJsonObject fixture = loadFixture();
    int moved = 0, unchanged = 0;
    for (const QJsonValue& value : fixture.value("commits").toArray()) {
      const QJsonObject c = value.toObject();
      const QString name = c.value("name").toString();
      const Bounds3 k1 = boundsOf(c.value("bounds"));
      const Axis axis = c.value("axis").toString() == QLatin1String("x") ? Axis::X : c.value("axis").toString() == QLatin1String("y") ? Axis::Y : Axis::Z;
      const double before = c.value("positionBefore").toDouble();
      QVERIFY2(approx(clampNormalizedPosition(c.value("value").toDouble(), k1, axis), c.value("clampedValue").toDouble(), 1e-15), qPrintable(name + ": the clamp"));
      const auto next = commitCutPlanePosition(k1, axis, before, c.value("value").toDouble());
      QCOMPARE(next.has_value(), c.value("undoDepthDelta").toInt() == 1);  // a commit that changes nothing records nothing
      QVERIFY2(approx(next.value_or(before), c.value("positionAfter").toDouble(), 1e-15), qPrintable(name + ": the position after"));
      if (next) {
        ++moved;
        QVERIFY2(approx(normalizedToWorldCoordinate(k1, axis, *next), c.value("worldCoordinateAfter").toDouble()), qPrintable(name + ": world coordinate"));
        QVERIFY(c.value("definitionNull").toBool());  // the mold built with the old position is dropped
      } else {
        ++unchanged;
      }
      QCOMPARE(c.value("duringDrag").toObject().value("workflow").toString(), QStringLiteral("draggingPlane"));
    }
    QVERIFY(moved >= 6);
    QVERIFY(unchanged >= 3);
    const QJsonObject undo = fixture.value("undo").toObject();
    QCOMPARE(undo.value("afterUndo").toDouble(), fixture.value("commits").toArray().at(0).toObject().value("positionBefore").toDouble());
    const QJsonObject cancel = fixture.value("cancel").toObject();
    QCOMPARE(cancel.value("after").toObject().value("undo").toInt(), cancel.value("before").toObject().value("undo").toInt());  // a cancelled drag is no undo step
  }

  void theLooksAndTheThresholdAreTheReferences() {
    const QJsonObject fixture = loadFixture();
    QCOMPARE(kCutPlaneDragThresholdPx, fixture.value("thresholdPx").toDouble());
    const QJsonObject colors = fixture.value("colors").toObject();
    QCOMPARE(kCutPlaneIdleRgb, static_cast<unsigned>(colors.value("idle").toInt()));
    QCOMPARE(kCutPlaneHoverRgb, static_cast<unsigned>(colors.value("hover").toInt()));
    QCOMPARE(kCutPlaneDraggingRgb, static_cast<unsigned>(colors.value("dragging").toInt()));
    // Idle, hovered and dragged looks as the reference's runtime sets them, read back from the recorded steps.
    int idle = 0, hover = 0, dragging = 0;
    for (const QJsonValue& value : fixture.value("drags").toArray()) {
      for (const QJsonValue& s : value.toObject().value("steps").toArray()) {
        const QJsonObject a = s.toObject().value("after").toObject(), look = a.value("look").toObject();
        const unsigned color = static_cast<unsigned>(look.value("colorHex").toInt());
        const double opacity = look.value("opacity").toDouble(), edgeOpacity = look.value("edgeOpacity").toDouble();
        QCOMPARE(static_cast<unsigned>(look.value("edgeColorHex").toInt()), color);
        if (color == kCutPlaneIdleRgb) { QCOMPARE(cutPlaneSurfaceOpacity(CutPlaneVisual::Idle), opacity); QCOMPARE(cutPlaneEdgeOpacity(CutPlaneVisual::Idle), edgeOpacity); ++idle; }
        else if (color == kCutPlaneHoverRgb) { QCOMPARE(cutPlaneSurfaceOpacity(CutPlaneVisual::Hover), opacity); QCOMPARE(cutPlaneEdgeOpacity(CutPlaneVisual::Hover), edgeOpacity); ++hover; }
        else if (color == kCutPlaneDraggingRgb) { QCOMPARE(cutPlaneSurfaceOpacity(CutPlaneVisual::Dragging), opacity); QCOMPARE(cutPlaneEdgeOpacity(CutPlaneVisual::Dragging), edgeOpacity); ++dragging; }
      }
    }
    QVERIFY(idle > 0 && hover > 0 && dragging > 0);
  }

 private:
  static double lengthOf(const Vec3& v) { return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
};

QTEST_APPLESS_MAIN(CutPlaneDragEquivalenceTest)
#include "tst_cutplane_drag_equivalence.moc"
