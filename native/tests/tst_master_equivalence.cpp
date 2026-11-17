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
#include "ManifoldMeshEngine.h"
#include "master/MasterEngine.h"
#include "master/MasterWorkingMoldConstructor.h"
#include "master/MasterWorkingMoldPlanner.h"
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
  void plannerMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray cases = QJsonDocument::fromJson(f.readAll()).object()["cases"].toArray();
    for (int i = 0; i < cases.size(); ++i) QTest::newRow(qPrintable(cases[i].toObject()["name"].toString())) << i;
  }

  void plannerMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = document_["cases"].toArray()[caseIndex].toObject();
    const QJsonObject input = c["input"].toObject();
    MasterSeedInput seedInput;
    MasterSeedGeometryInput& g = seedInput.sourcePartGeometry;
    g.modelId = "model-" + c["name"].toString().toStdString();
    if (input.contains("recipe")) {
      cubeGrid(input["recipe"].toObject()["segments"].toInt(), input["recipe"].toObject()["size"].toDouble(), g.positions, g.indices);
    } else {
      for (const QJsonValue& v : input["positions"].toArray()) g.positions.push_back(v.toDouble());
      for (const QJsonValue& v : input["indices"].toArray()) g.indices.push_back(static_cast<std::uint32_t>(v.toInt()));
    }
    const QJsonArray transform = input["transform"].toArray();
    for (int i = 0; i < 16; ++i) g.transform[static_cast<std::size_t>(i)] = transform[i].toDouble();
    Bounds3 local = emptyBounds();
    for (std::size_t i = 0; i < g.positions.size(); i += 3)
      for (int a = 0; a < 3; ++a) {
        local.min[a] = std::min(local.min[a], g.positions[i + static_cast<std::size_t>(a)]);
        local.max[a] = std::max(local.max[a], g.positions[i + static_cast<std::size_t>(a)]);
      }
    g.localBounds = local;
    g.geometryVersion = "geom-" + c["name"].toString().toStdString();
    seedInput.projectRevision = "rev-1";
    const MasterSeedSnapshot world = worldMeshFromSnapshot(buildMasterMoldSeedSnapshot(seedInput));
    const PlanningMesh mesh = buildPlanningMesh(world.sourceMesh.positions, world.sourceMesh.indices, world.sourceMesh.bounds, world.sourceGeometryVersion);
    const auto candidates = generateCandidateDirections(mesh, world.sourceMesh.positions);
    const AccessibilityAnalysis raw = analyzeDirectionAccessibility(world.sourceMesh.positions, world.sourceMesh.indices, mesh, candidates);
    const AccessibilityAnalysis pruned32 = pruneDirections(raw.directions, raw, mesh, 32).analysis;
    const QJsonObject ref = c["planner"].toObject();
    const AdaptiveDirectionDiscoveryResult discovery =
        runAdaptiveDirectionDiscovery(mesh, world.sourceMesh.positions, world.sourceMesh.indices, pruned32);
    const AccessibilityAnalysis analysis = discovery.analysis;
    const QJsonObject discoveryRef = ref["discovery"].toObject();
    QCOMPARE(discovery.roundsRun, discoveryRef["roundsRun"].toInt());
    const QJsonArray discovered = discoveryRef["discovered"].toArray();
    QCOMPARE(discovery.discoveredDirections.size(), static_cast<std::size_t>(discovered.size()));
    for (qsizetype i = 0; i < discovered.size(); ++i) {
      const QJsonObject e = discovered[i].toObject();
      const auto& a = discovery.discoveredDirections[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.directionId), e["directionId"].toString());
      QCOMPARE(q(a.origin), e["origin"].toString());
      for (int axis = 0; axis < 3; ++axis) VERIFY_CLOSE(a.vector[axis], pointOf(e["vector"].toObject())[axis]);
    }

    QStringList ids, expectedIds;
    for (const auto& d : analysis.directions) ids << q(d.directionId);
    for (const QJsonValue& v : ref["directionIds"].toArray()) expectedIds << v.toString();
    QCOMPARE(ids, expectedIds);

    // thresholds per direction
    const SurfaceRegionGraph refined = refineRegionGraphByVisibility(buildSurfaceRegionGraph(mesh), mesh, analysis).regionGraph;
    const QJsonArray thresholds = ref["thresholds"].toArray();
    for (std::size_t d = 0; d < analysis.directions.size(); ++d) {
      std::vector<std::uint8_t> opposing(mesh.patches.size(), 0);
      for (std::size_t j = 0; j < analysis.directions.size(); ++j) {
        if (j == d) continue;
        const Point3& v = analysis.directions[d].vector;
        const Point3& o = analysis.directions[j].vector;
        if (v.x * o.x + v.y * o.y + v.z * o.z < -0.999) { opposing = analysis.perDirection[j].visible; break; }
      }
      const auto actual = candidatePartingThresholds(mesh, analysis.perDirection[d].visible, opposing, analysis.directions[d].vector, refined);
      const QJsonArray expected = thresholds[static_cast<qsizetype>(d)].toArray();
      QCOMPARE(actual.size(), static_cast<std::size_t>(expected.size()));
      for (qsizetype i = 0; i < expected.size(); ++i) VERIFY_CLOSE(actual[static_cast<std::size_t>(i)], expected[i].toDouble());
    }

    // greedy cover
    const RegionSetCoverResult cover = greedyRegionCover(refined, mesh, analysis);
    const QJsonObject coverRef = ref["cover"].toObject();
    QCOMPARE(cover.totalRegionCount, coverRef["totalRegionCount"].toInt());
    QCOMPARE(cover.uncoveredRegionIndexes, intsOf(coverRef["uncoveredRegionIndexes"]));
    const QJsonArray coverSteps = coverRef["steps"].toArray();
    QCOMPARE(cover.steps.size(), static_cast<std::size_t>(coverSteps.size()));
    for (qsizetype i = 0; i < coverSteps.size(); ++i) {
      const QJsonObject e = coverSteps[i].toObject();
      QCOMPARE(q(cover.steps[static_cast<std::size_t>(i)].directionId), e["directionId"].toString());
      QCOMPARE(cover.steps[static_cast<std::size_t>(i)].newlyCoveredRegionCount, e["newlyCoveredRegionCount"].toInt());
      QCOMPARE(cover.steps[static_cast<std::size_t>(i)].cumulativeCoveredRegionCount, e["cumulativeCoveredRegionCount"].toInt());
    }

    // piece-count search
    WorkingMoldPlannerInput plannerInput{mesh, analysis, 6};
    WorkingMoldPieceCountSearch search(plannerInput);
    QCOMPARE(search.subdividedRegionCount(), ref["subdividedRegionCount"].toInt());
    QCOMPARE(static_cast<int>(search.regionGraph().regions.size()), ref["searchRegionCount"].toInt());
    const QJsonArray steps = ref["steps"].toArray();
    for (qsizetype s = 0; s < steps.size(); ++s) {
      const QJsonObject e = steps[s].toObject();
      const auto step = search.next();
      QVERIFY2(step.has_value(), "native search ended early");
      QCOMPARE(step->pieceCount, e["pieceCount"].toInt());
      QCOMPARE(step->rejectionReason.has_value(), !e["rejectionReason"].isNull());
      if (step->rejectionReason) QCOMPARE(q(*step->rejectionReason), e["rejectionReason"].toString());
      const QJsonObject d = e["diagnostics"].toObject();
      QCOMPARE(step->diagnostics.planningCandidatesGenerated, d["planningCandidatesGenerated"].toInt());
      QCOMPARE(step->diagnostics.planningCandidatesFeasible, d["planningCandidatesFeasible"].toInt());
      QCOMPARE(step->diagnostics.bestUnassignablePatchCount.has_value(), !d["bestUnassignablePatchCount"].isNull());
      if (step->diagnostics.bestUnassignablePatchCount) QCOMPARE(*step->diagnostics.bestUnassignablePatchCount, d["bestUnassignablePatchCount"].toInt());
      QCOMPARE(step->diagnostics.bestUnresolvedRegionCount.has_value(), !d["bestUnresolvedRegionCount"].isNull());
      if (step->diagnostics.bestUnresolvedRegionCount) QCOMPARE(*step->diagnostics.bestUnresolvedRegionCount, d["bestUnresolvedRegionCount"].toInt());
      QCOMPARE(step->diagnostics.combinationDirectionCountUsed, d["combinationDirectionCountUsed"].toInt());
      QCOMPARE(step->diagnostics.thresholdCountUsed, d["thresholdCountUsed"].toInt());
      QCOMPARE(step->diagnostics.beamSizeUsed, d["beamSizeUsed"].toInt());
      QCOMPARE(step->diagnostics.regionSetCoverUncoveredRegionCount, d["regionSetCoverUncoveredRegionCount"].toInt());
      QCOMPARE(step->diagnostics.regionSetCoverMinimumPieceEstimate.has_value(), !d["regionSetCoverMinimumPieceEstimate"].isNull());

      const QJsonArray finalists = e["finalists"].toArray();
      QCOMPARE(step->finalists.size(), static_cast<std::size_t>(finalists.size()));
      for (qsizetype f = 0; f < finalists.size(); ++f) {
        const QJsonObject fe = finalists[f].toObject();
        const WorkingMoldDecompositionFinalist& fa = step->finalists[static_cast<std::size_t>(f)];
        const QJsonObject ce = fe["candidate"].toObject();
        QCOMPARE(fa.candidate.pieceCount, ce["pieceCount"].toInt());
        QCOMPARE(fa.candidate.feasible, ce["feasible"].toBool());
        QCOMPARE(fa.candidate.unassignablePatchCount, ce["unassignablePatchCount"].toInt());
        VERIFY_CLOSE(fa.candidate.score, ce["score"].toDouble());
        const QJsonObject sb = ce["scoreBreakdown"].toObject();
        VERIFY_CLOSE(fa.candidate.scoreBreakdown.slidingWallAreaMm2, sb["slidingWallAreaMm2"].toDouble());
        QCOMPARE(fa.candidate.scoreBreakdown.seamCrossingCount, sb["seamCrossingCount"].toInt());
        VERIFY_CLOSE(fa.candidate.scoreBreakdown.areaImbalance, sb["areaImbalance"].toDouble());
        QCOMPARE(fa.candidate.scoreBreakdown.interfaceCount, sb["interfaceCount"].toInt());
        const QJsonArray pieces = ce["pieces"].toArray();
        QCOMPARE(fa.candidate.pieces.size(), static_cast<std::size_t>(pieces.size()));
        for (qsizetype p = 0; p < pieces.size(); ++p) {
          const QJsonObject pe = pieces[p].toObject();
          const auto& pa = fa.candidate.pieces[static_cast<std::size_t>(p)];
          QCOMPARE(q(pa.directionId), pe["directionId"].toString());
          for (int axis = 0; axis < 3; ++axis) VERIFY_CLOSE(pa.releaseDirection[axis], pointOf(pe["releaseDirection"].toObject())[axis]);
          QCOMPARE(pa.prism.has_value(), pe["prism"].isObject());
          if (pa.prism) {
            QCOMPARE(pa.prism->directionIndex, pe["prism"].toObject()["directionIndex"].toInt());
            VERIFY_CLOSE(pa.prism->offsetMm, pe["prism"].toObject()["offsetMm"].toDouble());
          }
        }
        QCOMPARE(fa.patchAssignment, intsOf(fe["patchAssignment"]));
        const QJsonArray ifaces = fe["interfaces"].toArray();
        QCOMPARE(fa.interfaces.size(), static_cast<std::size_t>(ifaces.size()));
        for (qsizetype i = 0; i < ifaces.size(); ++i) {
          const QJsonObject ie = ifaces[i].toObject();
          const auto& ia = fa.interfaces[static_cast<std::size_t>(i)];
          QCOMPARE(q(ia.interfaceId), ie["interfaceId"].toString());
          QCOMPARE(ia.pieceAIndex, ie["pieceAIndex"].toInt());
          QCOMPARE(ia.pieceBIndex, ie["pieceBIndex"].toInt());
          QCOMPARE(q(ia.kind), ie["kind"].toString());
          QCOMPARE(ia.selfIntersecting, ie["selfIntersecting"].toBool());
          const QJsonArray pts = ie["samplePoints"].toArray();
          QCOMPARE(ia.samplePoints.size(), static_cast<std::size_t>(pts.size()));
          for (qsizetype k = 0; k < pts.size(); ++k)
            for (int axis = 0; axis < 3; ++axis) VERIFY_CLOSE(ia.samplePoints[static_cast<std::size_t>(k)][axis], pointOf(pts[k].toObject())[axis]);
        }
      }
    }
    QVERIFY2(!search.next().has_value(), "native search produced extra steps");

    // single-shot plan
    const auto plan = planWorkingMoldDecomposition(plannerInput);
    QCOMPARE(plan.has_value(), ref["plan"].isObject());
    if (plan) {
      const QJsonObject pr = ref["plan"].toObject();
      QCOMPARE(plan->candidate.pieceCount, pr["pieceCount"].toInt());
      VERIFY_CLOSE(plan->candidate.score, pr["score"].toDouble());
      QCOMPARE(static_cast<int>(plan->finalists.size()), pr["finalistCount"].toInt());
      QCOMPARE(plan->rejectedPieceCounts.size(), static_cast<std::size_t>(pr["rejectedPieceCounts"].toArray().size()));
    }
  }

  void constructionMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray cases = QJsonDocument::fromJson(f.readAll()).object()["cases"].toArray();
    for (int i = 0; i < cases.size(); ++i) QTest::newRow(qPrintable(cases[i].toObject()["name"].toString())) << i;
  }

  void constructionMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = document_["cases"].toArray()[caseIndex].toObject();
    const QJsonObject input = c["input"].toObject();
    MasterSeedInput seedInput;
    MasterSeedGeometryInput& g = seedInput.sourcePartGeometry;
    g.modelId = "model-" + c["name"].toString().toStdString();
    if (input.contains("recipe")) {
      cubeGrid(input["recipe"].toObject()["segments"].toInt(), input["recipe"].toObject()["size"].toDouble(), g.positions, g.indices);
    } else {
      for (const QJsonValue& v : input["positions"].toArray()) g.positions.push_back(v.toDouble());
      for (const QJsonValue& v : input["indices"].toArray()) g.indices.push_back(static_cast<std::uint32_t>(v.toInt()));
    }
    const QJsonArray transform = input["transform"].toArray();
    for (int i = 0; i < 16; ++i) g.transform[static_cast<std::size_t>(i)] = transform[i].toDouble();
    Bounds3 local = emptyBounds();
    for (std::size_t i = 0; i < g.positions.size(); i += 3)
      for (int a = 0; a < 3; ++a) {
        local.min[a] = std::min(local.min[a], g.positions[i + static_cast<std::size_t>(a)]);
        local.max[a] = std::max(local.max[a], g.positions[i + static_cast<std::size_t>(a)]);
      }
    g.localBounds = local;
    g.geometryVersion = "geom-" + c["name"].toString().toStdString();
    seedInput.projectRevision = "rev-1";
    const MasterSeedSnapshot world = worldMeshFromSnapshot(buildMasterMoldSeedSnapshot(seedInput));
    const PlanningMesh mesh = buildPlanningMesh(world.sourceMesh.positions, world.sourceMesh.indices, world.sourceMesh.bounds, world.sourceGeometryVersion);
    const auto candidates = generateCandidateDirections(mesh, world.sourceMesh.positions);
    const AccessibilityAnalysis raw = analyzeDirectionAccessibility(world.sourceMesh.positions, world.sourceMesh.indices, mesh, candidates);
    const AccessibilityAnalysis analysis =
        runAdaptiveDirectionDiscovery(mesh, world.sourceMesh.positions, world.sourceMesh.indices, pruneDirections(raw.directions, raw, mesh, 32).analysis).analysis;

    const QJsonObject ref = c["planner"].toObject();
#ifndef NDEBUG
    // A 50,000-triangle part makes every translation sweep a full Boolean; the Debug kernel needs minutes where the
    // optimized reference needs seconds. The Release build runs this row (see EXECUTION_LOG).
    if (c["name"].toString() == QLatin1String("cube-grid-large")) QSKIP("heavy construction row runs in Release builds only");
#endif
    const QJsonArray expectedAttempts = ref["constructionAttempts"].toArray();
    auto engine = createManifoldMeshEngine();
    WorkingMoldPieceCountSearch search({mesh, analysis, 6});
    std::optional<WorkingMoldConstructionOutput> built;
    qsizetype attemptIndex = 0;
    for (;;) {
      auto step = search.next();
      if (!step) break;
      for (std::size_t fi = 0; fi < step->finalists.size() && !built; ++fi) {
        WorkingMoldConstructionInput in;
        in.sourcePositions = world.sourceMesh.positions;
        in.sourceIndices = world.sourceMesh.indices;
        in.sourceBounds = world.sourceBounds;
        in.releaseClearanceMm = world.processProfile.releaseClearanceMm.value_or(0);
        in.minimumToolingWallMm = world.processProfile.minimumToolingWallMm;
        for (const auto& piece : step->finalists[fi].candidate.pieces) {
          PlannedPieceRegion region;
          region.releaseDirection = piece.releaseDirection;
          if (piece.prism) region.plane = PlannedPieceRegion::Plane{analysis.directions[static_cast<std::size_t>(piece.prism->directionIndex)].vector, piece.prism->offsetMm};
          in.pieces.push_back(region);
        }
        QVERIFY2(attemptIndex < expectedAttempts.size(), "native made more construction attempts than the reference");
        const QJsonObject expected = expectedAttempts[attemptIndex++].toObject();
        QCOMPARE(step->pieceCount, expected["pieceCount"].toInt());
        QCOMPARE(static_cast<int>(fi), expected["finalistIndex"].toInt());
        try {
          built = constructWorkingMold(*engine, in);
          QVERIFY2(expected["ok"].toBool(), "native constructed a mold the reference rejected");
        } catch (const std::runtime_error& error) {
          QVERIFY2(!expected["ok"].toBool(), qPrintable(QStringLiteral("native rejected a mold the reference built: %1").arg(error.what())));
          QCOMPARE(QString::fromUtf8(error.what()), expected["error"].toString());
        }
      }
      if (built) break;
    }
    QCOMPARE(attemptIndex, expectedAttempts.size());
    QCOMPARE(built.has_value(), ref["construction"].isObject());
    if (!built) return;

    const QJsonObject cr = ref["construction"].toObject();
    const QJsonArray pieces = cr["pieces"].toArray();
    QCOMPARE(built->pieces.size(), static_cast<std::size_t>(pieces.size()));
    for (qsizetype i = 0; i < pieces.size(); ++i) {
      const QJsonObject e = pieces[i].toObject();
      const WorkingMoldPieceTarget& a = built->pieces[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.pieceId), e["pieceId"].toString());
      QCOMPARE(q(a.name), e["name"].toString());
      VERIFY_CLOSE(a.volumeMm3, e["volumeMm3"].toDouble());
      QCOMPARE(a.triangleCount, e["triangleCount"].toInt());
      QCOMPARE(static_cast<int>(a.mesh.vertexCount()), e["vertexCount"].toInt());
      QCOMPARE(a.watertight, e["watertight"].toBool());
      QCOMPARE(a.manifold, e["manifold"].toBool());
      QCOMPARE(a.releaseOrder, e["releaseOrder"].toInt());
      const Bounds3 eb = boundsOf(e["bounds"]);
      for (int axis = 0; axis < 3; ++axis) {
        VERIFY_CLOSE(a.bounds.min[axis], eb.min[axis]);
        VERIFY_CLOSE(a.bounds.max[axis], eb.max[axis]);
        VERIFY_CLOSE(a.assignedDirection[axis], pointOf(e["assignedDirection"].toObject())[axis]);
      }
    }
    const QJsonArray steps = cr["releaseSequence"].toArray();
    QCOMPARE(built->releaseSequence.size(), static_cast<std::size_t>(steps.size()));
    for (qsizetype i = 0; i < steps.size(); ++i) {
      const QJsonObject e = steps[i].toObject();
      const auto& a = built->releaseSequence[static_cast<std::size_t>(i)];
      QCOMPARE(a.stepIndex, e["stepIndex"].toInt());
      QCOMPARE(a.pieceIndex, e["pieceIndex"].toInt());
      VERIFY_CLOSE(a.clearanceDistanceMm, e["clearanceDistanceMm"].toDouble());
      QCOMPARE(a.collisionVerified, e["collisionVerified"].toBool());
      for (int axis = 0; axis < 3; ++axis) VERIFY_CLOSE(a.direction[axis], pointOf(e["direction"].toObject())[axis]);
    }
    QCOMPARE(built->releaseSweepCount, cr["releaseSweepCount"].toInt());
    const QJsonObject rp = cr["registrationPlan"].toObject();
    QCOMPARE(built->registrationPlan.reason.has_value(), !rp["reason"].isNull());
    if (built->registrationPlan.reason) QCOMPARE(q(*built->registrationPlan.reason), rp["reason"].toString());
    const QJsonArray features = rp["features"].toArray();
    QCOMPARE(built->registrationPlan.features.size(), static_cast<std::size_t>(features.size()));
    for (qsizetype i = 0; i < features.size(); ++i) {
      const QJsonObject e = features[i].toObject();
      const auto& a = built->registrationPlan.features[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.featureId), e["featureId"].toString());
      QCOMPARE(q(a.interfaceId), e["interfaceId"].toString());
      QCOMPARE(a.malePieceIndex, e["malePieceIndex"].toInt());
      QCOMPARE(a.femalePieceIndex, e["femalePieceIndex"].toInt());
      for (int axis = 0; axis < 3; ++axis) {
        VERIFY_CLOSE(a.position[axis], pointOf(e["position"].toObject())[axis]);
        VERIFY_CLOSE(a.direction[axis], pointOf(e["direction"].toObject())[axis]);
      }
    }
  }

  void engineMatchesReference_data() {
    QTest::addColumn<int>("caseIndex");
    QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
    f.open(QIODevice::ReadOnly);
    const QJsonArray cases = QJsonDocument::fromJson(f.readAll()).object()["cases"].toArray();
    for (int i = 0; i < cases.size(); ++i) QTest::newRow(qPrintable(cases[i].toObject()["name"].toString())) << i;
  }

  void engineMatchesReference() {
    QFETCH(int, caseIndex);
    const QJsonObject c = document_["cases"].toArray()[caseIndex].toObject();
    const QJsonObject ref = c["engine"].toObject();
#ifndef NDEBUG
    // These parts need many exact Boolean sweeps (a 50k-triangle part, or a long rejected-split search that mirrors the
    // reference); the Debug kernel exceeds Qt's per-test limit. The Release build runs every row (see EXECUTION_LOG).
    static const QStringList heavy{"cube-grid-large", "dumbbell", "torus", "cross-blind-holes", "grooved-sphere"};
    if (heavy.contains(c["name"].toString())) QSKIP("heavy engine row runs in Release builds only");
#endif
    const QJsonObject input = c["input"].toObject();
    MasterSeedInput seedInput;
    MasterSeedGeometryInput& g = seedInput.sourcePartGeometry;
    g.modelId = "model-" + c["name"].toString().toStdString();
    if (input.contains("recipe")) {
      cubeGrid(input["recipe"].toObject()["segments"].toInt(), input["recipe"].toObject()["size"].toDouble(), g.positions, g.indices);
    } else {
      for (const QJsonValue& v : input["positions"].toArray()) g.positions.push_back(v.toDouble());
      for (const QJsonValue& v : input["indices"].toArray()) g.indices.push_back(static_cast<std::uint32_t>(v.toInt()));
    }
    const QJsonArray transform = input["transform"].toArray();
    for (int i = 0; i < 16; ++i) g.transform[static_cast<std::size_t>(i)] = transform[i].toDouble();
    Bounds3 local = emptyBounds();
    for (std::size_t i = 0; i < g.positions.size(); i += 3)
      for (int a = 0; a < 3; ++a) {
        local.min[a] = std::min(local.min[a], g.positions[i + static_cast<std::size_t>(a)]);
        local.max[a] = std::max(local.max[a], g.positions[i + static_cast<std::size_t>(a)]);
      }
    g.localBounds = local;
    g.geometryVersion = "geom-" + c["name"].toString().toStdString();
    if (input["printer"].isObject()) seedInput.printerBuildVolume = pointOf(input["printer"].toObject());
    seedInput.projectRevision = "rev-1";
    const MasterSeedSnapshot seed = worldMeshFromSnapshot(buildMasterMoldSeedSnapshot(seedInput));

    auto engine = createManifoldMeshEngine();
    const MasterMoldEngineResult result = runMasterMoldEngine(*engine, seed);
    const bool exact = !result.unportedPathsReached;  // no reference path was skipped
    if (qEnvironmentVariableIsSet("CRAFT_MASTER_TRACE")) {
      for (const auto& s : result.toolingSets) {
        qInfo().noquote() << "native set" << q(s.moldPartId) << q(s.releaseMode) << "face" << (s.pourFaceDecision.selected ? masterDirName(*s.pourFaceDecision.selected) : "-")
                          << "pieces" << s.assembly.pieces.size() << "pins" << s.assembly.registrationFeatures.size()
                          << "surface" << (s.partingSurfaces.empty() ? "-" : q(s.partingSurfaces[0].axis) + "@" + QString::number(s.partingSurfaces[0].coordinateMm) + " " + q(s.partingSurfaces[0].origin));
      }
      qInfo().noquote() << "native budget onePiece" << result.budget.toolingOnePieceAttempts << "multi" << result.budget.toolingMultiPieceAttempts
                        << "exact" << result.budget.toolingExactPlanAttempts << "unported" << result.unportedPaths.size();
    }

    // failures
    const QJsonArray failures = ref["failures"].toArray();
    if (exact || failures.size() > 0) {
      QCOMPARE(result.failures.size(), static_cast<std::size_t>(failures.size()));
      for (qsizetype i = 0; i < failures.size(); ++i) {
        QCOMPARE(q(result.failures[static_cast<std::size_t>(i)].moldPartId), failures[i].toObject()["moldPartId"].toString());
        QCOMPARE(q(result.failures[static_cast<std::size_t>(i)].reason), failures[i].toObject()["reason"].toString());
        QCOMPARE(q(result.failures[static_cast<std::size_t>(i)].family), failures[i].toObject()["family"].toString());
        // The quoted attempt count includes the reference
      }
    }
    QCOMPARE(result.plan.has_value(), ref["plan"].isObject());
    QCOMPARE(result.debugSnapshot.has_value(), ref["debugSnapshot"].isObject());

    // planning diagnostics + debug snapshot
    if (!ref["planningDiagnostics"].toArray().isEmpty()) {
      const QJsonArray diags = ref["planningDiagnostics"].toArray();
      QCOMPARE(result.planningDiagnostics.size(), static_cast<std::size_t>(diags.size()));
      for (qsizetype i = 0; i < diags.size(); ++i) {
        const QJsonObject d = diags[i].toObject();
        const auto& a = result.planningDiagnostics[static_cast<std::size_t>(i)];
        QCOMPARE(a.pieceCount, d["pieceCount"].toInt());
        QCOMPARE(a.planningCandidatesGenerated, d["planningCandidatesGenerated"].toInt());
        QCOMPARE(a.planningCandidatesFeasible, d["planningCandidatesFeasible"].toInt());
        QCOMPARE(a.rejectionReason.has_value(), !d["rejectionReason"].isNull());
        if (a.rejectionReason) QCOMPARE(q(*a.rejectionReason), d["rejectionReason"].toString());
      }
    }
    if (result.debugSnapshot) {
      const QJsonObject s = ref["debugSnapshot"].toObject();
      const auto& a = *result.debugSnapshot;
      QCOMPARE(q(a.sourceValidity), s["sourceValidity"].toString());
      QCOMPARE(a.regionCount, s["regionCount"].toInt());
      QCOMPARE(a.candidateDirectionCount, s["candidateDirectionCount"].toInt());
      QCOMPARE(a.regionRefinementCount, s["regionRefinementCount"].toInt());
      QCOMPARE(a.totalRegions, s["coverageMatrixSummary"].toObject()["totalRegions"].toInt());
      QCOMPARE(a.uncoveredRegionCount, s["coverageMatrixSummary"].toObject()["uncoveredRegionCount"].toInt());
      QCOMPARE(a.uncoveredRegionIndexes, intsOf(s["uncoveredRegionIndexes"]));
      QCOMPARE(a.pieceCountAttempts, intsOf(s["pieceCountAttempts"]));
      if (exact) QCOMPARE(a.exactConstructionAttempts, s["exactConstructionAttempts"].toInt());
      QCOMPARE(a.selectedPieceCount.has_value(), !s["selectedPieceCount"].isNull());
      if (a.selectedPieceCount) QCOMPARE(*a.selectedPieceCount, s["selectedPieceCount"].toInt());
      QCOMPARE(a.releaseSweepCount.has_value(), !s["releaseSweepCount"].isNull());
      if (a.releaseSweepCount) QCOMPARE(*a.releaseSweepCount, s["releaseSweepCount"].toInt());
    }

    // budget details (always: planning is fully ported)
    const QJsonObject bud = ref["budget"].toObject();
    QCOMPARE(result.budget.planningPatchCount, bud["planningPatchCount"].toInt());
    QCOMPARE(result.budget.candidateDirectionCount, bud["candidateDirectionCount"].toInt());
    QCOMPARE(result.budget.workingMoldPlanCandidateCount, bud["workingMoldPlanCandidateCount"].toInt());
    // Attempt counts include the reference
    if (exact) {
      QCOMPARE(result.budget.pourFaceAnalysisAttempts, bud["pourFaceAnalysisAttempts"].toInt());
      QCOMPARE(result.budget.ventAnalysisAttempts, bud["ventAnalysisAttempts"].toInt());
      QCOMPARE(result.budget.toolingOnePieceAttempts, bud["toolingOnePieceAttempts"].toInt());
      QCOMPARE(result.budget.toolingMultiPieceAttempts, bud["toolingMultiPieceAttempts"].toInt());
      QCOMPARE(result.budget.toolingExactPlanAttempts, bud["toolingExactPlanAttempts"].toInt());
      QCOMPARE(result.budget.releaseVerificationAttempts, bud["releaseVerificationAttempts"].toInt());
    }

    // plan
    std::set<QString> tessellationDiffers;
    if (result.plan) {
      const QJsonObject plan = ref["plan"].toObject();
      const QJsonArray pieces = plan["pieces"].toArray();
      QCOMPARE(result.plan->moldPieces.size(), static_cast<std::size_t>(pieces.size()));
      for (qsizetype i = 0; i < pieces.size(); ++i) {
        const QJsonObject e = pieces[i].toObject();
        const auto& a = result.plan->moldPieces[static_cast<std::size_t>(i)];
        QCOMPARE(q(a.pieceId), e["pieceId"].toString());
        VERIFY_CLOSE(a.volumeMm3, e["volumeMm3"].toDouble());
        QCOMPARE(a.triangleCount, e["triangleCount"].toInt());
        QCOMPARE(a.releaseOrder, e["releaseOrder"].toInt());
        {
          // Vertex positions must be bit-identical. Triangle connectivity may legitimately differ: the kernel builds
          // differ in how they triangulate coplanar faces with holes (the pin faces) -- see DECISIONS D-029.
          const std::vector<double> idx(a.mesh.indices.begin(), a.mesh.indices.end());
          QCOMPARE(q(finishHash(hashNumericArray(a.mesh.positions))), e["positionsHash"].toString());
          if (q(finishHash(hashNumericArray(idx))) != e["indicesHash"].toString()) tessellationDiffers.insert(q(a.pieceId));
        }
        const Bounds3 eb = boundsOf(e["bounds"]);
        for (int axis = 0; axis < 3; ++axis) { VERIFY_CLOSE(a.bounds.min[axis], eb.min[axis]); VERIFY_CLOSE(a.bounds.max[axis], eb.max[axis]); }
      }
      QCOMPARE(result.plan->partingInterfaces.size(), static_cast<std::size_t>(plan["interfaces"].toArray().size()));
      QCOMPARE(result.plan->releaseSequence.size(), static_cast<std::size_t>(plan["releaseSequence"].toArray().size()));
      QCOMPARE(result.plan->registrationPlan.features.size(), static_cast<std::size_t>(plan["registrationPlan"].toObject()["features"].toArray().size()));
      const QJsonArray planWarnings = plan["warnings"].toArray();
      QCOMPARE(result.plan->warnings.size(), static_cast<std::size_t>(planWarnings.size()));
      for (qsizetype i = 0; i < planWarnings.size(); ++i) {
        QCOMPARE(q(result.plan->warnings[static_cast<std::size_t>(i)].code), planWarnings[i].toObject()["code"].toString());
        QCOMPARE(q(result.plan->warnings[static_cast<std::size_t>(i)].message), planWarnings[i].toObject()["message"].toString());
      }
      QCOMPARE(result.plan->rejectedPieceCounts.size(), static_cast<std::size_t>(plan["rejectedPieceCounts"].toArray().size()));
    }

    // tooling sets: compared piece by piece; a reference set that needed the multi-piece planner is only
    // checked to be flagged as an unported path natively.
    const QJsonArray sets = ref["toolingSets"].toArray();
    QCOMPARE(result.toolingSets.size(), static_cast<std::size_t>(sets.size()));
    for (qsizetype i = 0; i < sets.size(); ++i) {
      const QJsonObject e = sets[i].toObject();
      const MasterToolingSet& a = result.toolingSets[static_cast<std::size_t>(i)];
      QCOMPARE(q(a.moldPartId), e["moldPartId"].toString());
      QCOMPARE(q(a.moldPartName), e["moldPartName"].toString());
      const QJsonObject pf = e["pourFaceDecision"].toObject();
      // Pour-face planning and accessibility never depend on the unported paths.
      QCOMPARE(a.pourFaceDecision.candidates.size(), static_cast<std::size_t>(pf["candidates"].toArray().size()));
      for (qsizetype k = 0; k < pf["candidates"].toArray().size(); ++k) {
        const QJsonObject ce = pf["candidates"].toArray()[k].toObject();
        const auto& ca = a.pourFaceDecision.candidates[static_cast<std::size_t>(k)];
        QCOMPARE(QString::fromLatin1(masterDirName(ca.direction)), ce["direction"].toString());
        QCOMPARE(q(ca.source), ce["source"].toString());
        QCOMPARE(ca.valid, ce["valid"].toBool());
        VERIFY_CLOSE(ca.exposedOpeningAreaMm2, ce["exposedOpeningAreaMm2"].toDouble());
        VERIFY_CLOSE(ca.castingDepthMm, ce["castingDepthMm"].toDouble());
        QCOMPARE(ca.rejectionReason.has_value(), !ce["rejectionReason"].isNull());
        if (ca.rejectionReason) QCOMPARE(q(*ca.rejectionReason), ce["rejectionReason"].toString());
        if (ca.valid) VERIFY_CLOSE(ca.score, ce["score"].toDouble());
      }
      QStringList wa, we;
      for (const auto& w : a.pourFaceDecision.fillabilityWarnings) wa << q(w);
      for (const QJsonValue& w : pf["fillabilityWarnings"].toArray()) we << w.toString();
      QCOMPARE(wa, we);
      const QJsonArray acc = e["accessibility"].toObject()["directions"].toArray();
      QCOMPARE(a.accessibility.directions.size(), static_cast<std::size_t>(acc.size()));
      // Accessibility samples individual triangles, so a different triangulation of the same surface moves a
      // fraction by at most a sample or two; identical meshes must agree to rounding.
      const bool tessellation = tessellationDiffers.count(q(a.moldPartId)) > 0;
      for (qsizetype k = 0; k < acc.size(); ++k) {
        const double nf = a.accessibility.directions[static_cast<std::size_t>(k)].accessibilityFraction, rf = acc[k].toObject()["accessibilityFraction"].toDouble();
        if (tessellation) {
          QVERIFY2(std::fabs(nf - rf) <= 0.02, qPrintable(QStringLiteral("accessibility %1 vs %2 (triangulation differs)").arg(nf).arg(rf)));
        } else {
          VERIFY_CLOSE(nf, rf);
          VERIFY_CLOSE(a.accessibility.directions[static_cast<std::size_t>(k)].undercutAreaMm2, acc[k].toObject()["undercutAreaMm2"].toDouble());
        }
      }
      if (!tessellation) QCOMPARE(a.accessibility.onePieceReleaseFeasible, e["accessibility"].toObject()["onePieceReleaseFeasible"].toBool());
      QCOMPARE(q(a.releaseMode), e["releaseMode"].toString());
      QCOMPARE(q(a.assembly.coreMode), e["coreMode"].toString());
      const QJsonArray surfaces = e["partingSurfaces"].toArray();
      QCOMPARE(a.partingSurfaces.size(), static_cast<std::size_t>(surfaces.size()));
      for (qsizetype k = 0; k < surfaces.size(); ++k) {
        const QJsonObject se = surfaces[k].toObject();
        const auto& sa = a.partingSurfaces[static_cast<std::size_t>(k)];
        QCOMPARE(q(sa.kind), se["kind"].toString());
        QCOMPARE(q(sa.axis), se["axis"].toString());
        QCOMPARE(q(sa.origin), se["origin"].toString());
        VERIFY_CLOSE(sa.coordinateMm, se["coordinateMm"].toDouble());
        QCOMPARE(sa.planeNormal.has_value(), se["planeNormal"].isObject());
      }
      const QJsonArray regs = e["registrationFeatures"].toArray();
      QCOMPARE(a.assembly.registrationFeatures.size(), static_cast<std::size_t>(regs.size()));
      for (qsizetype k = 0; k < regs.size(); ++k) {
        QCOMPARE(q(a.assembly.registrationFeatures[static_cast<std::size_t>(k)].featureId), regs[k].toObject()["featureId"].toString());
        QCOMPARE(q(a.assembly.registrationFeatures[static_cast<std::size_t>(k)].malePieceId), regs[k].toObject()["malePieceId"].toString());
        QCOMPARE(q(a.assembly.registrationFeatures[static_cast<std::size_t>(k)].femalePieceId), regs[k].toObject()["femalePieceId"].toString());
      }
      QCOMPARE(QString::fromLatin1(masterDirName(*a.pourFaceDecision.selected)), pf["selected"].toString());
      QCOMPARE(q(a.pourFaceDecision.ventPlan.status), pf["ventPlan"].toObject()["status"].toString());
      QCOMPARE(a.pourFaceDecision.ventPlan.features.size(), static_cast<std::size_t>(pf["ventPlan"].toObject()["features"].toArray().size()));
      const QJsonArray pieces = e["pieces"].toArray();
      QCOMPARE(a.assembly.pieces.size(), static_cast<std::size_t>(pieces.size()));
      for (qsizetype k = 0; k < pieces.size(); ++k) {
        const QJsonObject pe = pieces[k].toObject();
        const auto& pa = a.assembly.pieces[static_cast<std::size_t>(k)];
        QCOMPARE(q(pa.pieceId), pe["pieceId"].toString());
        QCOMPARE(q(pa.name), pe["name"].toString());
        VERIFY_CLOSE(pa.volumeMm3, pe["volumeMm3"].toDouble());
        QCOMPARE(pa.triangleCount, pe["triangleCount"].toInt());
        QCOMPARE(static_cast<int>(pa.mesh.vertexCount()), pe["vertexCount"].toInt());
        QCOMPARE(pa.watertight, pe["watertight"].toBool());
        QCOMPARE(pa.manifold, pe["manifold"].toBool());
        QCOMPARE(q(pa.releaseDirection), pe["releaseDirection"].toString());
        QCOMPARE(pa.directionVector.has_value(), pe["directionVector"].isObject());
        QStringList ra, re;
        for (const auto& r : pa.regions) ra << q(r);
        for (const QJsonValue& r : pe["regions"].toArray()) re << r.toString();
        QCOMPARE(ra, re);
        QCOMPARE(pa.toolingRegistrationFeatureIds.size(), static_cast<std::size_t>(pe["toolingRegistrationFeatureIds"].toArray().size()));
        const Bounds3 eb = boundsOf(pe["bounds"]);
        for (int axis = 0; axis < 3; ++axis) { VERIFY_CLOSE(pa.bounds.min[axis], eb.min[axis]); VERIFY_CLOSE(pa.bounds.max[axis], eb.max[axis]); }
      }
      const QJsonArray seq = e["releaseSequence"].toArray();
      QCOMPARE(a.assembly.releaseSequence.size(), static_cast<std::size_t>(seq.size()));
      for (qsizetype k = 0; k < seq.size(); ++k) {
        QCOMPARE(q(a.assembly.releaseSequence[static_cast<std::size_t>(k)].pieceId), seq[k].toObject()["pieceId"].toString());
        QCOMPARE(q(a.assembly.releaseSequence[static_cast<std::size_t>(k)].direction), seq[k].toObject()["direction"].toString());
        QCOMPARE(a.assembly.releaseSequence[static_cast<std::size_t>(k)].directionVector.has_value(), seq[k].toObject()["directionVector"].isObject());
        VERIFY_CLOSE(a.assembly.releaseSequence[static_cast<std::size_t>(k)].clearanceDistanceMm, seq[k].toObject()["clearanceDistanceMm"].toDouble());
      }
      QStringList sa, se;
      for (const auto& w : a.warnings) sa << q(w);
      for (const QJsonValue& w : e["warnings"].toArray()) se << w.toString();
      QCOMPARE(sa, se);
    }
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
