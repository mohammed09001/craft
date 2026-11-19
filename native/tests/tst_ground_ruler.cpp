// The ground-plane ruler against the reference's own modules (ruler-reference.json, generated from the real code by
// craftRulerReference.test.ts): the label step with its hysteresis, the tick and label layout, the label text, the pixel
// projection, and the geometry the runtime builds along a zoom sequence (including when it rebuilds).
#include <QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

#include "view/GroundPlaneRuler.h"

using namespace craft;

namespace {

QJsonObject fixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/ruler-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

double number(const QJsonValue& v) { return v.isString() ? std::nan("") : v.toDouble(); }

bool near(double a, double b, double relative = 1e-9) {
  return std::fabs(a - b) <= relative * std::max({1.0, std::fabs(a), std::fabs(b)});
}

// The reference's camera: up Z, 45 degrees, looking at `target` from `distance` along `direction`.
ViewPose poseFrom(double distance, const std::array<double, 3>& direction, const Vec3& target = {0, 0, 0}) {
  const Vec3 d = Vec3{direction[0], direction[1], direction[2]}.normalized();
  ViewPose pose;
  pose.setLookAt(target + d * distance, target);
  return pose;
}

}  // namespace

class GroundRulerTest : public QObject {
  Q_OBJECT
 private slots:
  void layoutMatchesTheReference() {
    const QJsonArray layouts = fixture().value("layouts").toArray();
    QVERIFY(layouts.size() >= 10);
    for (const QJsonValue& value : layouts) {
      const QJsonObject l = value.toObject();
      const RulerLayout layout = l.value("minorDivisions").isNull()
                                     ? computeGroundPlaneRulerLayout(l.value("halfExtent").toDouble(), l.value("step").toDouble())
                                     : computeGroundPlaneRulerLayout(l.value("halfExtent").toDouble(), l.value("step").toDouble(),
                                                                     l.value("minorDivisions").toInt());
      const QString name = QStringLiteral("half %1 step %2").arg(l.value("halfExtent").toDouble()).arg(l.value("step").toDouble());
      const QJsonArray ticks = l.value("ticks").toArray(), labels = l.value("labels").toArray();
      QVERIFY2(layout.ticks.size() == static_cast<std::size_t>(ticks.size()), qPrintable(name + ": tick count"));
      QVERIFY2(layout.labels.size() == static_cast<std::size_t>(labels.size()), qPrintable(name + ": label count"));
      for (int i = 0; i < ticks.size(); ++i) {
        QVERIFY2(near(layout.ticks[static_cast<std::size_t>(i)].position, ticks.at(i).toArray().at(0).toDouble()), qPrintable(name));
        QCOMPARE(layout.ticks[static_cast<std::size_t>(i)].major, ticks.at(i).toArray().at(1).toBool());
      }
      for (int i = 0; i < labels.size(); ++i) {
        QVERIFY2(near(layout.labels[static_cast<std::size_t>(i)].value, labels.at(i).toArray().at(0).toDouble()), qPrintable(name));
        QVERIFY2(near(layout.labels[static_cast<std::size_t>(i)].position, labels.at(i).toArray().at(1).toDouble()), qPrintable(name));
      }
    }
  }

  void labelTextMatchesStringOfMathRound() {
    const QJsonArray formats = fixture().value("formats").toArray();
    QVERIFY(formats.size() >= 15);
    for (const QJsonValue& value : formats) {
      const QJsonObject f = value.toObject();
      const double v = f.value("value").isString() ? -0.0 : f.value("value").toDouble();  // "-0" is negative zero
      QCOMPARE(QString::fromStdString(formatRulerLabel(v)), f.value("text").toString());
    }
  }

  void stepSelectionMatchesIncludingHysteresis() {
    const QJsonArray selections = fixture().value("selections").toArray();
    QVERIFY(selections.size() >= 150);
    int kept = 0;
    for (const QJsonValue& value : selections) {
      const QJsonObject s = value.toObject();
      RulerStepSelection in;
      in.pixelsPerWorldUnit = s.value("pixelsPerWorldUnit").toDouble();
      in.minStep = s.value("minStep").toDouble();
      in.maxStep = s.value("maxStep").toDouble();
      if (!s.value("currentStep").isNull()) in.currentStep = s.value("currentStep").toDouble();
      const std::optional<double> step = selectRulerLabelStep(in);
      const QString where = QStringLiteral("ppu %1 [%2..%3] current %4").arg(in.pixelsPerWorldUnit).arg(in.minStep).arg(in.maxStep)
                                .arg(in.currentStep ? QString::number(*in.currentStep) : QStringLiteral("none"));
      if (s.value("step").isNull()) {
        QVERIFY2(!step, qPrintable(where));
      } else {
        QVERIFY2(step && near(*step, s.value("step").toDouble()), qPrintable(where + QStringLiteral(": native %1, reference %2").arg(step ? *step : -1).arg(s.value("step").toDouble())));
        if (in.currentStep && *step == *in.currentStep) ++kept;
      }
    }
    QVERIFY2(kept > 10, "the fixture must contain steps kept by the hysteresis");
  }

  void invalidSelectionsAreRefusedLikeTheReference() {
    for (const QJsonValue& value : fixture().value("invalidSelections").toArray()) {
      const QJsonObject s = value.toObject();
      RulerStepSelection in;
      in.pixelsPerWorldUnit = number(s.value("pixelsPerWorldUnit"));
      in.minStep = s.value("minStep").toDouble();
      in.maxStep = s.value("maxStep").toDouble();
      if (s.contains("minLabelPixels")) in.minLabelPixels = s.value("minLabelPixels").toDouble();
      if (s.contains("maxLabelPixels")) in.maxLabelPixels = s.value("maxLabelPixels").toDouble();
      QCOMPARE(selectRulerLabelStep(in).has_value(), !s.value("step").isNull());
    }
  }

  void projectionMatchesThreeJs() {
    const QJsonArray projections = fixture().value("projections").toArray();
    QVERIFY(projections.size() >= 6);
    for (const QJsonValue& value : projections) {
      const QJsonObject p = value.toObject();
      const QJsonArray dir = p.value("direction").toArray();
      const ViewPose pose = poseFrom(p.value("distance").toDouble(), {dir.at(0).toDouble(), dir.at(1).toDouble(), dir.at(2).toDouble()});
      const double aspect = p.value("aspect").toDouble(), height = p.value("height").toDouble();
      // Looking exactly along the up axis, three.js' lookAt nudges the view direction by 0.0001 to get a horizontal reference;
      // native computes the exact value, so that one case agrees to about a millionth.
      const double tolerance = (dir.at(0).toDouble() == 0 && dir.at(1).toDouble() == 0) ? 2e-6 : 1e-9;
      const auto alongX = projectWorldLengthToPixels(pose, aspect, {0, 0, 0}, {1, 0, 0}, 1, height);
      const auto alongY = projectWorldLengthToPixels(pose, aspect, {0, 0, 0}, {0, 1, 0}, 10, height);
      QVERIFY(alongX && alongY);
      QVERIFY2(near(*alongX, p.value("pixels").toDouble(), tolerance), qPrintable(QStringLiteral("distance %3 aspect %4: %1 vs %2").arg(*alongX, 0, 'g', 15).arg(p.value("pixels").toDouble(), 0, 'g', 15).arg(p.value("distance").toDouble()).arg(p.value("aspect").toDouble())));
      QVERIFY2(near(*alongY, p.value("pixelsAlongY").toDouble(), tolerance), qPrintable(QStringLiteral("%1 vs %2").arg(*alongY).arg(p.value("pixelsAlongY").toDouble())));
    }
    // Unusable input.
    const ViewPose pose = poseFrom(100, {1, -1, 0.78});
    QVERIFY(!projectWorldLengthToPixels(pose, 1.5, {0, 0, 0}, {1, 0, 0}, 0, 640));
    QVERIFY(!projectWorldLengthToPixels(pose, 1.5, {0, 0, 0}, {1, 0, 0}, 1, 0));
    QVERIFY(!projectWorldLengthToPixels(pose, 0, {0, 0, 0}, {1, 0, 0}, 1, 640));
  }

  void theRuntimeBuildsTheSameGeometryAlongAZoomAndRebuildsAtTheSameMoments() {
    const QJsonObject runtime = fixture().value("runtime").toObject();
    struct Case { const char* key; double size, minor; };
    int rebuiltCount = 0, keptCount = 0;
    for (const Case& c : {Case{"darkGrid220", 220, 10}, Case{"smallPartGrid", 60, 2}, Case{"lightGrid220", 220, 10}}) {
      GroundPlaneRuler ruler;
      ruler.setGrid(c.size, c.minor);
      for (const QJsonValue& value : runtime.value(c.key).toArray()) {
        const QJsonObject step = value.toObject();
        const double distance = step.value("distance").toDouble();
        const ViewPose pose = poseFrom(distance, {1, -1, 0.78});
        const bool rebuilt = ruler.update(pose, 1.5, 640);
        const QString where = QStringLiteral("%1 at distance %2").arg(QLatin1String(c.key)).arg(distance);
        QCOMPARE(rebuilt, step.value("rebuilt").toBool());
        rebuilt ? ++rebuiltCount : ++keptCount;
        const RulerGeometry& g = ruler.geometry();
        // The geometry holds the scale of the last rebuild; the fixture's field is the current camera's, so compare on rebuilds.
        if (rebuilt)
          QVERIFY2(near(g.pixelsPerWorldUnit, step.value("pixelsPerWorldUnit").toDouble(), 1e-9), qPrintable(where + QStringLiteral(": pixels per unit %1 vs %2").arg(g.pixelsPerWorldUnit, 0, 'g', 15).arg(step.value("pixelsPerWorldUnit").toDouble(), 0, 'g', 15)));

        const auto compareLines = [&](const std::vector<float>& native, const QJsonArray& reference, const char* what) {
          QVERIFY2(native.size() == static_cast<std::size_t>(reference.size()), qPrintable(where + QStringLiteral(": %1 vertex count %2 vs %3").arg(QLatin1String(what)).arg(native.size()).arg(reference.size())));
          for (int i = 0; i < reference.size(); ++i)
            QVERIFY2(near(native[static_cast<std::size_t>(i)], reference.at(i).toDouble(), 1e-6), qPrintable(where + QStringLiteral(": %1[%2] %3 vs %4").arg(QLatin1String(what)).arg(i).arg(native[static_cast<std::size_t>(i)]).arg(reference.at(i).toDouble())));
        };
        compareLines(g.axes, step.value("axes").toObject().value("vertices").toArray(), "axes");
        compareLines(g.ticks, step.value("ticks").toObject().value("vertices").toArray(), "ticks");
        const QJsonArray labels = step.value("labels").toArray();
        QVERIFY2(g.labels.size() == static_cast<std::size_t>(labels.size()), qPrintable(where + ": label count"));
        for (int i = 0; i < labels.size(); ++i) {
          const QJsonObject l = labels.at(i).toObject();
          const RulerLabel& n = g.labels[static_cast<std::size_t>(i)];
          QVERIFY2(near(n.x, l.value("x").toDouble()) && near(n.y, l.value("y").toDouble()), qPrintable(where + QStringLiteral(": label %1 position").arg(i)));
          QVERIFY2(near(n.height, l.value("height").toDouble()), qPrintable(where + QStringLiteral(": label %1 height").arg(i)));
          QCOMPARE(l.value("z").toDouble(), kRulerLabelZ);
        }
      }
    }
    QVERIFY(rebuiltCount > 8);
    QVERIFY2(keptCount > 8, "the sequence must include frames where the hysteresis keeps the step");
  }

  void materialsAndColoursOfTheReference() {
    const QJsonObject runtime = fixture().value("runtime").toObject();
    const QJsonObject dark = runtime.value("darkGrid220").toArray().at(0).toObject();
    const QJsonObject light = runtime.value("lightGrid220").toArray().at(0).toObject();
    QCOMPARE(dark.value("axes").toObject().value("material").toObject().value("opacity").toDouble(), kRulerAxisOpacity);
    QCOMPARE(dark.value("ticks").toObject().value("material").toObject().value("opacity").toDouble(), kRulerTickOpacity);
    QVERIFY(dark.value("labels").toArray().at(0).toObject().value("depthTest").toBool());
    QVERIFY(!dark.value("labels").toArray().at(0).toObject().value("depthWrite").toBool());
    // Axes take the palette's major grid colour, ticks the (unparseable, hence white) minor one; labels yellow or blue.
    QCOMPARE(dark.value("axes").toObject().value("material").toObject().value("colorHex").toInt(), 0x303943);
    QCOMPARE(light.value("axes").toObject().value("material").toObject().value("colorHex").toInt(), 0xb7c3cf);
    QCOMPARE(dark.value("ticks").toObject().value("material").toObject().value("colorHex").toInt(), 0xffffff);
    QCOMPARE(dark.value("labels").toArray().at(0).toObject().value("colorHex").toInt(), 0xfbbf24);
    QCOMPARE(light.value("labels").toArray().at(0).toObject().value("colorHex").toInt(), 0x1d4ed8);
  }

  void aChangedGridRebuildsEvenAtTheSameStep() {
    GroundPlaneRuler ruler;
    ruler.setGrid(220, 10);
    const ViewPose pose = poseFrom(120, {1, -1, 0.78});
    QVERIFY(ruler.update(pose, 1.5, 640));
    QVERIFY(!ruler.update(pose, 1.5, 640));   // nothing changed
    ruler.setGrid(220, 10);                   // the reference marks the ruler dirty on every setGridConfig
    QVERIFY(ruler.update(pose, 1.5, 640));
    // An unusable viewport falls back to 600 px high, as the reference does.
    GroundPlaneRuler other;
    other.setGrid(220, 10);
    QVERIFY(other.update(pose, 1.5, 0));
  }
};

QTEST_MAIN(GroundRulerTest)
#include "tst_ground_ruler.moc"
