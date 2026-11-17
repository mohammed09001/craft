// Native-vs-reference equivalence for Segmentation. The fixture is produced by
// the real TypeScript pipeline (native/tests/reference/craftSegmentationReference.test.ts).

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

#include "ManifoldMeshEngine.h"
#include "TestMeshes.h"
#include "geometry/MeshAnalysis.h"
#include "mold/CavityGeneration.h"
#include "mold/DerivedMold.h"
#include "mold/Segmentation.h"

using namespace craft;

namespace {

constexpr double kRelativeTolerance = 1e-9;

bool close(double a, double b) {
  return std::fabs(a - b) <= 1e-9 + kRelativeTolerance * std::max(std::fabs(a), std::fabs(b));
}
#define VERIFY_CLOSE(actual, expected)                                                       \
  QVERIFY2(close((actual), (expected)), qPrintable(QStringLiteral("%1: native %2 vs reference %3") \
                                                       .arg(QLatin1String(#actual)).arg((actual), 0, 'g', 17).arg((expected), 0, 'g', 17)))

Point3 pointOf(const QJsonObject& o) { return {o["x"].toDouble(), o["y"].toDouble(), o["z"].toDouble()}; }
Point3 pointOfArray(const QJsonArray& a) { return {a[0].toDouble(), a[1].toDouble(), a[2].toDouble()}; }
Bounds3 boundsOf(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {pointOf(o["min"].toObject()), pointOf(o["max"].toObject())};
}
QString q(const std::string& s) { return QString::fromStdString(s); }

std::vector<std::string> stringsOf(const QJsonValue& value) {
  std::vector<std::string> out;
  for (const QJsonValue& v : value.toArray()) out.push_back(v.toString().toStdString());
  return out;
}
Axis axisOf(const QString& name) { return name == "x" ? Axis::X : name == "y" ? Axis::Y : Axis::Z; }

}  // namespace

class SegmentationEquivalenceTest : public QObject {
  Q_OBJECT
  QJsonObject document_;
  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();

  // --- comparison helpers (void so QVERIFY works) ---------------------------------------------
  void compareIssues(const std::vector<SegmentationIssue>& actual, const QJsonArray& expected) {
    QCOMPARE(actual.size(), static_cast<std::size_t>(expected.size()));
    for (qsizetype i = 0; i < expected.size(); ++i) {
      const QJsonObject e = expected[i].toObject();
      const SegmentationIssue& a = actual[static_cast<std::size_t>(i)];
      QCOMPARE(QString(a.blocker ? "blocker" : "warning"), e["severity"].toString());
      QCOMPARE(q(a.reasonCode), e["reasonCode"].toString());
      QCOMPARE(q(a.message), e["message"].toString());
    }
  }

  void compareIdentity(const SegmentationSourceIdentity& a, const QJsonObject& e) {
    QCOMPARE(a.documentRevision, e["documentRevision"].toDouble());
    QCOMPARE(q(a.documentFingerprint), e["documentFingerprint"].toString());
    QCOMPARE(q(a.resultRequestId), e["resultRequestId"].toString());
    QCOMPARE(q(a.definitionId), e["definitionId"].toString());
    QCOMPARE(q(a.modelId), e["modelId"].toString());
    QCOMPARE(q(a.frameId), e["frameId"].toString());
    QCOMPARE(q(a.bodySignature), e["bodySignature"].toString());
    QCOMPARE(q(a.protectedRegionSignature), e["protectedRegionSignature"].toString());
  }

  void compareFit(const FitStageResult& a, const QJsonObject& e) {
    const QString status = e["status"].toString();
    QCOMPARE(QString(a.status == FitStatus::Fits ? "FITS" : a.status == FitStatus::DoesNotFit ? "DOES_NOT_FIT" : "NOT_APPLICABLE"), status);
    const QJsonObject fit = e["axisFit"].toObject();
    QCOMPARE(a.axisFit[0], fit["x"].toBool());
    QCOMPARE(a.axisFit[1], fit["y"].toBool());
    QCOMPARE(a.axisFit[2], fit["z"].toBool());
    QCOMPARE(a.failingAxes.size(), static_cast<std::size_t>(e["failingAxes"].toArray().size()));
  }

  void compareValidation(const SegmentationValidation& a, const QJsonObject& e) {
    QCOMPARE(q(a.status), e["status"].toString());
    QCOMPARE(q(a.stage), e["stage"].toString());
    QCOMPARE(a.sourceRevision, e["sourceRevision"].toDouble());
    QCOMPARE(q(a.sourceFingerprint), e["sourceFingerprint"].toString());
    QCOMPARE(q(a.printableByBounds), e["printableByBounds"].toString());
    QCOMPARE(q(a.geometryExecution), e["geometryExecution"].toString());
    QCOMPARE(q(a.manufacturingSafety), e["manufacturingSafety"].toString());
    compareIssues(a.warnings, e["warnings"].toArray());
    compareIssues(a.blockers, e["blockers"].toArray());
  }

  void comparePlan(const SegmentationPlan& a, const QJsonObject& e) {
    QCOMPARE(q(a.id), e["id"].toString());
    QCOMPARE(q(a.request.requestId), e["request"].toObject()["requestId"].toString());
    QCOMPARE(q(a.algorithmId), e["algorithmId"].toString());
    QCOMPARE(a.algorithmVersion, e["algorithmVersion"].toInt());
    QCOMPARE(q(a.planningBasis), e["planningBasis"].toString());
    QCOMPARE(a.requiredAxes.size(), static_cast<std::size_t>(e["requiredAxes"].toArray().size()));
    for (qsizetype i = 0; i < e["requiredAxes"].toArray().size(); ++i) {
      QCOMPARE(QLatin1String(axisName(a.requiredAxes[static_cast<std::size_t>(i)])), e["requiredAxes"].toArray()[i].toString());
    }
    const QJsonObject per = e["perAxisSegmentCount"].toObject();
    QCOMPARE(a.perAxisSegmentCount[0], per["x"].toInt());
    QCOMPARE(a.perAxisSegmentCount[1], per["y"].toInt());
    QCOMPARE(a.perAxisSegmentCount[2], per["z"].toInt());
    QCOMPARE(a.estimatedMinimumSegmentCount, e["estimatedMinimumSegmentCount"].toInt());
    QCOMPARE(a.candidateIds, stringsOf(e["candidateIds"]));
    QCOMPARE(a.rejectedCandidateIds, stringsOf(e["rejectedCandidateIds"]));
    QCOMPARE(q(a.selectedCandidateId), e["selectedCandidateId"].toString());
    QCOMPARE(a.extensionObligations, stringsOf(e["extensionObligations"]));

    const QJsonArray boundaries = e["boundaries"].toArray();
    QCOMPARE(a.boundaries.size(), static_cast<std::size_t>(boundaries.size()));
    for (qsizetype i = 0; i < boundaries.size(); ++i) {
      const QJsonObject b = boundaries[i].toObject();
      const BoundaryIntent& x = a.boundaries[static_cast<std::size_t>(i)];
      QCOMPARE(q(x.id), b["id"].toString());
      QCOMPARE(QLatin1String(axisName(x.axis)), b["axis"].toString());
      QCOMPARE(x.coordinateMm, b["coordinateMm"].toDouble());
      QCOMPARE(x.ordinal, b["ordinal"].toInt());
      QCOMPARE(x.sequenceIndex, b["sequenceIndex"].toInt());
      QCOMPARE(x.broadcastToAllStraddlingBodies, b["broadcastToAllStraddlingBodies"].toBool(false));
      QCOMPARE(x.allStraddling, b["executionTargeting"].toString() == QLatin1String("all-straddling"));
    }
    const QJsonArray segments = e["segments"].toArray();
    QCOMPARE(a.segments.size(), static_cast<std::size_t>(segments.size()));
    for (qsizetype i = 0; i < segments.size(); ++i) {
      const QJsonObject s = segments[i].toObject();
      const SegmentDefinition& x = a.segments[static_cast<std::size_t>(i)];
      QCOMPARE(q(x.id), s["id"].toString());
      QCOMPARE(x.ordinal, s["ordinal"].toInt());
      const QJsonObject grid = s["gridIndex"].toObject();
      QCOMPARE(x.gridIndex[0], grid["x"].toInt());
      QCOMPARE(x.gridIndex[1], grid["y"].toInt());
      QCOMPARE(x.gridIndex[2], grid["z"].toInt());
      QCOMPARE(x.sourceBodyIds, stringsOf(s["sourceBodyIds"]));
      QCOMPARE(x.predictedBounds, boundsOf(s["predictedBounds"]));
      compareFit(x.predictedFit, s["predictedFit"].toObject());
      QCOMPARE(x.boundaryIntentIds, stringsOf(s["boundaryIntentIds"]));
    }
    const QJsonObject score = e["score"].toObject();
    QCOMPARE(a.score.hardFailureCount, score["hardFailureCount"].toInt());
    QCOMPARE(a.score.segmentCount, score["segmentCount"].toInt());
    QCOMPARE(a.score.minimumPrintableMarginMm, score["minimumPrintableMarginMm"].toDouble());
    QCOMPARE(a.score.declaredRisk, score["declaredRisk"].toInt());
    QCOMPARE(a.score.weightedObjectiveScore, score["weightedObjectiveScore"].toDouble());
    compareValidation(a.validation, e["validation"].toObject());
  }

  void compareBody(const MoldBody& a, const QJsonObject& e) {
    QCOMPARE(q(a.id), e["id"].toString());
    if (!e["name"].isNull()) QCOMPARE(q(a.name), e["name"].toString());
    QCOMPARE(q(a.geometryVersion), e["geometryVersion"].toString());
    VERIFY_CLOSE(a.volumeMm3, e["volumeMm3"].toDouble());
    const Bounds3 eb = boundsOf(e["bounds"]);
    for (int axis = 0; axis < 3; ++axis) {
      VERIFY_CLOSE(a.bounds.min[axis], eb.min[axis]);
      VERIFY_CLOSE(a.bounds.max[axis], eb.max[axis]);
    }
    QCOMPARE(a.triangleCount, static_cast<std::size_t>(e["triangleCount"].toInt()));
    QCOMPARE(a.mesh.vertexCount(), static_cast<std::size_t>(e["vertexCount"].toInt()));
  }

 private slots:
  void initTestCase() {
    QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/segmentation-reference.json"));
    QVERIFY2(file.open(QIODevice::ReadOnly), "Run scripts/native/generate-reference-fixtures.ps1.");
    document_ = QJsonDocument::fromJson(file.readAll()).object();
    QCOMPARE(document_["schema"].toString(), QStringLiteral("craft.native-segmentation-reference/1"));
  }

  void cases_data() {
    QTest::addColumn<QJsonObject>("fixture");
    for (const QJsonValue& v : document_["cases"].toArray()) {
      const QJsonObject f = v.toObject();
      QTest::newRow(qPrintable(f["name"].toString())) << f;
    }
  }

  void cases() {
    QFETCH(QJsonObject, fixture);
    const QJsonObject input = fixture["input"].toObject();
    const QJsonObject pb = input["partBounds"].toObject();
    const Bounds3 partBounds{pointOfArray(pb["min"].toArray()), pointOfArray(pb["max"].toArray())};
    const Point3 printer = pointOfArray(input["printerVolume"].toArray());

    // --- source snapshot -----------------------------------------------------------------------------
    const auto preliminary = capturePreliminaryWholeBlockSnapshot(partBounds, input["clearanceMm"].toDouble());
    QVERIFY(preliminary.has_value());
    SegmentationSourceSnapshot source = preliminary->snapshot;
    const QJsonObject es = fixture["source"].toObject();
    compareIdentity(source.identity, es["identity"].toObject());
    QCOMPARE(source.aggregateBounds, boundsOf(es["aggregateBounds"]));
    const QJsonObject eb = es["bodies"].toArray()[0].toObject();
    compareBody(source.bodies.front(), eb);
    const QJsonObject ed = es["definition"].toObject();
    QCOMPARE(q(preliminary->definition.definitionId), ed["definitionId"].toString());
    QCOMPARE(preliminary->definition.clearanceMm, ed["clearanceMm"].toDouble());
    QCOMPARE(preliminary->definition.selectionBoxBounds, boundsOf(ed["selectionBoxBounds"]));
    QCOMPARE(preliminary->definition.referenceMoldBlockBounds, boundsOf(ed["referenceMoldBlockBounds"]));
    QCOMPARE(preliminary->definition.partOffset, pointOf(ed["partOffset"].toObject()));
    QCOMPARE(source.warnings.size(), static_cast<std::size_t>(es["warningCodes"].toArray().size()));

    for (const QJsonValue& rv : input["regions"].toArray()) {
      const QJsonObject r = rv.toObject();
      const QJsonObject rb = r["bounds"].toObject();
      source.protectedRegions.push_back({r["id"].toString().toStdString(), "cavity-surface", "cavity", r["id"].toString().toStdString(),
                                         {source.bodies.front().id},
                                         {pointOfArray(rb["min"].toArray()), pointOfArray(rb["max"].toArray())},
                                         r["hardness"].toString().toStdString(), r["clearanceMm"].toDouble()});
    }
    QCOMPARE(source.protectedRegions.size(), static_cast<std::size_t>(es["protectedRegionCount"].toInt()));

    // --- request and plan -------------------------------------------------------------------------------------
    const SegmentationRequest request = createSegmentationRequest(source, printer);
    const QJsonObject er = fixture["request"].toObject();
    QCOMPARE(q(request.requestId), er["requestId"].toString());
    QCOMPARE(q(request.printerVolumeSignature), er["printerVolumeSignature"].toString());
    QCOMPARE(q(request.settingsSignature), er["settingsSignature"].toString());

    const SegmentationPlanningResult planning = planSegmentation(request, source);
    const QJsonObject ep = fixture["planning"].toObject();
    QCOMPARE(q(planning.status), ep["status"].toString());
    if (!ep["reasonCode"].isNull()) QCOMPARE(q(planning.reasonCode), ep["reasonCode"].toString());
    if (!ep["stage"].isNull()) QCOMPARE(q(planning.stage), ep["stage"].toString());
    compareIssues(planning.issues, ep["issues"].toArray());
    if (!ep["validation"].isNull()) {
      QVERIFY(planning.validation.has_value());
      compareValidation(*planning.validation, ep["validation"].toObject());
    }
    if (!fixture.contains("plan")) {
      QVERIFY(!planning.plan.has_value());
      return;
    }
    QVERIFY(planning.plan.has_value());
    SegmentationPlan plan = *planning.plan;
    comparePlan(plan, fixture["plan"].toObject());

    const QJsonObject ownership = fixture["axisOwnership"].toObject();
    const AxisOwnership own = deriveAxisOwnership(plan.requiredAxes, {});
    QCOMPARE(own.availableAxes.size(), static_cast<std::size_t>(ownership["availableAxes"].toArray().size()));
    QCOMPARE(own.combinedUsedAxes.size(), static_cast<std::size_t>(ownership["combinedUsedAxes"].toArray().size()));

    // --- extension ------------------------------------------------------------------------------------------------------
    if (fixture.contains("extension")) {
      const QJsonObject ee = fixture["extension"].toObject();
      const Axis axis = axisOf(input["extension"].toObject()["axis"].toString());
      const double suggested = suggestExtensionAxisPosition(source, axis);
      QCOMPARE(suggested, ee["suggestedMm"].toDouble());
      const double coordinate = input["extension"].toObject().contains("coordinateMm")
                                    ? input["extension"].toObject()["coordinateMm"].toDouble()
                                    : suggested;
      QCOMPARE(coordinate, ee["coordinateMm"].toDouble());
      plan = mergeExtensionBoundary(plan, axis, coordinate, source.protectedRegions);
      comparePlan(plan, ee["mergedPlan"].toObject());
    }

    // --- preview -------------------------------------------------------------------------------------------------------------
    if (fixture.contains("preview")) {
      const auto bodies = buildSegmentationPlanPreviewBodies(plan, preliminary->definition);
      const QJsonArray preview = fixture["preview"].toArray();
      QCOMPARE(bodies.size(), static_cast<std::size_t>(preview.size()));
      for (qsizetype i = 0; i < preview.size(); ++i) compareBody(bodies[static_cast<std::size_t>(i)], preview[i].toObject());
    } else {
      QVERIFY(plan.validation.status != "planning-valid");
    }

    // --- execution ------------------------------------------------------------------------------------------------------------
    if (!fixture.contains("execution")) return;
    const QJsonObject ex = fixture["execution"].toObject();
    const SegmentationPreflight preflight = createSegmentationExecutionRequest(plan, source, printer);
    QCOMPARE(QString(preflight.ok ? "ok" : "failed"), ex["preflight"].toString());
    QVERIFY2(preflight.ok, "preflight must accept the plans the reference executes");
    QCOMPARE(q(preflight.request.id), ex["requestId"].toString());
    QCOMPARE(q(preflight.request.planeSequenceSignature), ex["planeSequenceSignature"].toString());
    const QJsonObject pol = ex["policy"].toObject();
    QCOMPARE(preflight.request.policy.linearToleranceMm, pol["linearToleranceMm"].toDouble());
    QCOMPARE(preflight.request.policy.boundsToleranceMm, pol["boundsToleranceMm"].toDouble());
    QCOMPARE(preflight.request.policy.sideToleranceMm, pol["sideToleranceMm"].toDouble());
    QCOMPARE(preflight.request.policy.volumeToleranceMm3, pol["volumeToleranceMm3"].toDouble());
    const QJsonArray planes = ex["planes"].toArray();
    QCOMPARE(preflight.request.planes.size(), static_cast<std::size_t>(planes.size()));
    for (qsizetype i = 0; i < planes.size(); ++i) {
      QCOMPARE(q(preflight.request.planes[static_cast<std::size_t>(i)].boundaryId), planes[i].toObject()["boundaryId"].toString());
    }

    const SegmentationExecutionResult result = executePlaneSegmentation(*engine_, preflight.request);
    QCOMPARE(q(result.status), ex["status"].toString());
    if (!ex["reasonCode"].isNull()) QCOMPARE(q(result.reasonCode), ex["reasonCode"].toString());
    QCOMPARE(result.issues.size(), static_cast<std::size_t>(ex["issues"].toArray().size()));
    for (qsizetype i = 0; i < ex["issues"].toArray().size(); ++i) {
      QCOMPARE(q(result.issues[static_cast<std::size_t>(i)].message), ex["issues"].toArray()[i].toString());
    }
    if (result.status != "executed") return;
    QCOMPARE(q(result.diagnostics.front().message), ex["diagnosticMessage"].toString());

    const QJsonArray bodies = ex["bodies"].toArray();
    QCOMPARE(result.bodies.size(), static_cast<std::size_t>(bodies.size()));
    for (qsizetype i = 0; i < bodies.size(); ++i) {
      const QJsonObject b = bodies[i].toObject();
      const SegmentationExecutedBody& a = result.bodies[static_cast<std::size_t>(i)];
      compareBody(a.body, b);
      QVERIFY(meshTopology(a.body.mesh).closedManifold());
      const QJsonObject pv = b["provenance"].toObject();
      QCOMPARE(q(a.provenance.sourceBodyId), pv["sourceBodyId"].toString());
      QCOMPARE(q(a.provenance.sourceGeometryVersion), pv["sourceGeometryVersion"].toString());
      QCOMPARE(q(a.provenance.boundaryId), pv["boundaryId"].toString());
      QCOMPARE(q(a.provenance.side), pv["side"].toString());
      QCOMPARE(q(a.provenance.parentBodyId), pv["parentBodyId"].toString());
      QCOMPARE(q(a.provenance.parentGeometryVersion), pv["parentGeometryVersion"].toString());
      QCOMPARE(a.provenance.cutIndex, pv["cutIndex"].toInt());
      QCOMPARE(a.provenance.boundaryLineage, stringsOf(pv["boundaryLineage"]));
      QCOMPARE(q(a.provenance.executionRequestId), pv["executionRequestId"].toString());
    }
    const QJsonObject ev = ex["validation"].toObject();
    VERIFY_CLOSE(result.validation->sourceVolumeMm3, ev["sourceVolumeMm3"].toDouble());
    VERIFY_CLOSE(result.validation->outputVolumeMm3, ev["outputVolumeMm3"].toDouble());
    const QJsonArray cuts = ev["cuts"].toArray();
    QCOMPARE(result.validation->cuts.size(), static_cast<std::size_t>(cuts.size()));
    for (qsizetype i = 0; i < cuts.size(); ++i) {
      const QJsonObject c = cuts[i].toObject();
      const SegmentationCutValidation& a = result.validation->cuts[static_cast<std::size_t>(i)];
      QCOMPARE(a.cutIndex, c["cutIndex"].toInt());
      QCOMPARE(QLatin1String(axisName(a.axis)), c["axis"].toString());
      QCOMPARE(q(a.boundaryId), c["boundaryId"].toString());
      QCOMPARE(q(a.inputBodyId), c["inputBodyId"].toString());
      VERIFY_CLOSE(a.inputVolumeMm3, c["inputVolumeMm3"].toDouble());
      VERIFY_CLOSE(a.outputVolumeMm3, c["outputVolumeMm3"].toDouble());
    }

    // --- committed registration with the automatic sizing policy ----------------------------------------------------
    QVERIFY(fixture.contains("registration"));
    const QJsonObject rg = fixture["registration"].toObject();
    std::vector<MoldBody> executed;
    for (const SegmentationExecutedBody& b : result.bodies) executed.push_back(b.body);
    const DerivedRegistrationState state =
        generateSegmentationRegistration(*engine_, plan, source, preliminary->definition, executed, "segmentation-registration");
    QVERIFY(state.report.has_value());
    QCOMPARE(q(state.status), rg["status"].toString());
    QCOMPARE(q(state.report->reasonCode), rg["reasonCode"].toString());
    QCOMPARE(q(state.report->message), rg["message"].toString());
    QCOMPARE(q(state.report->tolerancePolicy.policyId), rg["policyId"].toString());
    QCOMPARE(state.report->tolerancePolicy.maximumFeatureRadiusMm, rg["maximumFeatureRadiusMm"].toDouble());
    std::vector<std::string> interfaceIds;
    for (const RegistrationInterface& i : state.report->interfaces) interfaceIds.push_back(i.id);
    QCOMPARE(interfaceIds, stringsOf(rg["interfaceIds"]));
    const QJsonArray features = rg["features"].toArray();
    QCOMPARE(state.report->features.size(), static_cast<std::size_t>(features.size()));
    for (qsizetype i = 0; i < features.size(); ++i) {
      const QJsonObject f = features[i].toObject();
      const RegistrationFeature& a = state.report->features[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.id), f["id"].toString());
      QCOMPARE(QLatin1String(keySideName(a.side)), f["side"].toString());
      QCOMPARE(a.geometry.widthMm, f["widthMm"].toDouble());
      QCOMPARE(a.geometry.depthMm, f["depthMm"].toDouble());
      QCOMPARE(a.geometry.lengthMm, f["lengthMm"].toDouble());
      QCOMPARE(a.startPoint, pointOf(f["startPoint"].toObject()));
      QCOMPARE(a.endPoint, pointOf(f["endPoint"].toObject()));
    }
    const QJsonArray attempts = rg["attempts"].toArray();
    QCOMPARE(state.report->attempts.size(), static_cast<std::size_t>(attempts.size()));
    const QJsonArray rbodies = rg["bodies"].toArray();
    QCOMPARE(state.bodies.size(), static_cast<std::size_t>(rbodies.size()));
    for (qsizetype i = 0; i < rbodies.size(); ++i) {
      const QJsonObject b = rbodies[i].toObject();
      const MoldBody& a = state.bodies[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.id), b["id"].toString());
      VERIFY_CLOSE(a.volumeMm3, b["volumeMm3"].toDouble());
      QCOMPARE(a.triangleCount, static_cast<std::size_t>(b["triangleCount"].toInt()));
      std::size_t keys = 0;
      for (const MeshFaceRun& run : a.mesh.faceRuns) {
        if (run.role == FaceRole::RegistrationKey) keys += run.triangleCount;
      }
      QCOMPARE(keys, static_cast<std::size_t>(b["keyTriangleCount"].toInt()));
    }

    // --- cavity and keyed registration on the segmented bodies ------------------------------------------------
    if (!fixture.contains("segmentedMold")) return;
    const QJsonObject sm = fixture["segmentedMold"].toObject();
    MoldGenerationRequest mold;
    mold.modelId = "segmented-test";
    mold.groundedPart = std::make_shared<TriangleSoup>(test::soupFromMesh(test::cubeMesh(partBounds)));
    mold.partGeometryVersion = partGeometryVersion(*mold.groundedPart);
    mold.moldClearanceMm = preliminary->definition.clearanceMm;
    mold.segmentedBodies = executed;
    mold.generationVersion = 1;
    const MoldGenerationResult moldResult = generateMold(*engine_, mold);
    QVERIFY(moldResult.definition.segmentationLineage);
    QVERIFY(!moldResult.definition.moldBodiesPartitionReferenceBlock);
    QCOMPARE(moldResult.definition.referenceMoldBlockBounds, preliminary->definition.referenceMoldBlockBounds);
    QCOMPARE(moldResult.definition.selectionBoxBounds, preliminary->definition.selectionBoxBounds);

    const QJsonObject ec = sm["cavity"].toObject();
    VERIFY_CLOSE(moldResult.cavity.cavityTool.solid.volumeMm3, ec["toolVolumeMm3"].toDouble());
    const QJsonArray cavityBodies = ec["bodies"].toArray();
    QCOMPARE(moldResult.cavity.bodies.size(), static_cast<std::size_t>(cavityBodies.size()));
    for (qsizetype i = 0; i < cavityBodies.size(); ++i) {
      const QJsonObject b = cavityBodies[i].toObject();
      const CavityMoldBody& a = moldResult.cavity.bodies[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.body.id), b["id"].toString());
      QCOMPARE(q(a.parentBodyId), b["parentBodyId"].toString());
      QCOMPARE(a.cavityAffected, b["cavityAffected"].toBool());
      VERIFY_CLOSE(a.body.volumeMm3, b["volumeMm3"].toDouble());
      QCOMPARE(a.body.triangleCount, static_cast<std::size_t>(b["triangleCount"].toInt()));
      QCOMPARE(a.body.mesh.vertexCount(), static_cast<std::size_t>(b["vertexCount"].toInt()));
    }

    const DerivedMoldEvaluation derived = evaluateDerivedMold(*engine_, moldResult, {});
    const QJsonObject er2 = sm["registration"].toObject();
    QCOMPARE(q(derived.registration.status), er2["status"].toString());
    QVERIFY(derived.registration.report.has_value());
    QCOMPARE(q(derived.registration.report->reasonCode), er2["reasonCode"].toString());
    QCOMPARE(q(derived.registration.report->message), er2["message"].toString());
    QCOMPARE(q(derived.registration.report->tolerancePolicy.policyId), er2["policyId"].toString());
    std::vector<std::string> keyedInterfaceIds, keyedFeatureIds;
    for (const auto& i : derived.registration.report->interfaces) keyedInterfaceIds.push_back(i.id);
    for (const auto& f : derived.registration.report->features) keyedFeatureIds.push_back(f.id);
    QCOMPARE(keyedInterfaceIds, stringsOf(er2["interfaceIds"]));
    QCOMPARE(keyedFeatureIds, stringsOf(er2["featureIds"]));
    const QJsonArray keyedBodies = er2["bodies"].toArray();
    QCOMPARE(derived.registration.bodies.size(), static_cast<std::size_t>(keyedBodies.size()));
    for (qsizetype i = 0; i < keyedBodies.size(); ++i) {
      const QJsonObject b = keyedBodies[i].toObject();
      const MoldBody& a = derived.registration.bodies[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.id), b["id"].toString());
      VERIFY_CLOSE(a.volumeMm3, b["volumeMm3"].toDouble());
      QCOMPARE(a.triangleCount, static_cast<std::size_t>(b["triangleCount"].toInt()));
      QCOMPARE(a.mesh.vertexCount(), static_cast<std::size_t>(b["vertexCount"].toInt()));
      QVERIFY(meshTopology(a.mesh).closedManifold());
    }
  }
};

QTEST_APPLESS_MAIN(SegmentationEquivalenceTest)
#include "tst_segmentation_equivalence.moc"
