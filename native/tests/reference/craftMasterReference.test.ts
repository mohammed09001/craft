/**
 * Master Mold foundation reference fixture generator for the native migration.
 *
 * Runs the real reference seed builder, source-mesh preflight, planning mesh
 * and candidate-direction generator on fixed inputs and records inputs and
 * outputs in native/tests/fixtures/reference/master-reference.json, which
 * native/tests/tst_master_equivalence.cpp replays.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hashNumericArray } from "@/features/mold-generation/geometry/geometryFingerprint";
import {
  buildMasterMoldSeedSnapshot,
  masterSeedStalenessIdentity,
  worldMeshFromSnapshot,
} from "@/features/mold-generation/master-mold/seed/masterMoldSeed";
import { runMeshPreflight } from "@/features/mold-generation/master-mold/planning/meshPreflight";
import { buildPlanningMesh } from "@/features/mold-generation/master-mold/planning/planningMesh";
import { generateCandidateDirections } from "@/features/mold-generation/master-mold/planning/candidateDirections";
import { buildSurfaceRegionGraph, summarizeRegionAccessibility, unresolvedSurfaceRegions } from "@/features/mold-generation/master-mold/planning/surfaceRegions";
import { refineRegionGraphByVisibility } from "@/features/mold-generation/master-mold/planning/regionSubdivision";
import { analyzeDirectionAccessibility, pruneDirections } from "@/features/mold-generation/master-mold/planning/accessibility";
import { runAdaptiveDirectionDiscovery } from "@/features/mold-generation/master-mold/planning/adaptiveDirectionDiscovery";
import { constructWorkingMold } from "@/features/mold-generation/master-mold/planning/workingMoldConstructor";
import { getManifoldModule, payloadFromManifold } from "@/features/mold-generation/geometry/manifold";
import { evaluateMasterMoldGeneration } from "@/features/mold-generation/master-mold/masterMoldGeneration.evaluate";
import { deriveMasterMoldUiState, hasRenderableToolingGeometry, overallStatusOfSets, summarizeGeneration } from "@/features/mold-generation/master-mold/masterMold.contracts";
import { selectRenderableMasterMoldBodies } from "@/features/mold-generation/master-mold/masterMoldViewportAdapter";
import { buildRegionDirectAssignment } from "@/features/mold-generation/master-mold/planning/regionDirectAssignment";
import { buildDirectAssignmentConstructionPieces, buildMultiLabelConstructionPieces } from "@/features/mold-generation/master-mold/planning/regionDirectConstruction";
import { runMasterMoldEngine } from "@/features/mold-generation/master-mold/engine/masterMoldEngine";
import { greedyRegionCover } from "@/features/mold-generation/master-mold/planning/regionSetCover";
import { candidatePartingThresholds, createWorkingMoldPieceCountSearch, planWorkingMoldDecomposition } from "@/features/mold-generation/master-mold/planning/workingMoldPlanner";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.CRAFT_MASTER_OUTPUT ?? resolve(here, "../fixtures/reference/master-reference.json");

type Bounds = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

interface MeshSpec {
  name: string;
  positions: number[];
  indices: number[];
  transform: number[];
  printer: { x: number; y: number; z: number } | null;
  /** Present for meshes the native test regenerates from a recipe instead of storing them. */
  recipe?: { kind: "cube-grid"; segments: number; size: number };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function boundsOf(positions: number[]): Bounds {
  const b: Bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (let i = 0; i < positions.length; i += 3) {
    b.min.x = Math.min(b.min.x, positions[i]!); b.max.x = Math.max(b.max.x, positions[i]!);
    b.min.y = Math.min(b.min.y, positions[i + 1]!); b.max.y = Math.max(b.max.y, positions[i + 1]!);
    b.min.z = Math.min(b.min.z, positions[i + 2]!); b.max.z = Math.max(b.max.z, positions[i + 2]!);
  }
  return b;
}

function boxMesh(x: number, y: number, z: number): { positions: number[]; indices: number[] } {
  const positions = [0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z];
  const indices = [
    0, 2, 1, 0, 3, 2, // bottom (-z)
    4, 5, 6, 4, 6, 7, // top (+z)
    0, 1, 5, 0, 5, 4, // front (-y)
    2, 3, 7, 2, 7, 6, // back (+y)
    1, 2, 6, 1, 6, 5, // right (+x)
    3, 0, 4, 3, 4, 7, // left (-x)
  ];
  return { positions, indices };
}

/** Binary STL read as an unindexed triangle soup, like the real import path. */
function stlSoup(path: string): { positions: number[]; indices: number[] } {
  const buf = readFileSync(path);
  const count = buf.readUInt32LE(80);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let t = 0; t < count; t += 1) {
    const base = 84 + t * 50;
    for (let v = 0; v < 3; v += 1) {
      for (let c = 0; c < 3; c += 1) positions.push(buf.readFloatLE(base + 12 + v * 12 + c * 4));
      indices.push(t * 3 + v);
    }
  }
  return { positions, indices };
}

/** Closed-per-face subdivided cube; the recipe is mirrored exactly in the native test. */
function cubeGrid(segments: number, size: number): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const uAxis = (axis + 1) % 3;
    const vAxis = (axis + 2) % 3;
    for (const positive of [true, false]) {
      const base = positions.length / 3;
      for (let i = 0; i <= segments; i += 1) {
        for (let j = 0; j <= segments; j += 1) {
          const p = [0, 0, 0];
          p[axis] = positive ? size : 0;
          p[uAxis] = (i * size) / segments;
          p[vAxis] = (j * size) / segments;
          positions.push(p[0]!, p[1]!, p[2]!);
        }
      }
      const at = (i: number, j: number) => base + i * (segments + 1) + j;
      for (let i = 0; i < segments; i += 1) {
        for (let j = 0; j < segments; j += 1) {
          if (positive) indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
          else indices.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1));
        }
      }
    }
  }
  return { positions, indices };
}

async function runCase(spec: MeshSpec) {
  const localBounds = boundsOf(spec.positions);
  const seed = buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: `model-${spec.name}`,
      positions: spec.positions,
      indices: spec.indices,
      transform: spec.transform,
      localBounds,
      geometryVersion: `geom-${spec.name}`,
      sourceSignature: `sig-${spec.name}`,
    },
    printerBuildVolume: spec.printer,
    projectRevision: "rev-1",
  });
  const world = worldMeshFromSnapshot(seed);
  const preflight = runMeshPreflight({ positions: world.sourceMesh.positions, indices: world.sourceMesh.indices });
  const planning = buildPlanningMesh({
    positions: world.sourceMesh.positions,
    indices: world.sourceMesh.indices,
    bounds: world.sourceMesh.bounds,
    sourceGeometryVersion: world.sourceGeometryVersion,
  });
  const directions = generateCandidateDirections(planning, world.sourceMesh.positions);
  const accessibility = analyzeDirectionAccessibility({ positions: world.sourceMesh.positions, indices: world.sourceMesh.indices }, planning, directions);
  const regionGraph = buildSurfaceRegionGraph(planning);
  const summaries = summarizeRegionAccessibility(regionGraph, planning, accessibility);
  const refined = refineRegionGraphByVisibility(regionGraph, planning, accessibility);
  const refinedSummaries = summarizeRegionAccessibility(refined.regionGraph, planning, accessibility);
  const summaryJson = (list: typeof summaries) => list.map((s) => ({
    regionIndex: s.regionIndex,
    bestDirectionId: s.bestDirectionId,
    bestVisibleAreaFraction: s.bestVisibleAreaFraction,
    fractions: Object.fromEntries(s.visibleAreaFractionByDirectionId),
  }));
  const pruned = pruneDirections(directions, accessibility, planning, 6);

  // The engine prunes to the full candidate budget (32) before planning; the search runs on that analysis.
  const prunedForEngine = pruneDirections(accessibility.directions, accessibility, planning, 32).analysis;
  const discovery = runAdaptiveDirectionDiscovery({ planningMesh: planning, sourceMesh: { positions: world.sourceMesh.positions, indices: world.sourceMesh.indices }, analysis: prunedForEngine });
  const engineAnalysis = discovery.analysis;
  const opposingOf = (d: number): readonly number[] => {
    const v = engineAnalysis.directions[d]!.vector;
    for (let j = 0; j < engineAnalysis.directions.length; j += 1) {
      if (j === d) continue;
      const o = engineAnalysis.directions[j]!.vector;
      if (v.x * o.x + v.y * o.y + v.z * o.z < -0.999) return engineAnalysis.perDirection[j]!.visible;
    }
    return new Array<number>(planning.patches.length).fill(0);
  };
  const refinedGraph = refineRegionGraphByVisibility(buildSurfaceRegionGraph(planning), planning, engineAnalysis).regionGraph;
  const thresholds = engineAnalysis.directions.map((direction, d) => candidatePartingThresholds(planning, engineAnalysis.perDirection[d]!.visible, opposingOf(d), direction.vector, refinedGraph));
  const cover = greedyRegionCover(refinedGraph, planning, engineAnalysis);
  const search = createWorkingMoldPieceCountSearch({ planningMesh: planning, analysis: engineAnalysis, maxWorkingMoldPieces: 6 });
  const steps = [];
  for (;;) {
    const step = search.next();
    if (step === null) break;
    steps.push({ pieceCount: step.pieceCount, rejectionReason: step.rejectionReason, diagnostics: step.diagnostics, finalists: step.finalists });
  }
  const plan = planWorkingMoldDecomposition({ planningMesh: planning, analysis: engineAnalysis, maxWorkingMoldPieces: 6 });

  // Planar construction exactly as the engine tries it: finalists in order, count by count, first success wins.
  const attempts: { pieceCount: number; finalistIndex: number; ok: boolean; error: string | null }[] = [];
  let construction: Record<string, unknown> | null = null;
  const constructionSearch = createWorkingMoldPieceCountSearch({ planningMesh: planning, analysis: engineAnalysis, maxWorkingMoldPieces: 6 });
  outer: for (;;) {
    const step = constructionSearch.next();
    if (step === null) break;
    for (let finalistIndex = 0; finalistIndex < step.finalists.length; finalistIndex += 1) {
      const finalist = step.finalists[finalistIndex]!;
      const planarPieces = finalist.candidate.pieces.map((piece) => ({
        releaseDirection: piece.releaseDirection,
        plane: piece.prism === null ? null : { direction: engineAnalysis.directions[piece.prism.directionIndex]!.vector, offsetMm: piece.prism.offsetMm },
      }));
      try {
        const built = await constructWorkingMold({
          sourceMesh: world.sourceMesh,
          sourceBounds: world.sourceBounds,
          releaseClearanceMm: world.processProfile.releaseClearanceMm ?? 0,
          minimumToolingWallMm: world.processProfile.minimumToolingWallMm,
          pieces: planarPieces,
        });
        attempts.push({ pieceCount: step.pieceCount, finalistIndex, ok: true, error: null });
        construction = {
          pieces: built.pieces.map((p) => ({ pieceId: p.pieceId, name: p.name, volumeMm3: p.volumeMm3, bounds: p.bounds, triangleCount: p.triangleCount, watertight: p.watertight, manifold: p.manifold, assignedDirection: p.assignedDirection, directionId: p.directionId, releaseOrder: p.releaseOrder, vertexCount: p.mesh.positions.length / 3 })),
          releaseSequence: built.releaseSequence,
          registrationPlan: built.registrationPlan,
          releaseSweepCount: built.releaseSweepCount,
        };
        break outer;
      } catch (error) {
        attempts.push({ pieceCount: step.pieceCount, finalistIndex, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  const plannerJson = {
    discovery: { roundsRun: discovery.roundsRun, discovered: discovery.discoveredDirections },
    directionIds: engineAnalysis.directions.map((d) => d.directionId),
    thresholds,
    cover,
    subdividedRegionCount: search.subdividedRegionCount,
    searchRegionCount: search.regionGraph.regions.length,
    steps,
    plan: plan === null ? null : { pieceCount: plan.candidate.pieceCount, score: plan.candidate.score, finalistCount: plan.finalists.length, rejectedPieceCounts: plan.rejectedPieceCounts },
    constructionAttempts: attempts,
    construction,
  };
  // Constructor-level fallback modes: the region-direct builders and each construction mode run directly, on every part where they apply.
  let fallbackModes: unknown = null;
  if (preflight.status !== "invalid-for-master-mold" && spec.name !== "cube-grid-large") {
    const refinedForFallback = refineRegionGraphByVisibility(buildSurfaceRegionGraph(planning), planning, engineAnalysis).regionGraph;
    const fbCover = greedyRegionCover(refinedForFallback, planning, engineAnalysis);
    const summarize = (out: Awaited<ReturnType<typeof constructWorkingMold>>) => ({
      ok: true as const,
      pieces: out.pieces.map((p) => ({ pieceId: p.pieceId, volumeMm3: p.volumeMm3, bounds: p.bounds, triangleCount: p.triangleCount, watertight: p.watertight, manifold: p.manifold, releaseOrder: p.releaseOrder, assignedDirection: p.assignedDirection })),
      releaseSequence: out.releaseSequence,
      registrationPlan: out.registrationPlan,
      releaseSweepCount: out.releaseSweepCount,
    });
    const run = async (pieces: Parameters<typeof constructWorkingMold>[0]["pieces"], extra?: readonly { x: number; y: number; z: number }[]) => {
      try {
        return summarize(await constructWorkingMold({ sourceMesh: world.sourceMesh, sourceBounds: world.sourceBounds, releaseClearanceMm: 0, minimumToolingWallMm: world.processProfile.minimumToolingWallMm, pieces, ...(extra === undefined ? {} : { extraReleaseDirections: extra }) }));
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    };
    const describe = (built: { pieces: readonly { releaseDirection: unknown; plane?: unknown; grid?: { ownPoints: readonly unknown[]; otherPoints: readonly unknown[]; ownPatchRadiusMm: number } | null; multiLabel?: { ownTriangleIndices: readonly number[] } | null }[]; interfaces: readonly { interfaceId: string; pieceAIndex: number; pieceBIndex: number; kind: string; selfIntersecting: boolean; samplePoints: readonly unknown[] }[] } | null) =>
      built === null ? null : {
        pieces: built.pieces.map((p) => ({ releaseDirection: p.releaseDirection, plane: p.plane ?? null, gridOwn: p.grid?.ownPoints.length ?? null, gridOther: p.grid?.otherPoints.length ?? null, ownPatchRadiusMm: p.grid?.ownPatchRadiusMm ?? null, triangles: p.multiLabel?.ownTriangleIndices.length ?? null, triangleSum: p.multiLabel === null || p.multiLabel === undefined ? null : p.multiLabel.ownTriangleIndices.reduce((s, v) => s + v, 0) })),
        interfaces: built.interfaces.map((i) => ({ interfaceId: i.interfaceId, pieceAIndex: i.pieceAIndex, pieceBIndex: i.pieceBIndex, kind: i.kind, selfIntersecting: i.selfIntersecting, pointCount: i.samplePoints.length })),
      };
    const usable = fbCover.uncoveredRegionIndexes.length === 0 && fbCover.steps.length >= 2;
    let direct: Record<string, unknown> | null = null;
    if (usable) {
      const assignment = buildRegionDirectAssignment(refinedForFallback, planning, engineAnalysis, fbCover.steps);
      const directBuilt = assignment.unassignedPatchCount === 0 ? buildDirectAssignmentConstructionPieces(planning, engineAnalysis, assignment) : null;
      const labelBuilt = assignment.unassignedPatchCount === 0 ? buildMultiLabelConstructionPieces(planning, engineAnalysis, assignment) : null;
      direct = {
        coverSteps: fbCover.steps.length,
        assignment: Array.from(assignment.assignment),
        pieceDirectionIndexes: assignment.pieceDirectionIndexes,
        unassignedPatchCount: assignment.unassignedPatchCount,
        alternativeCount: assignment.alternativePiecesByPatch.reduce((s, a) => s + a.length, 0),
        gridBuilt: describe(directBuilt),
        labelBuilt: describe(labelBuilt),
        gridResult: directBuilt === null ? null : await run(directBuilt.pieces),
        labelResult: labelBuilt === null ? null : await run(labelBuilt.pieces, engineAnalysis.directions.map((d) => d.vector)),
      };
    }
    // Height-field retry on the first finalist (in search order) that has an eligible piece.
    let heightField: Record<string, unknown> | null = null;
    const fbSearch = createWorkingMoldPieceCountSearch({ planningMesh: planning, analysis: engineAnalysis, maxWorkingMoldPieces: 6 });
    hf: for (;;) {
      const step = fbSearch.next();
      if (step === null) break;
      for (let finalistIndex = 0; finalistIndex < step.finalists.length; finalistIndex += 1) {
        const finalist = step.finalists[finalistIndex]!;
        const planar = finalist.candidate.pieces.map((p) => ({ releaseDirection: p.releaseDirection, plane: p.prism === null ? null : { direction: engineAnalysis.directions[p.prism.directionIndex]!.vector, offsetMm: p.prism.offsetMm } }));
        const byPiece = new Map<number, typeof finalist.interfaces[number][]>();
        for (const face of finalist.interfaces) for (const index of [face.pieceAIndex, face.pieceBIndex]) { const list = byPiece.get(index) ?? []; list.push(face); byPiece.set(index, list); }
        let eligible = 0;
        const pieces = planar.map((piece, index) => {
          if (piece.plane === null) return piece;
          const touching = byPiece.get(index);
          if (touching === undefined || touching.length === 0) return piece;
          if (touching.some((face) => face.selfIntersecting || face.samplePoints.length < 3)) return piece;
          eligible += 1;
          return { releaseDirection: piece.releaseDirection, plane: piece.plane, curve: touching.map((face) => face.samplePoints) };
        });
        if (eligible === 0) continue;
        heightField = { pieceCount: step.pieceCount, finalistIndex, eligible, curvePointCounts: pieces.map((p) => ("curve" in p && p.curve ? p.curve.map((c) => c.length) : null)), result: await run(pieces) };
        break hf;
      }
    }
    fallbackModes = { usable, direct, heightField };
  }

  // The full engine, end to end, exactly as evaluateMasterMoldGeneration calls it.
  const engineStarted = Date.now();
  const engineRun = await runMasterMoldEngine(world, []);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const meshSummary = (m: { positions: readonly number[]; indices: readonly number[] }) => ({
    vertexCount: m.positions.length / 3,
    triangleCount: m.indices.length / 3,
    positionsHash: hex(hashNumericArray([...m.positions])),
    // Triangulation-independent: hash of sorted per-triangle vertex-position keys.
    triangleSetHash: hex(hashNumericArray(Array.from({ length: m.indices.length / 3 }, (_, t) => {
      const corners = [0, 1, 2].map((k) => `${m.positions[m.indices[t * 3 + k]! * 3]},${m.positions[m.indices[t * 3 + k]! * 3 + 1]},${m.positions[m.indices[t * 3 + k]! * 3 + 2]}`).sort();
      return corners.join("|");
    }).sort().map((s) => s.length))),
    indicesHash: hex(hashNumericArray([...m.indices])),
  });
  const engineJson = {
    seedId: engineRun.seedId,
    elapsedMs: Date.now() - engineStarted,
    failures: engineRun.failures,
    budget: engineRun.budget,
    planningDiagnostics: engineRun.planningDiagnostics,
    debugSnapshot: engineRun.debugSnapshot,
    plan: engineRun.plan === null ? null : {
      pieces: engineRun.plan.moldPieces.map((p) => ({ pieceId: p.pieceId, name: p.name, volumeMm3: p.volumeMm3, bounds: p.bounds, triangleCount: p.triangleCount, watertight: p.watertight, manifold: p.manifold, releaseOrder: p.releaseOrder, assignedDirection: p.assignedDirection, ...meshSummary(p.mesh) })),
      interfaces: engineRun.plan.partingInterfaces,
      releaseSequence: engineRun.plan.releaseSequence,
      registrationPlan: engineRun.plan.registrationPlan,
      warnings: engineRun.plan.warnings,
      score: engineRun.plan.score,
      rejectedPieceCounts: engineRun.plan.rejectedPieceCounts,
    },
    toolingSets: engineRun.toolingSets.map((s) => ({
      moldPartId: s.moldPartId,
      moldPartName: s.moldPartName,
      pourFaceDecision: s.pourFaceDecision,
      accessibility: s.accessibility,
      releaseMode: s.releaseMode,
      partingSurfaces: s.partingSurfaces,
      coreMode: s.assembly.coreMode,
      registrationFeatures: s.assembly.registrationFeatures,
      releaseSequence: s.assembly.releaseSequence,
      pieces: s.assembly.pieces.map((p) => ({ pieceId: p.pieceId, name: p.name, volumeMm3: p.volumeMm3, bounds: p.bounds, triangleCount: p.triangleCount, watertight: p.watertight, manifold: p.manifold, releaseDirection: p.releaseDirection, directionVector: p.directionVector ?? null, regions: p.regions, toolingRegistrationFeatureIds: p.toolingRegistrationFeatureIds, fitsBuildVolume: p.fitsBuildVolume, ...meshSummary(p.mesh) })),
      warnings: s.warnings,
    })),
  };
  // Worker-side mapping + store derivations, from the real evaluate() (skipped for the heaviest part: a second 128 s engine run).
  let storeJson: unknown = null;
  if (spec.name !== "cube-grid-large") {
    const evaluated = await evaluateMasterMoldGeneration({ operationId: "master-mold:1", generationVersion: 1, seed, priorSets: [] });
    const status = overallStatusOfSets(evaluated.sets);
    storeJson = {
      sets: evaluated.sets.map((s) => ({ moldPartId: s.moldPartId, moldPartName: s.moldPartName, status: s.status, contentVersion: s.contentVersion, failureMessage: s.failureMessage, failureFamily: s.failureFamily ?? null, hasSet: s.set !== null, releaseMode: s.set?.releaseMode ?? null })),
      workingMoldPieceCount: evaluated.workingMoldPieceCount,
      warningCount: evaluated.warningCount,
      overallStatus: status,
      summary: summarizeGeneration(evaluated.sets, evaluated.workingMoldPieceCount, evaluated.warningCount),
      uiState: deriveMasterMoldUiState({ status, sets: evaluated.sets, lastError: null }),
      hasRenderable: hasRenderableToolingGeometry(evaluated.sets),
      renderable: selectRenderableMasterMoldBodies(evaluated.sets, {}).map((b) => ({ id: b.id, name: b.name, visible: b.visible, stale: b.stale, triangleCount: b.triangleCount, geometryIdentityPiece: b.geometryIdentity.split(":").slice(-1)[0] })),
      staleRenderable: selectRenderableMasterMoldBodies(evaluated.sets.map((s) => ({ ...s, status: "stale" as const })), { [evaluated.sets[0] ? `${evaluated.sets[0].moldPartId}:${evaluated.sets[0].set?.assembly.pieces[0]?.pieceId ?? ""}` : ""]: false }).map((b) => ({ id: b.id, visible: b.visible, stale: b.stale })),
    };
  }
  return {
    store: storeJson,
    fallbackModes,
    engine: engineJson,
    planner: plannerJson,
    surface: {
      regions: regionGraph.regions,
      regionOfPatch: regionGraph.regionOfPatch,
      summaries: summaryJson(summaries),
      unresolved: unresolvedSurfaceRegions(summaries, regionGraph).map((r) => r.regionIndex),
      refined: { regions: refined.regionGraph.regions, regionOfPatch: refined.regionGraph.regionOfPatch, subdividedRegionCount: refined.subdividedRegionCount, summaries: summaryJson(refinedSummaries) },
    },
    accessibility: { perDirection: accessibility.perDirection, dominantPatchOrder: accessibility.dominantPatchOrder },
    pruned: pruned.directions.map((d) => d.directionId),
    name: spec.name,
    input: spec.recipe
      ? { recipe: spec.recipe, transform: spec.transform, printer: spec.printer }
      : { positions: spec.positions, indices: spec.indices, transform: spec.transform, printer: spec.printer },
    seed: {
      seedId: seed.seedId,
      sourceGeometryVersion: seed.sourceGeometryVersion,
      bounds: seed.sourceBounds,
      worldPositionsHash: (hashNumericArray(Array.from(world.sourceMesh.positions)) >>> 0).toString(16).padStart(8, "0"),
      stalenessIdentity: masterSeedStalenessIdentity(seed),
    },
    preflight,
    planningMesh: {
      patches: planning.patches,
      adjacency: planning.adjacency,
      totalAreaMm2: planning.totalAreaMm2,
      vertexCount: planning.vertexCount,
      triangleCount: planning.triangleCount,
    },
    directions,
  };
}

it("writes the master mold foundation reference fixture", async () => {
  const box = boxMesh(40, 30, 12);
  const bracket = stlSoup(process.env.CRAFT_BRACKET_STL ?? resolve(here, "../fixtures/models/bracket.stl"));
  const grid = cubeGrid(65, 100);
  // An open box (one triangle removed) and a box with a duplicated face exercise the preflight issues.
  const open = { positions: box.positions, indices: box.indices.slice(3) };
  const duplicated = { positions: box.positions, indices: [...box.indices, 0, 2, 1] };
  // C-shaped extrusion: the inner faces of the arms are undercuts along z, open along +x.
  const poly = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 20], [30, 20], [30, 30], [0, 30]] as const;
  const cPositions: number[] = [];
  for (const y of [0, 20]) for (const [px, pz] of poly) cPositions.push(px, y, pz);
  const cIndices: number[] = [];
  for (const [a, b, c] of [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 7], [4, 5, 6], [4, 6, 7]] as const) {
    cIndices.push(a + 8, c + 8, b + 8); // y = 20 cap, normal +y
    cIndices.push(a, b, c); // y = 0 cap, normal -y
  }
  for (let i = 0; i < 8; i += 1) {
    const j = (i + 1) % 8;
    cIndices.push(i, j + 8, j, i, i + 8, j + 8);
  }
  // Tessellated boxes (n x n quads per face, outward winding), unioned as a soup of parts: spine, two arms and a lip that
  // covers only half of the top arm, so the ceiling region is partly visible along +x.
  const tessBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, positions: number[], indices: number[]) => {
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let axis = 0; axis < 3; axis += 1) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (const positive of [true, false]) {
        const base = positions.length / 3;
        for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n; j += 1) {
          const p = [0, 0, 0];
          p[axis] = positive ? hi[axis]! : lo[axis]!;
          p[u] = lo[u]! + ((hi[u]! - lo[u]!) * i) / n;
          p[v] = lo[v]! + ((hi[v]! - lo[v]!) * j) / n;
          positions.push(p[0]!, p[1]!, p[2]!);
        }
        const at = (i: number, j: number) => base + i * (n + 1) + j;
        for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
          if (positive) indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
          else indices.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1));
        }
      }
    }
  };
  const assemblyPositions: number[] = [];
  const assemblyIndices: number[] = [];
  tessBox(0, 0, 0, 10, 20, 30, 3, assemblyPositions, assemblyIndices);
  tessBox(10, 0, 0, 30, 20, 10, 3, assemblyPositions, assemblyIndices);
  tessBox(10, 0, 20, 30, 20, 30, 3, assemblyPositions, assemblyIndices);
  tessBox(26, 0, 12, 30, 10, 20, 2, assemblyPositions, assemblyIndices);
  // Parts built with the real kernel; meshes are stored in the fixture so the native test replays identical input.
  const module = await getManifoldModule();
  const toSpec = (name: string, solid: InstanceType<typeof module.Manifold>, printer: MeshSpec["printer"] = null): MeshSpec => {
    const mesh = payloadFromManifold(solid);
    solid.delete();
    return { name, positions: mesh.positions, indices: mesh.indices, transform: IDENTITY, printer };
  };
  const cyl = (radius: number, height: number, segments = 24) => module.Manifold.cylinder(height, radius, radius, segments, true);
  const kernelSpecs: MeshSpec[] = [];
  {
    // Sphere with an equatorial groove: an undercut that no single pull can release.
    const ring = cyl(24, 6, 40).subtract(cyl(12, 8, 40));
    kernelSpecs.push(toSpec("grooved-sphere", module.Manifold.sphere(16, 32).subtract(ring)));
  }
  {
    // Cube with two orthogonal blind holes.
    const cube = module.Manifold.cube([30, 30, 30], true);
    const blindZ = cyl(5, 20, 24).translate(0, 0, 10);
    const blindX = cyl(5, 20, 24).rotate(0, 90, 0).translate(10, 0, 0);
    kernelSpecs.push(toSpec("cross-blind-holes", cube.subtract(blindZ).subtract(blindX)));
  }
  {
    // Dumbbell: two spheres joined by a thin neck.
    const left = module.Manifold.sphere(10, 24).translate(-18, 0, 0);
    const right = module.Manifold.sphere(10, 24).translate(18, 0, 0);
    const neck = cyl(3, 40, 20).rotate(0, 90, 0);
    kernelSpecs.push(toSpec("dumbbell", left.add(right).add(neck)));
  }
  {
    // Torus standing on its edge.
    const section = module.CrossSection.circle(5, 24).translate([14, 0]);
    kernelSpecs.push(toSpec("torus", module.Manifold.revolve(section, 40).rotate(90, 0, 0)));
  }
  {
    // Parts whose planar search fails while the region set-cover is complete: these reach the direct-assignment and
    // multi-label construction fallbacks.
    kernelSpecs.push(toSpec("sphere-three-through-holes", module.Manifold.sphere(16, 32).subtract(cyl(4, 50)).subtract(cyl(4, 50).rotate(90, 0, 0)).subtract(cyl(4, 50).rotate(0, 90, 0))));
    const leg = (rx: number, ry: number) => cyl(4, 36).translate(0, 0, 18).rotate(rx, ry, 0);
    kernelSpecs.push(toSpec("tripod", module.Manifold.sphere(8, 24).add(leg(35, 0)).add(leg(-35, 20)).add(leg(-35, -20))));
  }
  const specs: MeshSpec[] = [
    { name: "box-rotated-translated", ...box, transform: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 20, 5, 1], printer: { x: 220, y: 220, z: 250 } },
    { name: "bracket-soup", ...bracket, transform: IDENTITY, printer: null },
    { name: "c-extrusion", positions: cPositions, indices: cIndices, transform: IDENTITY, printer: null },
    { name: "c-assembly", positions: assemblyPositions, indices: assemblyIndices, transform: IDENTITY, printer: null },
    { name: "tiny-box", ...boxMesh(6, 6, 6), transform: IDENTITY, printer: null },
    { name: "tiny-slab", ...boxMesh(10, 4, 3), transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, -2, 1, 1], printer: null },
    ...kernelSpecs,
    { name: "box-open", ...open, transform: IDENTITY, printer: null },
    { name: "box-duplicate-face", ...duplicated, transform: IDENTITY, printer: null },
    { name: "cube-grid-large", positions: grid.positions, indices: grid.indices, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -50, -50, 0, 1], printer: null, recipe: { kind: "cube-grid", segments: 65, size: 100 } },
  ];
  const cases = [];
  for (const spec of specs) {
    const started = Date.now();
    cases.push(await runCase(spec));
    console.info(`[master-reference] ${spec.name}: ${Date.now() - started} ms`);
  }
  const document = {
    schema: "craft.native-master-reference/1",
    generator: "native/tests/reference/craftMasterReference.test.ts",
    reference: "mold/frontend master-mold seed + meshPreflight + planningMesh + candidateDirections",
    cases,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document)}\n`, "utf8");
  expect(cases.length).toBe(specs.length);
}, 3_600_000);
