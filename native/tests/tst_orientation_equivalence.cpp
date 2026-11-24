// Part orientation against the reference's own modules (orientation-reference.json, generated from the real code by
// craftOrientationReference.test.ts): the Flip composition, the six automatic-orientation candidates with their scores and
// bounds, the selection rule, and the geometry that applyPartOrientation produces.
#include <QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

#include "model/ModelGrounding.h"
#include "model/PartOrientation.h"

using namespace craft;

namespace {

QJsonObject fixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/orientation-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

Quaternion quat(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {o.value("x").toDouble(), o.value("y").toDouble(), o.value("z").toDouble(), o.value("w").toDouble()};
}

bool near(double a, double b, double relative = 1e-9) { return std::fabs(a - b) <= relative * std::max({1.0, std::fabs(a), std::fabs(b)}); }

bool quatNear(const Quaternion& a, const Quaternion& b, double tolerance) {
  return std::fabs(a.x - b.x) <= tolerance && std::fabs(a.y - b.y) <= tolerance && std::fabs(a.z - b.z) <= tolerance && std::fabs(a.w - b.w) <= tolerance;
}

TriangleSoup soupOf(const QJsonArray& positions) {
  TriangleSoup s;
  s.positions.reserve(static_cast<std::size_t>(positions.size()));
  for (const QJsonValue& v : positions) s.positions.push_back(static_cast<float>(v.toDouble()));
  return s;
}

std::map<QString, TriangleSoup> meshes() {
  std::map<QString, TriangleSoup> out;
  for (const QJsonValue& v : fixture().value("meshes").toArray()) out[v.toObject().value("name").toString()] = soupOf(v.toObject().value("positions").toArray());
  return out;
}

Bounds3 boundsOf(const QJsonObject& o) {
  const QJsonArray lo = o.value("min").toArray(), hi = o.value("max").toArray();
  return {{lo[0].toDouble(), lo[1].toDouble(), lo[2].toDouble()}, {hi[0].toDouble(), hi[1].toDouble(), hi[2].toDouble()}};
}

}  // namespace

class OrientationEquivalenceTest : public QObject {
  Q_OBJECT
 private slots:
  void fixtureIsPresent() {
    QVERIFY(!fixture().isEmpty());
    QVERIFY(meshes().size() >= 9);
  }

  void flipStepsFromIdentityAreExact() {
    const QJsonObject single = fixture().value("flipSingle").toObject();
    QCOMPARE(single.size(), 5);
    for (const QString& name : single.keys()) {
      const auto direction = parseFlipDirection(name.toStdString());
      QVERIFY2(direction.has_value(), qPrintable(name));
      QCOMPARE(composePartFlip(kIdentityOrientation, *direction), quat(single.value(name)));
    }
    QVERIFY(!parseFlipDirection("sideways").has_value());
  }

  void flipSequencesMatchStepByStep() {
    int steps = 0, exact = 0;
    for (const QJsonValue& value : fixture().value("flipSequences").toArray()) {
      const QJsonObject seq = value.toObject();
      const QJsonArray directions = seq.value("directions").toArray(), results = seq.value("results").toArray();
      QCOMPARE(directions.size(), results.size());
      Quaternion q = kIdentityOrientation;
      for (int i = 0; i < directions.size(); ++i) {
        q = composePartFlip(q, *parseFlipDirection(directions[i].toString().toStdString()));
        const Quaternion expected = quat(results[i]);
        QVERIFY2(quatNear(q, expected, 1e-12), qPrintable(QStringLiteral("step %1").arg(i)));
        ++steps;
        if (q == expected) ++exact;
      }
    }
    QCOMPARE(steps, 480);
    QCOMPARE(exact, steps);  // snapping makes the axis-aligned orientations bit-exact
  }

  void flipFromAHandCommittedOrientation() {
    for (const QJsonValue& value : fixture().value("fromOdd").toArray()) {
      const QJsonObject row = value.toObject();
      const Quaternion result = composePartFlip(quat(row.value("start")), *parseFlipDirection(row.value("direction").toString().toStdString()));
      QVERIFY(quatNear(result, quat(row.value("result")), 1e-12));
    }
  }

  void flipFourTimesReturnsToIdentity() {
    for (auto d : {PartFlipDirection::Left, PartFlipDirection::Right, PartFlipDirection::Forward, PartFlipDirection::Backward}) {
      Quaternion q = kIdentityOrientation;
      for (int i = 0; i < 4; ++i) q = composePartFlip(q, d);
      QVERIFY2(quatNear(q, kIdentityOrientation, 1e-12), flipDirectionName(d));
    }
    QVERIFY(quatNear(composePartFlip(composePartFlip(kIdentityOrientation, PartFlipDirection::UpsideDown), PartFlipDirection::UpsideDown), kIdentityOrientation, 0));
  }

  void normalizeRejectsDegenerateInput() {
    QVERIFY(!normalizeOrientation({0, 0, 0, 0}).has_value());
    QVERIFY(!normalizeOrientation({std::nan(""), 0, 0, 1}).has_value());
    QVERIFY(!normalizeOrientation({INFINITY, 0, 0, 1}).has_value());
    const auto n = normalizeOrientation({0, 0, 3, 4});
    QVERIFY(n && near(n->z, 0.6) && near(n->w, 0.8));
  }

  void automaticOrientationMatchesTheReference() {
    const auto all = meshes();
    int checked = 0;
    for (const QJsonValue& value : fixture().value("auto").toArray()) {
      const QJsonObject ref = value.toObject();
      const QString name = ref.value("mesh").toString();
      const TriangleSoup& soup = all.at(name);
      const auto evaluations = evaluateOrientationCandidates(soup);
      const QJsonArray expected = ref.value("evaluations").toArray();
      QCOMPARE(static_cast<int>(evaluations.size()), expected.size());
      for (int i = 0; i < expected.size(); ++i) {
        const QJsonObject e = expected[i].toObject();
        const auto& got = evaluations[static_cast<std::size_t>(i)];
        QCOMPARE(QString::fromStdString(got.id), e.value("id").toString());
        QVERIFY(quatNear(got.rotation, quat(e.value("rotation")), 0));
        const Bounds3 b = boundsOf(e.value("bounds").toObject());
        QVERIFY2(near(got.bounds.min.x, b.min.x) && near(got.bounds.min.y, b.min.y) && near(got.bounds.min.z, b.min.z) && near(got.bounds.max.x, b.max.x) &&
                     near(got.bounds.max.y, b.max.y) && near(got.bounds.max.z, b.max.z),
                 qPrintable(name + " bounds " + e.value("id").toString()));
        const QJsonObject s = e.value("score").toObject();
        QVERIFY2(near(got.score.supportArea, s.value("supportArea").toDouble()), qPrintable(name + " supportArea"));
        QVERIFY2(near(got.score.footprintArea, s.value("footprintArea").toDouble()), qPrintable(name + " footprintArea"));
        QVERIFY2(near(got.score.height, s.value("height").toDouble()), qPrintable(name + " height"));
        QVERIFY2(near(got.score.supportPointRatio, s.value("supportPointRatio").toDouble()), qPrintable(name + " supportPointRatio"));
      }
      const auto best = selectBestOrientationCandidate(evaluations);
      QVERIFY(best.has_value());
      QCOMPARE(QString::fromStdString(best->id), ref.value("best").toString());

      // prepareAutomaticModelOrientation: the committed rotation, and the grounding of the rotated bounds.
      const QJsonObject prep = ref.value("preparation").toObject();
      QCOMPARE(QString::fromStdString(best->id), prep.value("candidateId").toString());
      QVERIFY(quatNear(best->rotation, quat(prep.value("rotation")), 0));
      const auto grounding = calculateModelGroundingTransform(best->bounds);
      QVERIFY(grounding.has_value());
      const QJsonArray t = prep.value("translation").toArray();
      QVERIFY(near(grounding->translation.x, t[0].toDouble()) && near(grounding->translation.y, t[1].toDouble()) && near(grounding->translation.z, t[2].toDouble()));
      const AdaptiveGridConfig grid = deriveAdaptiveGridConfig(grounding->groundedBounds);
      const QJsonObject g = prep.value("gridConfig").toObject();
      QVERIFY(near(grid.majorStep, g.value("majorStep").toDouble()) && near(grid.minorStep, g.value("minorStep").toDouble()) && near(grid.size, g.value("size").toDouble()));
      ++checked;
    }
    QCOMPARE(checked, 9);
  }

  void orientedGeometryMatchesTheReferenceFloatForFloat() {
    const auto all = meshes();
    int rows = 0;
    std::size_t floats = 0, mismatches = 0;
    for (const QJsonValue& value : fixture().value("applied").toArray()) {
      const QJsonObject ref = value.toObject();
      const TriangleSoup& soup = all.at(ref.value("mesh").toString());
      TriangleSoup rotated = rotateSoup(soup, quat(ref.value("orientation")));
      // Same as the app: bounds of the rotated float32 vertices, then the grounding translation applied in double precision.
      Bounds3 b = emptyBounds();
      for (std::size_t i = 0; i + 2 < rotated.positions.size(); i += 3) {
        b.min = {std::min(b.min.x, double(rotated.positions[i])), std::min(b.min.y, double(rotated.positions[i + 1])), std::min(b.min.z, double(rotated.positions[i + 2]))};
        b.max = {std::max(b.max.x, double(rotated.positions[i])), std::max(b.max.y, double(rotated.positions[i + 1])), std::max(b.max.z, double(rotated.positions[i + 2]))};
      }
      const auto grounding = calculateModelGroundingTransform(b);
      QVERIFY(grounding.has_value());
      const QJsonArray t = ref.value("translation").toArray();
      QVERIFY(near(grounding->translation.x, t[0].toDouble(), 1e-12) && near(grounding->translation.y, t[1].toDouble(), 1e-12) &&
              near(grounding->translation.z, t[2].toDouble(), 1e-12));
      for (std::size_t i = 0; i + 2 < rotated.positions.size(); i += 3) {
        rotated.positions[i] = static_cast<float>(double(rotated.positions[i]) + grounding->translation.x);
        rotated.positions[i + 1] = static_cast<float>(double(rotated.positions[i + 1]) + grounding->translation.y);
        rotated.positions[i + 2] = static_cast<float>(double(rotated.positions[i + 2]) + grounding->translation.z);
      }
      const QJsonArray expected = ref.value("positions").toArray();
      QCOMPARE(static_cast<int>(rotated.positions.size()), expected.size());
      for (int i = 0; i < expected.size(); ++i) {
        ++floats;
        if (rotated.positions[static_cast<std::size_t>(i)] != static_cast<float>(expected[i].toDouble())) ++mismatches;
      }
      ++rows;
    }
    QCOMPARE(rows, 45);
    QVERIFY(floats > 10000);
    QCOMPARE(mismatches, std::size_t{0});
  }

  void rotationPreservesVolumeAndShape() {
    // Not in the reference: an independent sanity check that rotateSoup is a rigid rotation (edge lengths preserved).
    const auto all = meshes();
    const TriangleSoup& soup = all.at(QStringLiteral("bracket"));
    const TriangleSoup r = rotateSoup(soup, composePartFlip(composePartFlip(kIdentityOrientation, PartFlipDirection::Left), PartFlipDirection::Forward));
    for (std::size_t i = 0; i + 8 < soup.positions.size(); i += 9) {
      const auto len = [](const TriangleSoup& s, std::size_t a, std::size_t b) {
        return std::hypot(std::hypot(s.positions[a] - s.positions[b], s.positions[a + 1] - s.positions[b + 1]), s.positions[a + 2] - s.positions[b + 2]);
      };
      QVERIFY(std::fabs(len(soup, i, i + 3) - len(r, i, i + 3)) < 1e-4);
    }
  }

  void emptyAndDegenerateModelsCannotBeOriented() {
    TriangleSoup empty;
    QVERIFY(evaluateOrientationCandidates(empty).empty());
    QVERIFY(!automaticOrientation(empty).has_value());
    TriangleSoup point;
    point.positions.assign(9, 1.0f);  // one zero-size triangle
    QVERIFY(!automaticOrientation(point).has_value());
  }
};

QTEST_APPLESS_MAIN(OrientationEquivalenceTest)
#include "tst_orientation_equivalence.moc"
