// Native-vs-reference equivalence for the Master Mold foundation (seed,
// preflight, planning mesh, candidate directions). The fixture is produced by
// native/tests/reference/craftMasterReference.test.ts.

#include <QtTest/QtTest>

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <cmath>

#include "geometry/MeshAnalysis.h"
#include "master/MasterAccessibility.h"
#include "master/MasterPlanning.h"

using namespace craft;

namespace {

bool close(double a, double b, double rel = 1e-12) {
  return std::fabs(a - b) <= 1e-12 + rel * std::max(std::fabs(a), std::fabs(b));
}
#define VERIFY_CLOSE(actual, expected)                                                              \
  QVERIFY2(close((actual), (expected)), qPrintable(QStringLiteral("%1: native %2 vs reference %3") \
                                                       .arg(QLatin1String(#actual)).arg((actual), 0, 'g', 17).arg((expected), 0, 'g', 17)))

Point3 pointOf(const QJsonObject& o) { return {o["x"].toDouble(), o["y"].toDouble(), o["z"].toDouble()}; }
Bounds3 boundsOf(const QJsonValue& v) {
  const QJsonObject o = v.toObject();
  return {pointOf(o["min"].toObject()), pointOf(o["max"].toObject())};
}
QString q(const std::string& s) { return QString::fromStdString(s); }

/// Mirrors cubeGrid() in craftMasterReference.test.ts operation for operation.
void cubeGrid(int segments, double size, std::vector<double>& positions, std::vector<std::uint32_t>& indices) {
  for (int axis = 0; axis < 3; ++axis) {
    const int uAxis = (axis + 1) % 3, vAxis = (axis + 2) % 3;
    for (bool positive : {true, false}) {
      const std::uint32_t base = static_cast<std::uint32_t>(positions.size() / 3);
      for (int i = 0; i <= segments; ++i)
        for (int j = 0; j <= segments; ++j) {
          double p[3] = {0, 0, 0};
          p[axis] = positive ? size : 0;
          p[uAxis] = (i * size) / segments;
          p[vAxis] = (j * size) / segments;
          positions.insert(positions.end(), {p[0], p[1], p[2]});
        }
      const auto at = [&](int i, int j) { return base + static_cast<std::uint32_t>(i * (segments + 1) + j); };
      for (int i = 0; i < segments; ++i)
        for (int j = 0; j < segments; ++j) {
          if (positive) indices.insert(indices.end(), {at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1)});
          else indices.insert(indices.end(), {at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1)});
        }
    }
  }
}

std::vector<int> intsOf(const QJsonValue& v) {
  std::vector<int> out;
  for (const QJsonValue& x : v.toArray()) out.push_back(x.toInt());
  return out;
}

}  // namespace

class MasterEquivalenceTest : public QObject {
  Q_OBJECT
  QJsonObject document_;

  void compareRegions(const SurfaceRegionGraph& actual, const QJsonObject& expected) {
    const QJsonArray regions = expected["regions"].toArray();
    QCOMPARE(actual.regions.size(), static_cast<std::size_t>(regions.size()));
    QCOMPARE(actual.regionOfPatch, intsOf(expected["regionOfPatch"]));
    for (qsizetype i = 0; i < regions.size(); ++i) {
      const QJsonObject e = regions[i].toObject();
      const SurfaceRegion& a = actual.regions[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.regionId), e["regionId"].toString());
      QCOMPARE(a.regionIndex, e["regionIndex"].toInt());
      QCOMPARE(a.sourceTriangleIds, intsOf(e["sourceTriangleIds"]));
      QCOMPARE(a.patchIndexes, intsOf(e["patchIndexes"]));
      QCOMPARE(a.boundaryPatchIndexes, intsOf(e["boundaryPatchIndexes"]));
      QCOMPARE(a.adjacentRegionIndexes, intsOf(e["adjacentRegionIndexes"]));
      QCOMPARE(a.hasSharpBoundary, e["hasSharpBoundary"].toBool());
      VERIFY_CLOSE(a.areaMm2, e["areaMm2"].toDouble());
      VERIFY_CLOSE(a.normalConeHalfAngleDeg, e["normalConeHalfAngleDeg"].toDouble());
      for (int axis = 0; axis < 3; ++axis) {
        VERIFY_CLOSE(a.centroid[axis], pointOf(e["centroid"].toObject())[axis]);
        VERIFY_CLOSE(a.averageNormal[axis], pointOf(e["averageNormal"].toObject())[axis]);
      }
    }
  }

  void compareSummaries(const std::vector<SurfaceRegionAccessibilitySummary>& actual, const QJsonArray& expected) {
    QCOMPARE(actual.size(), static_cast<std::size_t>(expected.size()));
    for (qsizetype i = 0; i < expected.size(); ++i) {
      const QJsonObject e = expected[i].toObject();
      const auto& a = actual[static_cast<std::size_t>(i)];
      QCOMPARE(a.regionIndex, e["regionIndex"].toInt());
      QCOMPARE(a.hasBestDirection ? q(a.bestDirectionId) : QString(), e["bestDirectionId"].isNull() ? QString() : e["bestDirectionId"].toString());
      VERIFY_CLOSE(a.bestVisibleAreaFraction, e["bestVisibleAreaFraction"].toDouble());
      const QJsonObject fractions = e["fractions"].toObject();
      QCOMPARE(a.visibleAreaFractionByDirectionId.size(), static_cast<std::size_t>(fractions.size()));
      for (const auto& [id, value] : a.visibleAreaFractionByDirectionId) VERIFY_CLOSE(value, fractions[q(id)].toDouble());
    }
  }

 private slots:
  void initTestCase() {
    QFile file(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
    QVERIFY2(file.open(QIODevice::ReadOnly), "master-reference.json is missing");
    document_ = QJsonDocument::fromJson(file.readAll()).object();
    QCOMPARE(document_["schema"].toString(), QStringLiteral("craft.native-master-reference/1"));
  }

  void foundationMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    const QJsonArray cases = QJsonDocument::fromJson([&] {
      QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
      f.open(QIODevice::ReadOnly);
      return f.readAll();
    }()).object()["cases"].toArray();
    for (int i = 0; i < cases.size(); ++i) QTest::newRow(qPrintable(cases[i].toObject()["name"].toString())) << i;
  }

  void foundationMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = document_["cases"].toArray()[caseIndex].toObject();
    const QJsonObject input = c["input"].toObject();

    MasterSeedInput seedInput;
    MasterSeedGeometryInput& g = seedInput.sourcePartGeometry;
    g.modelId = "model-" + c["name"].toString().toStdString();
    if (input.contains("recipe")) {
      const QJsonObject recipe = input["recipe"].toObject();
      cubeGrid(recipe["segments"].toInt(), recipe["size"].toDouble(), g.positions, g.indices);
    } else {
      for (const QJsonValue& v : input["positions"].toArray()) g.positions.push_back(v.toDouble());
      for (const QJsonValue& v : input["indices"].toArray()) g.indices.push_back(static_cast<std::uint32_t>(v.toInt()));
    }
    const QJsonArray transform = input["transform"].toArray();
    for (int i = 0; i < 16; ++i) g.transform[static_cast<std::size_t>(i)] = transform[i].toDouble();
    Bounds3 local = emptyBounds();
    for (std::size_t i = 0; i < g.positions.size(); i += 3) {
      for (int a = 0; a < 3; ++a) {
        local.min[a] = std::min(local.min[a], g.positions[i + static_cast<std::size_t>(a)]);
        local.max[a] = std::max(local.max[a], g.positions[i + static_cast<std::size_t>(a)]);
      }
    }
    g.localBounds = local;
    g.geometryVersion = "geom-" + c["name"].toString().toStdString();
    g.sourceSignature = "sig-" + c["name"].toString().toStdString();
    if (input["printer"].isObject()) seedInput.printerBuildVolume = pointOf(input["printer"].toObject());
    seedInput.projectRevision = "rev-1";

    // --- seed --------------------------------------------------------------------------------
    const QJsonObject seedRef = c["seed"].toObject();
    const MasterSeedSnapshot seed = buildMasterMoldSeedSnapshot(seedInput);
    QCOMPARE(q(seed.seedId), seedRef["seedId"].toString());
    QCOMPARE(q(seed.sourceGeometryVersion), seedRef["sourceGeometryVersion"].toString());
    QCOMPARE(q(masterSeedStalenessIdentity(seed.sourceGeometryVersion, seed.printerBuildVolume, seed.processProfile, seed.userPreferences)),
             seedRef["stalenessIdentity"].toString());
    const Bounds3 refBounds = boundsOf(seedRef["bounds"]);
    for (int a = 0; a < 3; ++a) {
      VERIFY_CLOSE(seed.sourceBounds.min[a], refBounds.min[a]);
      VERIFY_CLOSE(seed.sourceBounds.max[a], refBounds.max[a]);
    }
    const MasterSeedSnapshot world = worldMeshFromSnapshot(seed);
    std::vector<double> worldAsDouble(world.sourceMesh.positions.begin(), world.sourceMesh.positions.end());
    QCOMPARE(q(finishHash(hashNumericArray(worldAsDouble))), seedRef["worldPositionsHash"].toString());

    // --- preflight -----------------------------------------------------------------------------
    const QJsonObject pf = c["preflight"].toObject();
    const MeshPreflightResult preflight = runMeshPreflight(world.sourceMesh.positions, world.sourceMesh.indices);
    QCOMPARE(q(preflight.status), pf["status"].toString());
    QCOMPARE(preflight.triangleCount, pf["triangleCount"].toInt());
    QCOMPARE(preflight.vertexCount, pf["vertexCount"].toInt());
    QCOMPARE(preflight.componentCount, pf["componentCount"].toInt());
    QCOMPARE(preflight.selfIntersectionChecked, pf["selfIntersectionChecked"].toBool());
    VERIFY_CLOSE(preflight.volumeMm3, pf["volumeMm3"].toDouble());
    const QJsonArray issues = pf["issues"].toArray();
    QCOMPARE(preflight.issues.size(), static_cast<std::size_t>(issues.size()));
    for (qsizetype i = 0; i < issues.size(); ++i) {
      const QJsonObject e = issues[i].toObject();
      const MeshPreflightIssue& a = preflight.issues[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.code), e["code"].toString());
      QCOMPARE(q(a.severity), e["severity"].toString());
      QCOMPARE(q(a.message), e["message"].toString());
      QCOMPARE(a.count, e["count"].toInt());
    }

    // --- planning mesh -------------------------------------------------------------------------
    const QJsonObject pm = c["planningMesh"].toObject();
    const PlanningMesh mesh = buildPlanningMesh(world.sourceMesh.positions, world.sourceMesh.indices, world.sourceMesh.bounds,
                                                world.sourceGeometryVersion);
    QCOMPARE(mesh.vertexCount, pm["vertexCount"].toInt());
    QCOMPARE(mesh.triangleCount, pm["triangleCount"].toInt());
    const QJsonArray patches = pm["patches"].toArray();
    QCOMPARE(mesh.patches.size(), static_cast<std::size_t>(patches.size()));
    const QJsonArray adjacency = pm["adjacency"].toArray();
    QCOMPARE(mesh.adjacency.size(), static_cast<std::size_t>(adjacency.size()));
    for (qsizetype i = 0; i < patches.size(); ++i) {
      const QJsonObject e = patches[i].toObject();
      const PlanningPatch& a = mesh.patches[static_cast<std::size_t>(i)];
      QCOMPARE(a.patchIndex, e["patchIndex"].toInt());
      QCOMPARE(a.sourceTriangle, e["sourceTriangle"].toInt());
      VERIFY_CLOSE(a.areaMm2, e["areaMm2"].toDouble());
      for (int axis = 0; axis < 3; ++axis) {
        VERIFY_CLOSE(a.centroid[axis], pointOf(e["centroid"].toObject())[axis]);
        VERIFY_CLOSE(a.normal[axis], pointOf(e["normal"].toObject())[axis]);
      }
      const QJsonArray ex = adjacency[i].toArray();
      QCOMPARE(mesh.adjacency[static_cast<std::size_t>(i)].size(), static_cast<std::size_t>(ex.size()));
      for (qsizetype n = 0; n < ex.size(); ++n) QCOMPARE(mesh.adjacency[static_cast<std::size_t>(i)][static_cast<std::size_t>(n)], ex[n].toInt());
    }
    VERIFY_CLOSE(mesh.totalAreaMm2, pm["totalAreaMm2"].toDouble());

    // --- candidate directions --------------------------------------------------------------------
    const QJsonArray directions = c["directions"].toArray();
    const std::vector<PlanningCandidateDirection> candidates = generateCandidateDirections(mesh, world.sourceMesh.positions);
    QCOMPARE(candidates.size(), static_cast<std::size_t>(directions.size()));
    for (qsizetype i = 0; i < directions.size(); ++i) {
      const QJsonObject e = directions[i].toObject();
      const PlanningCandidateDirection& a = candidates[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.directionId), e["directionId"].toString());
      QCOMPARE(q(a.source), e["source"].toString());
      QCOMPARE(q(a.origin), e["origin"].toString());
      for (int axis = 0; axis < 3; ++axis) VERIFY_CLOSE(a.vector[axis], pointOf(e["vector"].toObject())[axis]);
    }

    // --- accessibility ---------------------------------------------------------------------------
    const QJsonObject accRef = c["accessibility"].toObject();
    const AccessibilityAnalysis analysis =
        analyzeDirectionAccessibility(world.sourceMesh.positions, world.sourceMesh.indices, mesh, candidates);
    const QJsonArray perDirection = accRef["perDirection"].toArray();
    QCOMPARE(analysis.perDirection.size(), static_cast<std::size_t>(perDirection.size()));
    for (qsizetype d = 0; d < perDirection.size(); ++d) {
      const QJsonObject e = perDirection[d].toObject();
      const DirectionAccessibility& a = analysis.perDirection[static_cast<std::size_t>(d)];
      QCOMPARE(q(a.directionId), e["directionId"].toString());
      const QJsonArray visible = e["visible"].toArray(), classes = e["classification"].toArray();
      QCOMPARE(a.visible.size(), static_cast<std::size_t>(visible.size()));
      int mismatches = 0;
      for (qsizetype p = 0; p < visible.size(); ++p) {
        if (a.visible[static_cast<std::size_t>(p)] != visible[p].toInt() ||
            QLatin1String(patchAccessibilityClassName(a.classification[static_cast<std::size_t>(p)])) != classes[p].toString()) ++mismatches;
      }
      QVERIFY2(mismatches == 0, qPrintable(QStringLiteral("direction %1: %2 patch results differ").arg(q(a.directionId)).arg(mismatches)));
      VERIFY_CLOSE(a.accessibleAreaMm2, e["accessibleAreaMm2"].toDouble());
      VERIFY_CLOSE(a.inaccessibleAreaMm2, e["inaccessibleAreaMm2"].toDouble());
      QCOMPARE(a.undercutRegionCount, e["undercutRegionCount"].toInt());
      VERIFY_CLOSE(a.largestUndercutAreaMm2, e["largestUndercutAreaMm2"].toDouble());
    }
    QCOMPARE(analysis.dominantPatchOrder, intsOf(accRef["dominantPatchOrder"]));

    // --- surface regions -------------------------------------------------------------------------
    const QJsonObject surface = c["surface"].toObject();
    const SurfaceRegionGraph graph = buildSurfaceRegionGraph(mesh);
    compareRegions(graph, surface);
    const auto summaries = summarizeRegionAccessibility(graph, mesh, analysis);
    compareSummaries(summaries, surface["summaries"].toArray());
    QCOMPARE(unresolvedSurfaceRegionIndexes(summaries), intsOf(surface["unresolved"]));
    const QJsonObject refinedRef = surface["refined"].toObject();
    const RegionSubdivisionResult refined = refineRegionGraphByVisibility(graph, mesh, analysis);
    QCOMPARE(refined.subdividedRegionCount, refinedRef["subdividedRegionCount"].toInt());
    compareRegions(refined.regionGraph, refinedRef);
    compareSummaries(summarizeRegionAccessibility(refined.regionGraph, mesh, analysis), refinedRef["summaries"].toArray());

    // --- direction pruning -----------------------------------------------------------------------
    const PrunedDirections pruned = pruneDirections(candidates, analysis, mesh, 6);
    std::vector<std::string> prunedIds;
    for (const auto& d : pruned.directions) prunedIds.push_back(d.directionId);
    QStringList actualIds, expectedIds;
    for (const auto& id : prunedIds) actualIds << q(id);
    for (const QJsonValue& v : c["pruned"].toArray()) expectedIds << v.toString();
    QCOMPARE(actualIds, expectedIds);
  }
  void seedRejectsUnusableGeometry() {
    MasterSeedInput input;
    input.projectRevision = "r";
    QVERIFY_EXCEPTION_THROWN(buildMasterMoldSeedSnapshot(input), std::invalid_argument);
    input.sourcePartGeometry.positions = {0, 0, 0, 1, 0, 0, 0, 1};  // not triplets
    input.sourcePartGeometry.indices = {0, 1, 2};
    QVERIFY_EXCEPTION_THROWN(buildMasterMoldSeedSnapshot(input), std::invalid_argument);
    input.sourcePartGeometry.positions = {0, 0, 0, 1, 0, 0, 0, NAN, 0};
    input.sourcePartGeometry.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    QVERIFY_EXCEPTION_THROWN(buildMasterMoldSeedSnapshot(input), std::invalid_argument);
  }

  void identityTransformSkipsTheWorldPass() {
    MasterSeedInput input;
    input.projectRevision = "r";
    auto& g = input.sourcePartGeometry;
    g.positions = {0, 0, 0, 1, 0, 0, 0, 1, 0};
    g.indices = {0, 1, 2};
    g.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
    g.localBounds = {{0, 0, 0}, {1, 1, 0}};
    const MasterSeedSnapshot seed = buildMasterMoldSeedSnapshot(input);
    QCOMPARE(worldMeshFromSnapshot(seed).sourceMesh.positions, seed.sourceMesh.positions);
  }
};

QTEST_APPLESS_MAIN(MasterEquivalenceTest)
#include "tst_master_equivalence.moc"
