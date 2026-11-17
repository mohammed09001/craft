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
    const AccessibilityAnalysis analysis = pruneDirections(raw.directions, raw, mesh, 32).analysis;

    const QJsonObject ref = c["planner"].toObject();
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
