// Native-vs-reference equivalence.
//
// fixtures/reference/mold-reference.json is produced by running the real
// reference implementation (TypeScript pipeline + manifold-3d WASM) through
// native/tests/reference/craftReference.test.ts. It records inputs and
// outputs. This test replays the recorded inputs through the native C++
// pipeline and compares every recorded quantity.

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>
#include <map>

#include "ManifoldMeshEngine.h"
#include "geometry/MeshAnalysis.h"
#include "model/ModelGrounding.h"
#include "mold/CavityGeneration.h"
#include "view/ViewPose.h"

using namespace craft;

namespace {

// Same kernel revision on both sides, but one is WASM and one is native
// code, so allow for last-bits floating-point differences only.
constexpr double kRelativeTolerance = 1e-9;
constexpr double kAbsoluteTolerance = 1e-9;

bool close(double actual, double expected) {
  return std::fabs(actual - expected) <=
         kAbsoluteTolerance + kRelativeTolerance * std::max(std::fabs(actual), std::fabs(expected));
}

Point3 pointOf(const QJsonObject& object) {
  return {object["x"].toDouble(), object["y"].toDouble(), object["z"].toDouble()};
}
Bounds3 boundsOf(const QJsonValue& value) {
  const QJsonObject object = value.toObject();
  return {pointOf(object["min"].toObject()), pointOf(object["max"].toObject())};
}

bool closeBounds(const Bounds3& actual, const Bounds3& expected) {
  for (int axis = 0; axis < 3; ++axis) {
    if (!close(actual.min[axis], expected.min[axis]) || !close(actual.max[axis], expected.max[axis])) {
      return false;
    }
  }
  return true;
}

QString describe(const Bounds3& b) {
  return QStringLiteral("[%1 %2 %3 | %4 %5 %6]")
      .arg(b.min.x, 0, 'g', 17).arg(b.min.y, 0, 'g', 17).arg(b.min.z, 0, 'g', 17)
      .arg(b.max.x, 0, 'g', 17).arg(b.max.y, 0, 'g', 17).arg(b.max.z, 0, 'g', 17);
}

std::vector<std::string> stringsOf(const QJsonValue& value) {
  std::vector<std::string> strings;
  for (const QJsonValue& item : value.toArray()) strings.push_back(item.toString().toStdString());
  return strings;
}

std::vector<std::string> codesOf(const std::vector<Issue>& issues) {
  std::vector<std::string> codes;
  for (const Issue& issue : issues) codes.push_back(issue.reasonCode);
  return codes;
}

#define VERIFY_CLOSE(actual, expected)                                                        \
  QVERIFY2(close((actual), (expected)),                                                       \
           qPrintable(QStringLiteral("%1: native %2 vs reference %3")                         \
                          .arg(QLatin1String(#actual))                                        \
                          .arg((actual), 0, 'g', 17)                                          \
                          .arg((expected), 0, 'g', 17)))

#define VERIFY_BOUNDS(actual, expected)                                                       \
  QVERIFY2(closeBounds((actual), (expected)),                                                 \
           qPrintable(QStringLiteral("%1: native %2 vs reference %3")                         \
                          .arg(QLatin1String(#actual), describe(actual), describe(expected))))

}  // namespace

class ReferenceEquivalenceTest : public QObject {
  Q_OBJECT

 private:
  QJsonObject document_;
  std::map<QString, std::shared_ptr<const TriangleSoup>> parts_;
  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();

 private slots:
  void initTestCase() {
    QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/mold-reference.json"));
    QVERIFY2(file.open(QIODevice::ReadOnly),
             "Reference fixtures are missing. Run scripts/native/generate-reference-fixtures.ps1.");
    document_ = QJsonDocument::fromJson(file.readAll()).object();
    QCOMPARE(document_["schema"].toString(), QStringLiteral("craft.native-reference-fixtures/1"));
    QCOMPARE(document_["units"].toString(), QStringLiteral("millimeters"));
    QCOMPARE(document_["upAxis"].toString(), QStringLiteral("Z"));

    const QJsonObject parts = document_["parts"].toObject();
    for (auto it = parts.begin(); it != parts.end(); ++it) {
      auto soup = std::make_shared<TriangleSoup>();
      for (const QJsonValue& value : it.value().toArray()) {
        soup->positions.push_back(static_cast<float>(value.toDouble()));
      }
      parts_[it.key()] = std::move(soup);
    }
    QVERIFY(!parts_.empty());
  }

  void moldPipeline_data() {
    QTest::addColumn<QJsonObject>("fixture");
    for (const QJsonValue& value : document_["moldCases"].toArray()) {
      const QJsonObject fixture = value.toObject();
      QTest::newRow(qPrintable(fixture["name"].toString())) << fixture;
    }
  }

  void moldPipeline() {
    QFETCH(QJsonObject, fixture);
    const QJsonObject input = fixture["input"].toObject();
    const QJsonObject expected = fixture["expected"].toObject();
    const QString partName = input["part"].toString();
    QVERIFY(parts_.count(partName) == 1);

    MoldGenerationRequest request;
    request.groundedPart = parts_[partName];
    request.modelId = QStringLiteral("1:%1.stl:%2")
                          .arg(partName)
                          .arg(request.groundedPart->positions.size())
                          .toStdString();
    request.partGeometryVersion = partGeometryVersion(*request.groundedPart);
    request.moldClearanceMm = input["moldClearanceMm"].toDouble();
    request.cavityClearanceMm = input["cavityClearanceMm"].toDouble();
    request.generationVersion = 1;
    for (const QJsonValue& value : input["planes"].toArray()) {
      const QJsonObject plane = value.toObject();
      const auto face = faceIdFromName(plane["face"].toString().toStdString());
      QVERIFY(face.has_value());
      request.cuttingPlanes.push_back(createCuttingPlane(
          *face, plane["normalizedPosition"].isNull()
                     ? std::optional<double>{}
                     : std::optional<double>{plane["normalizedPosition"].toDouble()}));
    }

    // --- stage inputs that do not depend on the Boolean kernel -------------
    VERIFY_BOUNDS(boundsOfSoup(*request.groundedPart), boundsOf(expected["groundedBounds"]));
    const auto frame =
        createReferenceMoldFrameBounds(boundsOfSoup(*request.groundedPart), request.moldClearanceMm);
    QVERIFY(frame.has_value());
    VERIFY_BOUNDS(frame->selectionBoxBounds, boundsOf(expected["selectionBoxBounds"]));
    VERIFY_BOUNDS(frame->referenceMoldBlockBounds, boundsOf(expected["referenceMoldBlockBounds"]));
    QCOMPARE(frame->partOffset.z, expected["partOffset"].toObject()["z"].toDouble());

    const GeometryTolerancePolicy policy =
        buildGeometryTolerancePolicy(frame->referenceMoldBlockBounds, request.cavityClearanceMm);
    const QJsonObject expectedPolicy = expected["tolerancePolicy"].toObject();
    // Exact: the policy is pure double arithmetic and must not drift at all.
    QCOMPARE(policy.weldToleranceMm, expectedPolicy["weldToleranceMm"].toDouble());
    QCOMPARE(policy.booleanToleranceMm, expectedPolicy["booleanToleranceMm"].toDouble());
    QCOMPARE(policy.surfaceToleranceMm, expectedPolicy["surfaceToleranceMm"].toDouble());
    QCOMPARE(policy.linearToleranceMm, expectedPolicy["linearToleranceMm"].toDouble());
    QCOMPARE(policy.containmentToleranceMm, expectedPolicy["containmentToleranceMm"].toDouble());
    QCOMPARE(policy.areaToleranceMm2, expectedPolicy["areaToleranceMm2"].toDouble());
    QCOMPARE(policy.volumeToleranceMm3, expectedPolicy["volumeToleranceMm3"].toDouble());
    QCOMPARE(policy.affectedVolumeToleranceMm3, expectedPolicy["affectedVolumeToleranceMm3"].toDouble());
    QCOMPARE(policy.minimumFragmentVolumeMm3, expectedPolicy["minimumFragmentVolumeMm3"].toDouble());

    // --- run the native pipeline ------------------------------------------
    MoldGenerationResult result;
    std::string errorCode, errorMessage;
    bool ok = true;
    try {
      result = generateMold(*engine_, request);
    } catch (const CodedError& error) {
      ok = false;
      errorCode = error.code();
      errorMessage = error.what();
    }

    if (expected["outcome"].toString() == QLatin1String("error")) {
      QVERIFY2(!ok, "The reference rejects this input but the native pipeline accepted it.");
      const QJsonObject error = expected["error"].toObject();
      QCOMPARE(QString::fromStdString(errorCode), error["code"].toString());
      QCOMPARE(QString::fromStdString(errorMessage), error["message"].toString());
      return;
    }
    QVERIFY2(ok, qPrintable(QStringLiteral("Native pipeline failed: %1 (%2)")
                                .arg(QString::fromStdString(errorMessage),
                                     QString::fromStdString(errorCode))));

    // --- Cut by Face ---------------------------------------------------------
    const QJsonArray expectedPlanes = expected["cutPlanes"].toArray();
    QCOMPARE(result.cutPlanes.size(), static_cast<std::size_t>(expectedPlanes.size()));
    for (qsizetype i = 0; i < expectedPlanes.size(); ++i) {
      const QJsonObject plane = expectedPlanes[i].toObject();
      const CutPlaneData& actual = result.cutPlanes[static_cast<std::size_t>(i)];
      QCOMPARE(QLatin1String(axisName(actual.axis)), plane["axis"].toString());
      QCOMPARE(QLatin1String(faceIdName(actual.sourceFace)), plane["sourceFace"].toString());
      QCOMPARE(actual.order, plane["order"].toInt());
      QCOMPARE(actual.coordinate, plane["coordinate"].toDouble());  // exact
    }

    const QJsonArray expectedSources = expected["sourceBodies"].toArray();
    QCOMPARE(result.definition.moldBodies.size(), static_cast<std::size_t>(expectedSources.size()));
    for (qsizetype i = 0; i < expectedSources.size(); ++i) {
      const QJsonObject body = expectedSources[i].toObject();
      const MoldBody& actual = result.definition.moldBodies[static_cast<std::size_t>(i)];
      QCOMPARE(QString::fromStdString(actual.id), body["id"].toString());
      QCOMPARE(QString::fromStdString(actual.name), body["name"].toString());
      QCOMPARE(actual.bounds, boundsOf(body["bounds"]));  // exact: same double arithmetic
      QCOMPARE(actual.volumeMm3, body["volumeMm3"].toDouble());
      QCOMPARE(actual.triangleCount, static_cast<std::size_t>(body["triangleCount"].toInt()));
      QCOMPARE(actual.mesh.vertexCount(), static_cast<std::size_t>(body["vertexCount"].toInt()));
      QVERIFY(meshTopology(actual.mesh).closedManifold());
    }

    // --- cavity tool -----------------------------------------------------------
    const QJsonObject tool = expected["tool"].toObject();
    QCOMPARE(QString::fromStdString(result.cavity.selectedEngine), expected["selectedEngine"].toString());
    QCOMPARE(result.cavity.engineReasonCodes, stringsOf(expected["engineReasonCodes"]));
    QCOMPARE(result.cavity.usedFallback, expected["usedFallback"].toBool());
    {
      std::vector<std::string> attempts;
      for (const CavityOffsetAttempt& a : result.cavity.offsetAttempts) {
        attempts.push_back(std::string(offsetEngineName(a.engine)) + ":" + (a.succeeded ? "succeeded" : "failed"));
      }
      QCOMPARE(attempts, stringsOf(expected["attemptStatuses"]));
    }
    QCOMPARE(QString::fromStdString(result.cavity.cavityTool.implementationMethod),
             tool["implementationMethod"].toString());
    VERIFY_BOUNDS(result.cavity.cavityTool.solid.bounds, boundsOf(tool["bounds"]));
    VERIFY_CLOSE(result.cavity.cavityTool.solid.volumeMm3, tool["volumeMm3"].toDouble());
    QCOMPARE(result.cavity.cavityTool.solid.triangleCount,
             static_cast<std::size_t>(tool["triangleCount"].toInt()));
    QCOMPARE(result.cavity.cavityTool.solid.mesh.vertexCount(),
             static_cast<std::size_t>(tool["vertexCount"].toInt()));
    QCOMPARE(result.cavity.cavityTool.solid.connectedComponentCount,
             static_cast<std::size_t>(tool["connectedComponentCount"].toInt()));

    // --- cavity bodies -----------------------------------------------------------
    const QJsonArray expectedBodies = expected["bodies"].toArray();
    QCOMPARE(result.cavity.bodies.size(), static_cast<std::size_t>(expectedBodies.size()));
    for (qsizetype i = 0; i < expectedBodies.size(); ++i) {
      const QJsonObject body = expectedBodies[i].toObject();
      const CavityMoldBody& actual = result.cavity.bodies[static_cast<std::size_t>(i)];
      QCOMPARE(QString::fromStdString(actual.body.id), body["id"].toString());
      QCOMPARE(QString::fromStdString(actual.body.name), body["name"].toString());
      QCOMPARE(QString::fromStdString(actual.parentBodyId), body["parentBodyId"].toString());
      QCOMPARE(actual.cavityAffected, body["cavityAffected"].toBool());
      VERIFY_BOUNDS(actual.body.bounds, boundsOf(body["bounds"]));
      VERIFY_CLOSE(actual.body.volumeMm3, body["volumeMm3"].toDouble());
      VERIFY_CLOSE(actual.validation.minimumWallMm, body["minimumWallMm"].toDouble());
      QCOMPARE(actual.body.triangleCount, static_cast<std::size_t>(body["triangleCount"].toInt()));
      QCOMPARE(actual.body.mesh.vertexCount(), static_cast<std::size_t>(body["vertexCount"].toInt()));
      QCOMPARE(actual.validation.reasonCodes, stringsOf(body["reasonCodes"]));

      std::size_t cavityTriangles = 0;
      for (const MeshFaceRun& run : actual.body.mesh.faceRuns) {
        if (run.role == FaceRole::CavitySurface) cavityTriangles += run.triangleCount;
      }
      QCOMPARE(cavityTriangles, static_cast<std::size_t>(body["cavitySurfaceTriangleCount"].toInt()));

      // Independent of the reference: the native mesh itself is a closed solid
      // whose own signed volume agrees with the kernel-reported volume.
      QVERIFY(meshTopology(actual.body.mesh).closedManifold());
      QVERIFY(std::fabs(signedVolume(actual.body.mesh) - actual.body.volumeMm3) <=
              1e-6 * std::max(1.0, actual.body.volumeMm3));
    }

    // --- diagnostics ---------------------------------------------------------------
    const QJsonObject subtraction = expected["subtraction"].toObject();
    const CavitySubtractionDiagnostics& actual = result.cavity.subtraction;
    QCOMPARE(actual.sourceBodyCount, static_cast<std::size_t>(subtraction["sourceBodyCount"].toInt()));
    QCOMPARE(actual.affectedBodyCount, static_cast<std::size_t>(subtraction["affectedBodyCount"].toInt()));
    QCOMPARE(actual.unaffectedBodyCount, static_cast<std::size_t>(subtraction["unaffectedBodyCount"].toInt()));
    VERIFY_CLOSE(actual.originalVolumeMm3, subtraction["originalVolumeMm3"].toDouble());
    VERIFY_CLOSE(actual.resultVolumeMm3, subtraction["resultVolumeMm3"].toDouble());
    // The removed volume is a difference of large numbers; compare it on the
    // scale of the block volume.
    QVERIFY(std::fabs(actual.removedVolumeMm3 - subtraction["removedVolumeMm3"].toDouble()) <=
            kRelativeTolerance * actual.originalVolumeMm3);
    VERIFY_CLOSE(actual.cavityToolVolumeMm3, subtraction["cavityToolVolumeMm3"].toDouble());

    QCOMPARE(codesOf(result.cavity.warnings), stringsOf(expected["warningCodes"]));
    QCOMPARE(codesOf(result.validationWarnings), stringsOf(expected["validationWarningCodes"]));
  }

  void grounding() {
    for (const QJsonValue& value : document_["grounding"].toArray()) {
      const QJsonObject fixture = value.toObject();
      const QJsonObject expected = fixture["expected"].toObject();
      const auto actual = calculateModelGroundingTransform(boundsOf(fixture["bounds"]));
      QVERIFY(actual.has_value());
      QCOMPARE(actual->translation, pointOf(expected["translation"].toObject()));
      QCOMPARE(actual->groundedBounds, boundsOf(expected["groundedBounds"]));
    }
  }

  void adaptiveGrid() {
    for (const QJsonValue& value : document_["adaptiveGrid"].toArray()) {
      const QJsonObject fixture = value.toObject();
      const QJsonObject expected = fixture["expected"].toObject();
      const auto actual = deriveAdaptiveGridConfig(
          fixture["bounds"].isNull() ? std::optional<Bounds3>{} : boundsOf(fixture["bounds"]));
      QCOMPARE(actual.majorStep, expected["majorStep"].toDouble());
      QCOMPARE(actual.minorStep, expected["minorStep"].toDouble());
      QCOMPARE(actual.size, expected["size"].toDouble());
    }
  }

  void fitDistance() {
    for (const QJsonValue& value : document_["fitDistance"].toArray()) {
      const QJsonObject input = value.toObject()["input"].toObject();
      const auto actual = calculateFitDistance(input["radius"].toDouble(),
                                               input["verticalFovDegrees"].toDouble(),
                                               input["aspect"].toDouble());
      QVERIFY(actual.has_value());
      VERIFY_CLOSE(*actual, value.toObject()["expected"].toDouble());
    }
  }
};

QTEST_APPLESS_MAIN(ReferenceEquivalenceTest)
#include "tst_reference_equivalence.moc"
