// The segmentation source snapshot and the merge of protected regions from a committed mold, against the reference's own
// readCurrentSegmentationSourceSnapshot (segmentation-source-reference.json, generated from the real code and the real stores by
// craftSegmentationSourceReference.test.ts): which source is used (automatic block, or blocked as stale / invalid), which regions are
// merged and in which order, their bodies, bounds and clearances, the evidence and warnings, and every identity field.
#include <QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

#include "mold/Segmentation.h"

using namespace craft;

namespace {

QJsonObject fixture() {
  QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/segmentation-source-reference.json"));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

QString q(const std::string& s) { return QString::fromStdString(s); }
std::string s(const QJsonValue& v) { return v.toString().toStdString(); }

Point3 pointOf(const QJsonValue& v) {
  if (v.isArray()) {
    const QJsonArray a = v.toArray();
    return {a[0].toDouble(), a[1].toDouble(), a[2].toDouble()};
  }
  const QJsonObject o = v.toObject();
  return {o.value("x").toDouble(), o.value("y").toDouble(), o.value("z").toDouble()};
}

Bounds3 boundsOf(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {pointOf(o.value("min")), pointOf(o.value("max"))};
}

std::vector<std::string> stringsOf(const QJsonValue& v) {
  std::vector<std::string> out;
  for (const QJsonValue& item : v.toArray()) out.push_back(s(item));
  return out;
}

Bounds3 shifted(const Bounds3& b, double dx) { return {{b.min.x + dx, b.min.y, b.min.z}, {b.max.x + dx, b.max.y, b.max.z}}; }

// The committed result a case describes, as the application would hand it over.
CommittedMoldSource committedOf(const QJsonObject& spec, const PreliminarySource& automatic) {
  CommittedMoldSource c;
  for (const QJsonValue& v : spec.value("bodies").toArray()) {
    const QJsonObject o = v.toObject();
    MoldBody body;
    body.id = s(o.value("id"));
    body.name = body.id;
    body.bounds = boundsOf(o.value("bounds"));
    body.triangleCount = 1;
    body.volumeMm3 = 1000;
    body.watertight = o.contains("watertight") ? o.value("watertight").toBool() : true;
    if (!o.value("empty").toBool()) {
      body.mesh.positions = {0, 0, 0, 1, 0, 0, 0, 1, 1};
      body.mesh.indices = {0, 1, 2};
    }
    c.facts.bodies.push_back(std::move(body));
  }
  if (spec.contains("cavity")) {
    const QJsonObject o = spec.value("cavity").toObject();
    c.facts.hasCavity = true;
    c.facts.cavitySourceSignature = s(o.value("sourceSignature"));
    c.facts.cavityBounds = boundsOf(o.value("bounds"));
    c.facts.cavityClearanceMm = o.value("clearanceMm").toDouble();
  }
  for (const QJsonValue& v : spec.value("sprues").toArray()) {
    const QJsonObject o = v.toObject();
    SprueDefinition sprue;
    sprue.operationId = s(o.value("operationId"));
    sprue.targetBodyIds = stringsOf(o.value("targetBodyIds"));
    sprue.position = pointOf(o.value("position"));
    sprue.inwardDirection = pointOf(o.value("inwardDirection"));
    sprue.depthMm = o.value("depthMm").toDouble();
    sprue.profile.mainDiameterMm = o.value("mainDiameterMm").toDouble();
    sprue.tolerancePolicy.surfaceToleranceMm = o.value("surfaceToleranceMm").toDouble();
    c.facts.sprues.push_back(std::move(sprue));
  }
  for (const QJsonValue& v : spec.value("features").toArray()) {
    const QJsonObject o = v.toObject();
    RegistrationFeature f;
    f.id = s(o.value("id"));
    f.status = s(o.value("status"));
    f.femaleBodyId = s(o.value("femaleBodyId"));
    f.maleBodyId = s(o.value("maleBodyId"));
    f.geometry.widthMm = o.value("widthMm").toDouble();
    f.geometry.depthMm = o.value("depthMm").toDouble();
    f.clearanceMm = o.value("clearanceMm").toDouble();
    f.startPoint = pointOf(o.value("start"));
    f.endPoint = pointOf(o.value("end"));
    c.facts.generatedFeatures.push_back(std::move(f));
  }
  const QString frame = spec.value("frame").toString();
  c.definition = automatic.definition;
  c.definition.definitionId = "committed-definition";
  c.definition.modelId = "model-a";
  if (frame == "other") c.definition.referenceMoldBlockBounds = shifted(automatic.definition.referenceMoldBlockBounds, 7);
  if (frame == "otherSelection") c.definition.selectionBoxBounds = shifted(automatic.definition.selectionBoxBounds, 3);
  c.sourceRevision = 4;
  c.sourceFingerprint = "fingerprint-4";
  c.resultRequestId = "mold-eval:4";
  c.current = !spec.contains("stale");
  return c;
}

}  // namespace

class SegmentationSourceEquivalenceTest : public QObject {
  Q_OBJECT
 private slots:
  void fixtureIsPresent() {
    const QJsonObject f = fixture();
    QVERIFY(!f.isEmpty());
    QCOMPARE(f.value("cases").toArray().size(), 15);
  }

  void everyScenarioDecidesAndMergesLikeTheReference() {
    for (const QJsonValue& value : fixture().value("cases").toArray()) {
      const QJsonObject c = value.toObject();
      const QJsonObject input = c.value("input").toObject();
      const QByteArray name = c.value("name").toString().toUtf8();
      const auto automatic = capturePreliminaryWholeBlockSnapshot(boundsOf(input.value("partBounds")), input.value("clearanceMm").toDouble());
      QVERIFY2(automatic.has_value(), name.constData());
      std::optional<CommittedMoldSource> committed;
      if (input.contains("committed")) committed = committedOf(input.value("committed").toObject(), *automatic);

      const SegmentationSourceResult result = readSegmentationSource(automatic, committed);
      QCOMPARE(q(result.status), c.value("status").toString());
      if (result.status != "ready") {
        QCOMPARE(q(result.reasonCode), c.value("reasonCode").toString());
        const QJsonArray issues = c.value("issues").toArray();
        QCOMPARE(result.issues.size(), static_cast<std::size_t>(issues.size()));
        for (int i = 0; i < issues.size(); ++i) {
          QCOMPARE(std::string(result.issues[static_cast<std::size_t>(i)].blocker ? "blocker" : "warning"), s(issues[i].toObject().value("severity")));
          QCOMPARE(q(result.issues[static_cast<std::size_t>(i)].reasonCode), issues[i].toObject().value("reasonCode").toString());
          QCOMPARE(q(result.issues[static_cast<std::size_t>(i)].message), issues[i].toObject().value("message").toString());
        }
        QVERIFY(!result.source);
        continue;
      }
      QVERIFY2(result.source.has_value(), name.constData());
      const SegmentationSourceSnapshot& snapshot = result.source->snapshot;

      const QJsonObject id = c.value("identity").toObject();
      QCOMPARE(snapshot.identity.documentRevision, id.value("documentRevision").toDouble());
      QCOMPARE(q(snapshot.identity.documentFingerprint), id.value("documentFingerprint").toString());
      QCOMPARE(q(snapshot.identity.resultRequestId), id.value("resultRequestId").toString());
      QCOMPARE(q(snapshot.identity.definitionId), id.value("definitionId").toString());
      QCOMPARE(q(snapshot.identity.modelId), id.value("modelId").toString());
      QCOMPARE(q(snapshot.identity.frameId), id.value("frameId").toString());
      QCOMPARE(q(snapshot.identity.bodySignature), id.value("bodySignature").toString());
      QVERIFY2(q(snapshot.identity.protectedRegionSignature) == id.value("protectedRegionSignature").toString(), name.constData());

      const Bounds3 aggregate = boundsOf(c.value("aggregateBounds"));
      for (int i = 0; i < 3; ++i) {
        QCOMPARE(snapshot.aggregateBounds.min[i], aggregate.min[i]);
        QCOMPARE(snapshot.aggregateBounds.max[i], aggregate.max[i]);
      }
      const QJsonArray bodies = c.value("bodies").toArray();
      QCOMPARE(snapshot.bodies.size(), static_cast<std::size_t>(bodies.size()));
      for (int i = 0; i < bodies.size(); ++i) {
        QCOMPARE(q(snapshot.bodies[static_cast<std::size_t>(i)].id), bodies[i].toObject().value("id").toString());
        QCOMPARE(snapshot.bodies[static_cast<std::size_t>(i)].triangleCount, static_cast<std::size_t>(bodies[i].toObject().value("triangleCount").toInt()));
      }

      const QJsonArray regions = c.value("protectedRegions").toArray();
      QVERIFY2(snapshot.protectedRegions.size() == static_cast<std::size_t>(regions.size()), name.constData());
      for (int i = 0; i < regions.size(); ++i) {
        const QJsonObject want = regions[i].toObject();
        const SegmentationProtectedRegion& got = snapshot.protectedRegions[static_cast<std::size_t>(i)];
        QCOMPARE(q(got.id), want.value("id").toString());
        QCOMPARE(q(got.kind), want.value("kind").toString());
        QCOMPARE(q(got.source), want.value("source").toString());
        QCOMPARE(q(got.provenanceId), want.value("provenanceId").toString());
        QCOMPARE(q(got.hardness), want.value("hardness").toString());
        QCOMPARE(got.clearanceMm, want.value("clearanceMm").toDouble());
        QVERIFY(got.bodyIds == stringsOf(want.value("bodyIds")));
        const Bounds3 wantBounds = boundsOf(want.value("bounds"));
        for (int k = 0; k < 3; ++k) {
          QVERIFY(std::fabs(got.bounds.min[k] - wantBounds.min[k]) <= 1e-9);
          QVERIFY(std::fabs(got.bounds.max[k] - wantBounds.max[k]) <= 1e-9);
        }
      }
      QCOMPARE(q(snapshot.protectedRegionEvidence.status), c.value("protectedRegionEvidence").toObject().value("status").toString());
      QCOMPARE(q(snapshot.protectedRegionEvidence.reason), c.value("protectedRegionEvidence").toObject().value("reason").toString());
      const QJsonArray warnings = c.value("warnings").toArray();
      QCOMPARE(snapshot.warnings.size(), static_cast<std::size_t>(warnings.size()));
      for (int i = 0; i < warnings.size(); ++i) {
        QCOMPARE(q(snapshot.warnings[static_cast<std::size_t>(i)].reasonCode), warnings[i].toObject().value("reasonCode").toString());
        QCOMPARE(q(snapshot.warnings[static_cast<std::size_t>(i)].message), warnings[i].toObject().value("message").toString());
      }

      const QJsonObject definition = c.value("definition").toObject();
      QCOMPARE(q(result.source->definition.definitionId), definition.value("definitionId").toString());
      QCOMPARE(result.source->definition.clearanceMm, definition.value("clearanceMm").toDouble());
      const Bounds3 block = boundsOf(definition.value("referenceMoldBlockBounds"));
      for (int k = 0; k < 3; ++k) {
        QCOMPARE(result.source->definition.referenceMoldBlockBounds.min[k], block.min[k]);
        QCOMPARE(result.source->definition.referenceMoldBlockBounds.max[k], block.max[k]);
      }
    }
  }

  void withoutAnAutomaticSourceTheCommittedOneIsUsedAsItIs() {
    const auto automatic = capturePreliminaryWholeBlockSnapshot({{0, 0, 0}, {250, 50, 50}}, 100);
    QVERIFY(automatic);
    const QJsonObject any = fixture().value("cases").toArray().at(1).toObject().value("input").toObject().value("committed").toObject();
    const CommittedMoldSource committed = committedOf(any, *automatic);
    const SegmentationSourceResult result = readSegmentationSource(std::nullopt, committed);
    QCOMPARE(q(result.status), QStringLiteral("ready"));
    QVERIFY(result.source);
    QCOMPARE(result.source->snapshot.protectedRegions.size(), std::size_t{5});
    QCOMPARE(q(result.source->snapshot.identity.definitionId), QStringLiteral("committed-definition"));
    QCOMPARE(result.source->snapshot.warnings.size(), std::size_t{1});

    // Neither source: the reference's missing-geometry failure.
    const SegmentationSourceResult none = readSegmentationSource(std::nullopt, std::nullopt);
    QCOMPARE(q(none.status), QStringLiteral("failed"));
    QCOMPARE(q(none.reasonCode), QStringLiteral("missing_authoritative_geometry"));
  }
};

QTEST_APPLESS_MAIN(SegmentationSourceEquivalenceTest)
#include "tst_segmentation_source_equivalence.moc"
