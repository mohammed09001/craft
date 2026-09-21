import { boundsFromManifold, getManifoldModule, manifoldFromPayload, payloadFromManifold } from "../../geometry/manifold";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { hashStableValues } from "../../geometry/geometryFingerprint";
import type { MasterMoldSeedSnapshot } from "../seed/masterMoldSeed";
import type {
  AccessibilityAnalysis,
  AutoWorkingMoldPlan,
  PlanningCandidateDirection,
  PlanningMesh,
  PlanningVector3,
  PlanningWarning,
  WorkingMoldPieceCountDiagnostics,
} from "../planning/masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "../planning/masterMoldPlanning.contracts";
import { buildPlanningMesh } from "../planning/planningMesh";
import { runMeshPreflight } from "../planning/meshPreflight";
import { generateCandidateDirections } from "../planning/candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "../planning/accessibility";
import { runAdaptiveDirectionDiscovery } from "../planning/adaptiveDirectionDiscovery";
import { buildSurfaceRegionGraph } from "../planning/surfaceRegions";
import { refineRegionGraphByVisibility } from "../planning/regionSubdivision";
import { greedyRegionCover } from "../planning/regionSetCover";
import {
  createWorkingMoldPieceCountSearch,
  type WorkingMoldDecompositionFinalist,
} from "../planning/workingMoldPlanner";
import { buildRegionDirectAssignment } from "../planning/regionDirectAssignment";
import { buildDirectAssignmentConstructionPieces, buildMultiLabelConstructionPieces } from "../planning/regionDirectConstruction";
import { constructWorkingMold } from "../planning/workingMoldConstructor";
import type { MasterMoldDirection } from "../masterMold.contracts";
import type {
  MasterCastTarget,
  MasterMoldBudgetLineItem,
  MasterMoldBudgetReport,
  MasterMoldDebugSnapshot,
  MasterMoldEngineResult,
  MasterMoldFailure,
  MasterMoldProgressStage,
  MasterMoldProgressStageName,
  MasterSurfaceAccessibility,
  MasterToolingPiece,
  MasterToolingSet,
} from "./contracts";
import { MASTER_MOLD_PROGRESS_STAGES, masterMoldFailureFamilyOf } from "./contracts";
import { planPourFace } from "./pourFace";
import { analyzeSurfaceAccessibility } from "./releaseAnalysis";
import { planLocalizedRemovableCore, planMultiPieceTooling } from "./multiPiecePlanner";
import {
  caseEnvelopeFor,
  constructCasePiece,
  pieceFromConstructed,
  safeVentPathsFor,
  toolingParametersFromProfile,
  toolingTolerancePolicy,
  validateAssembledNegative,
} from "./toolingConstruction";
import { verifyDemoldTranslation } from "../masterMoldDemold.verifier";
import { axisOf, DIRECTION_VECTORS } from "../masterMoldDirection.analyzer";
import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { deriveLockRegions } from "./lockEvidence";

/**
 * Execution 06: the autonomous Master Mold Engine.
 *
 * Starts directly from the imported part (the seed) -- never from committed
 * mold parts, cutting planes, a mold definition, or Create Cavity state:
 *
 *   MasterMoldSeedSnapshot
 *     → Planning Mesh / Surface Patch Graph      (Article 03)
 *     → Candidate Direction Generator            (Article 04)
 *     → Global Accessibility Analysis            (Article 05)
 *     → Working Mold Piece Count Optimizer       (Article 06)
 *     → Parting Interfaces from Geometry         (Article 07)
 *     → Virtual Working Mold Constructor         (Article 08, exact CSG)
 *     → Per-Piece Master Tooling Planner         (Article 09, exact CSG)
 *     → Registration + Fill/Vent wiring          (Articles 10/11)
 *     → MasterToolingSet[] + AutoWorkingMoldPlan
 *
 * Cheap planning decides; exact geometry verifies the shortlist only
 * (Article 13 funnel). Progress is reported per named stage; cancellation
 * is checked cooperatively inside every expensive loop.
 */

export type { MasterMoldProgressStage, MasterMoldProgressStageName };

export interface MasterMoldEngineHooks {
  readonly onStage?: (stage: MasterMoldProgressStage) => void;
  readonly signal?: AbortSignal;
}

export class MasterMoldCancelledError extends Error {
  constructor() {
    super("Master Mold generation was cancelled.");
    this.name = "MasterMoldCancelledError";
    (this as { code?: string }).code = "cancelled";
  }
}

function throwIfCancelled(hooks: MasterMoldEngineHooks): void {
  if (hooks.signal?.aborted) throw new MasterMoldCancelledError();
}

/** Module-level planning cache keyed by source geometry + profile (Article 13.7): a build-volume-only change must not rebuild accessibility. */
interface PlanningCacheEntry {
  readonly planningMesh: PlanningMesh;
  readonly directions: readonly PlanningCandidateDirection[];
  readonly analysis: AccessibilityAnalysis;
  /** Execution 08 LOOP 19: raw candidate-direction count before pruning, retained for budget reporting across cache hits. */
  readonly rawDirectionCount: number;
}
const planningCache = new Map<string, PlanningCacheEntry>();
const PLANNING_CACHE_MAX_ENTRIES = 4;

/** Tooling-set cache keyed by the input-only set signature (Article 13.7): identical piece inputs reproduce identical sets deterministically. */
const toolingSetCache = new Map<string, MasterToolingSet>();
const TOOLING_CACHE_MAX_ENTRIES = 24;

interface ToolingContext {
  readonly parameters: ReturnType<typeof toolingParametersFromProfile>;
  readonly buildVolume: MasterMoldSeedSnapshot["printerBuildVolume"];
}

function toolingContextOf(seed: MasterMoldSeedSnapshot): ToolingContext {
  return {
    parameters: toolingParametersFromProfile(seed.processProfile),
    buildVolume: seed.printerBuildVolume,
  };
}

/**
 * Execution 08 LOOP 19: named search budgets, each with limit/used/pruned/
 * reason -- so a budget-exhausted failure can say WHICH budget exhausted,
 * not just that the search failed. Built once after the piece-count
 * escalation loop completes, from evidence already gathered during it.
 */
function buildBudgetDetails(params: {
  readonly rawDirectionCount: number;
  readonly finalDirectionCount: number;
  readonly planningDiagnostics: readonly WorkingMoldPieceCountDiagnostics[];
  readonly maxPieces: number;
  readonly workingMoldConstructionAttempts: number;
}): MasterMoldBudgetLineItem[] {
  const { rawDirectionCount, finalDirectionCount, planningDiagnostics, maxPieces, workingMoldConstructionAttempts } = params;
  const maxOf = (select: (diagnostic: WorkingMoldPieceCountDiagnostics) => number): number =>
    planningDiagnostics.reduce((max, diagnostic) => Math.max(max, select(diagnostic)), 0);
  const highestPieceCountAttempted = maxOf((diagnostic) => diagnostic.pieceCount);
  const exactAttemptCapacity = planningDiagnostics.length * MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount;

  return [
    {
      name: "candidate_directions",
      limit: MASTER_PLANNER_LIMITS.maxCandidateDirections,
      used: finalDirectionCount,
      pruned: Math.max(0, rawDirectionCount - finalDirectionCount),
      reason: `${rawDirectionCount} geometry-derived candidate(s) generated; ${finalDirectionCount} kept after coverage-preserving pruning (LOOP 07) and adaptive discovery (LOOP 08).`,
    },
    {
      name: "combination_directions",
      limit: MASTER_PLANNER_LIMITS.maxCombinationDirections,
      used: maxOf((diagnostic) => diagnostic.combinationDirectionCountUsed),
      pruned: Math.max(0, finalDirectionCount - maxOf((diagnostic) => diagnostic.combinationDirectionCountUsed)),
      reason: "directions offered to the multi-piece (3+) prism combination search per beam level.",
    },
    {
      name: "parting_thresholds",
      limit: MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection,
      used: maxOf((diagnostic) => diagnostic.thresholdCountUsed),
      pruned: 0,
      reason: "parting-plane offset candidates generated across directions at the widest attempted level (LOOP 09).",
    },
    {
      name: "beam_width",
      limit: MASTER_PLANNER_LIMITS.beamWidth,
      used: maxOf((diagnostic) => diagnostic.beamSizeUsed),
      pruned: 0,
      reason: "surviving prism-prefix candidates retained per beam level (LOOP 18: diversity-aware selection, not score-only).",
    },
    {
      name: "piece_count",
      limit: maxPieces,
      used: highestPieceCountAttempted,
      pruned: 0,
      reason: `search escalated one piece count at a time up to ${highestPieceCountAttempted || 0} of a ${maxPieces}-piece cap (LOOP 16: automatic mode default reaches the ${MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces}-piece safety ceiling).`,
    },
    {
      name: "exact_construction_attempts",
      limit: exactAttemptCapacity,
      used: workingMoldConstructionAttempts,
      pruned: Math.max(0, exactAttemptCapacity - workingMoldConstructionAttempts),
      reason: `${workingMoldConstructionAttempts} exact-CSG construction attempt(s) across ${planningDiagnostics.length} piece count(s) tried (up to ${MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount} finalist(s) each). 0 here means planning itself never reached exact construction -- never an exact-CSG engine failure.`,
    },
    {
      name: "parting_surface",
      limit: 0,
      used: 0,
      pruned: 0,
      reason: "a height-field (curve-following) parting surface (Execution 08 LOOP 14) is attempted only as a fallback when the flat half-space plane fails real construction, and only per PIECE: a piece qualifies when every neighbor it borders contributes a real, non-self-intersecting parting curve (one neighbor uses a single-curve height field; several neighbors compose one independent local correction each). The catch-all piece is never substituted.",
    },
  ];
}

/**
 * Execution 08 LOOP 14: builds a height-field (curve-based) alternative to
 * a finalist's own flat-plane prism pieces, or `null` when NO piece is
 * eligible. Applied PER PIECE, independent of the finalist's total piece
 * count: a prism piece is eligible when EVERY `WorkingMoldPartingInterface`
 * touching it is a real, usable curve (non-self-intersecting, >=3 points).
 * One neighbor uses `heightFieldPartingSolid` directly; several neighbors
 * compose one independent local correction per neighbor
 * (`multiNeighborHeightFieldSolid`) -- each neighbor's own boundary against
 * this piece is still guaranteed to be one simple closed loop, even when
 * the piece as a whole borders several different neighbors. The catch-all
 * piece (`plane: null`) is never substituted -- it has no offset for the
 * height field's own far-field behavior to fall back to.
 *
 * Checked directly against a real 3/4-piece fixture (a three-hole cube):
 * a real prism piece there bordered two neighbors with real, usable curves,
 * and `multiNeighborHeightFieldSolid` constructed a valid, single-connected
 * tool for it -- this genuinely extends coverage beyond the two-piece case,
 * not just in theory.
 */
function heightFieldFallbackPieces(
  finalist: WorkingMoldDecompositionFinalist,
  planarPieces: readonly { readonly releaseDirection: PlanningVector3; readonly plane: { readonly direction: PlanningVector3; readonly offsetMm: number } | null }[],
): readonly { readonly releaseDirection: PlanningVector3; readonly plane: { readonly direction: PlanningVector3; readonly offsetMm: number } | null; readonly curve?: readonly (readonly PlanningVector3[])[] | null }[] | null {
  const interfacesByPiece = new Map<number, typeof finalist.interfaces[number][]>();
  for (const face of finalist.interfaces) {
    for (const pieceIndex of [face.pieceAIndex, face.pieceBIndex]) {
      const list = interfacesByPiece.get(pieceIndex) ?? [];
      list.push(face);
      interfacesByPiece.set(pieceIndex, list);
    }
  }

  let eligibleCount = 0;
  const pieces = planarPieces.map((piece, index) => {
    if (piece.plane === null) return piece;
    const touching = interfacesByPiece.get(index);
    if (touching === undefined || touching.length === 0) return piece;
    if (touching.some((face) => face.selfIntersecting || face.samplePoints.length < 3)) return piece;
    eligibleCount += 1;
    return { releaseDirection: piece.releaseDirection, plane: piece.plane, curve: touching.map((face) => face.samplePoints) };
  });
  return eligibleCount > 0 ? pieces : null;
}

export async function runMasterMoldEngine(
  seed: MasterMoldSeedSnapshot,
  priorSets: readonly MasterToolingSet[] = [],
  hooks: MasterMoldEngineHooks = {},
): Promise<MasterMoldEngineResult> {
  const started = Date.now();
  const failures: MasterMoldFailure[] = [];
  const warnings: PlanningWarning[] = [];
  const budget: MasterMoldBudgetReport = {
    candidateDirectionCount: 0,
    planningPatchCount: 0,
    workingMoldPlanCandidateCount: 0,
    workingMoldConstructionAttempts: 0,
    pourFaceAnalysisAttempts: 0,
    ventAnalysisAttempts: 0,
    toolingOnePieceAttempts: 0,
    toolingMultiPieceAttempts: 0,
    toolingExactPlanAttempts: 0,
    releaseVerificationAttempts: 0,
    limitsExceeded: [],
    budgetDetails: [],
  };
  const emit = (stage: MasterMoldProgressStageName, detail: string | null) => {
    hooks.onStage?.({
      stage,
      stageIndex: MASTER_MOLD_PROGRESS_STAGES.indexOf(stage),
      stageCount: MASTER_MOLD_PROGRESS_STAGES.length,
      detail,
      elapsedMs: Date.now() - started,
    });
  };

  throwIfCancelled(hooks);

  // Stage 0 (Execution 08 LOOP 03): source mesh preflight. Planning must
  // never be blamed for a mesh that was never constructible -- an open,
  // non-manifold, self-intersecting, or otherwise broken source is reported
  // as its own failure family, before any planning work runs at all.
  emit("analyzing_geometry", "checking source mesh topology");
  const preflight = runMeshPreflight(seed.sourceMesh);
  if (preflight.status === "invalid-for-master-mold") {
    return {
      seedId: seed.seedId,
      plan: null,
      toolingSets: [],
      failures: [
        {
          moldPartId: "working-mold",
          reason: "invalid_source_mesh",
          family: masterMoldFailureFamilyOf("invalid_source_mesh"),
          message: `the source mesh is not usable as a manufacturing solid: ${preflight.issues.map((issue) => issue.message).join(" ")}`,
        },
      ],
      elapsedMs: Date.now() - started,
      budget,
      planningDiagnostics: [],
      debugSnapshot: null,
    };
  }
  if (preflight.status === "repairable-warning") {
    warnings.push({
      code: "source_mesh_repairable_warning",
      message: `source mesh preflight found repairable issues: ${preflight.issues.map((issue) => issue.message).join(" ")}`,
      pieceIndex: null,
    });
  }
  throwIfCancelled(hooks);

  // Stage A: planning geometry (cheap, cached).
  emit("analyzing_geometry", "sampling source surface");
  const cacheKey = `${seed.sourceGeometryVersion}:${seed.processProfile.profileId}`;
  let entry = planningCache.get(cacheKey);
  if (entry === undefined) {
    const planningMesh = buildPlanningMesh({
      positions: seed.sourceMesh.positions,
      indices: seed.sourceMesh.indices,
      bounds: seed.sourceBounds,
      sourceGeometryVersion: seed.sourceGeometryVersion,
    });
    budget.planningPatchCount = planningMesh.patches.length;
    throwIfCancelled(hooks);
    emit("building_accessibility", `${planningMesh.patches.length} patches`);
    const directions = generateCandidateDirections(planningMesh, seed.sourceMesh.positions);
    const rawDirectionCount = directions.length;
    budget.candidateDirectionCount = directions.length;
    let analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
    const pruned = pruneDirections(analysis.directions, analysis, planningMesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
    analysis = pruned.analysis;
    throwIfCancelled(hooks);
    // Execution 08 LOOP 08: close a genuine candidate-direction gap before
    // planning ever runs -- a region no direction in the pruned set covers
    // at all gets new, region-derived candidates instead of silently
    // staying locked for every piece count.
    emit("building_accessibility", "checking region coverage");
    const discovery = runAdaptiveDirectionDiscovery({ planningMesh, sourceMesh: seed.sourceMesh, analysis });
    analysis = discovery.analysis;
    budget.candidateDirectionCount = analysis.directions.length;
    entry = { planningMesh, directions: analysis.directions, analysis, rawDirectionCount };
    if (planningCache.size >= PLANNING_CACHE_MAX_ENTRIES) {
      const oldest = planningCache.keys().next().value;
      if (oldest !== undefined) planningCache.delete(oldest);
    }
    planningCache.set(cacheKey, entry);
  }
  const { planningMesh, analysis, rawDirectionCount } = entry;
  throwIfCancelled(hooks);

  // Stage B/C: piece-count optimization driven by exact verification
  // (Execution 07 LOOP 01). Plan count N, exact-verify its bounded finalists,
  // and escalate to N+1 only when every finalist fails exact construction;
  // planning and exact rejection evidence is preserved per count.
  emit("optimizing_working_mold", "searching mold-piece count");
  const maxPieces = Math.min(
    seed.processProfile.maximumWorkingMoldPieceCount,
    seed.userPreferences.preferredMaximumWorkingMoldPieces ?? seed.processProfile.maximumWorkingMoldPieceCount,
    MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces,
  );
  const rejectedPieceCounts: { pieceCount: number; reason: string }[] = [];
  const planningDiagnostics: WorkingMoldPieceCountDiagnostics[] = [];
  const pieceCountSearch = createWorkingMoldPieceCountSearch({ planningMesh, analysis, maxWorkingMoldPieces: maxPieces });
  let construction: Awaited<ReturnType<typeof constructWorkingMold>> | null = null;
  let constructionFinalist: WorkingMoldDecompositionFinalist | null = null;
  let constructionError: Error | null = null;
  // Execution 08 LOOP 14: how many REAL non-half-space (curved) parting
  // surface constructions were actually attempted -- the per-finalist
  // height-field fallback and the region-direct-assignment last resort.
  // Reported honestly in the debug snapshot instead of a hardcoded 0.
  let partingSurfaceCandidateAttempts = 0;

  for (;;) {
    const step = pieceCountSearch.next();
    if (step === null) break;
    planningDiagnostics.push(step.diagnostics);
    throwIfCancelled(hooks);
    if (step.rejectionReason !== null) {
      rejectedPieceCounts.push({ pieceCount: step.pieceCount, reason: step.rejectionReason });
      continue;
    }
    budget.workingMoldPlanCandidateCount += step.finalists.length;
    emit("constructing_working_mold", `${step.pieceCount} pieces`);
    let countError: Error | null = null;
    for (const finalist of step.finalists) {
      throwIfCancelled(hooks);
      budget.workingMoldConstructionAttempts += 1;
      const planarPieces = finalist.candidate.pieces.map((piece) => ({
        releaseDirection: piece.releaseDirection,
        plane: piece.prism === null
          ? null
          : {
              direction: analysis.directions[piece.prism.directionIndex]!.vector,
              offsetMm: piece.prism.offsetMm,
            },
      }));
      try {
        construction = await constructWorkingMold({
          sourceMesh: seed.sourceMesh,
          sourceBounds: seed.sourceBounds,
          releaseClearanceMm: seed.processProfile.releaseClearanceMm ?? 0,
          minimumToolingWallMm: seed.processProfile.minimumToolingWallMm,
          pieces: planarPieces,
        });
        constructionFinalist = finalist;
        break;
      } catch (error) {
        countError = error instanceof Error ? error : new Error(String(error));
      }
      // Execution 08 LOOP 14: the flat half-space planes this finalist's
      // prism search settled on are not the only way to realize its own
      // (already-proven-sound) patch assignment -- retry with height-field
      // cutting tools that follow that assignment's own real parting
      // curves instead, for every piece whose neighbors all contribute a
      // real, usable curve (one neighbor: a direct height field; several:
      // one independent local correction per neighbor).
      const heightFieldPieces = heightFieldFallbackPieces(finalist, planarPieces);
      if (heightFieldPieces !== null) {
        throwIfCancelled(hooks);
        budget.workingMoldConstructionAttempts += 1;
        partingSurfaceCandidateAttempts += 1;
        try {
          construction = await constructWorkingMold({
            sourceMesh: seed.sourceMesh,
            sourceBounds: seed.sourceBounds,
            releaseClearanceMm: seed.processProfile.releaseClearanceMm ?? 0,
            minimumToolingWallMm: seed.processProfile.minimumToolingWallMm,
            pieces: heightFieldPieces,
          });
          constructionFinalist = finalist;
          break;
        } catch (error) {
          countError = error instanceof Error ? error : new Error(String(error));
        }
      }
    }
    if (construction !== null) break;
    constructionError = countError;
    rejectedPieceCounts.push({
      pieceCount: step.pieceCount,
      reason: `all ${step.finalists.length} planning finalist(s) failed exact construction: ${countError?.message ?? "unknown"}`,
    });
  }

  // Execution 08 LOOP 14 (real-regression root cause): the ordered
  // half-space search's own assignment rule -- geometric offset thresholds
  // claimed in a fixed prism sequence -- is a different, weaker criterion
  // than "this region is fully visible from direction D", which is all
  // region set-cover (Loop 11) actually proves. When the whole search above
  // exhausts every piece count with zero feasible candidates, but set-cover
  // proves the candidate direction set collectively covers every region,
  // try ONE more real construction: assign every patch DIRECTLY from
  // set-cover's own region-to-direction proof (bypassing the offset search
  // entirely), and build each piece's cutting tool from that assignment's
  // own real parting curves. This is a genuine last resort, not a
  // replacement for the ordinary search -- verified against a real,
  // deliberately hard free-form fixture to REACH real exact-CSG
  // construction where the ordinary search never got past 0 attempts, but
  // not verified to always pass full release verification (see
  // regionDirectConstruction.ts's own doc comment for the honest limit
  // found there).
  if (construction === null) {
    const baseRegionGraph = buildSurfaceRegionGraph(planningMesh);
    const refinedRegionGraph = refineRegionGraphByVisibility(baseRegionGraph, planningMesh, analysis).regionGraph;
    const directCover = greedyRegionCover(refinedRegionGraph, planningMesh, analysis);
    if (directCover.uncoveredRegionIndexes.length === 0 && directCover.steps.length >= 2 && directCover.steps.length <= maxPieces) {
      const directAssignment = buildRegionDirectAssignment(refinedRegionGraph, planningMesh, analysis, directCover.steps);
      const directBuilt = directAssignment.unassignedPatchCount === 0
        ? buildDirectAssignmentConstructionPieces(planningMesh, analysis, directAssignment)
        : null;
      if (directBuilt !== null) {
        throwIfCancelled(hooks);
        budget.workingMoldConstructionAttempts += 1;
        partingSurfaceCandidateAttempts += 1;
        try {
          construction = await constructWorkingMold({
            sourceMesh: seed.sourceMesh,
            sourceBounds: seed.sourceBounds,
            releaseClearanceMm: seed.processProfile.releaseClearanceMm ?? 0,
            minimumToolingWallMm: seed.processProfile.minimumToolingWallMm,
            pieces: directBuilt.pieces,
          });
          const pieceCount = directBuilt.pieces.length;
          const scoreBreakdown = {
            slidingWallAreaMm2: 0,
            seamCrossingCount: 0,
            areaImbalance: 0,
            interfaceCount: pieceCount - 1,
            total: pieceCount * 0.1,
          };
          constructionFinalist = {
            candidate: {
              pieceCount,
              pieces: directBuilt.pieces.map((piece, index) => ({
                releaseDirection: piece.releaseDirection,
                directionId: directCover.steps[index]!.directionId,
                prism: null,
              })),
              feasible: true,
              unassignablePatchCount: 0,
              score: scoreBreakdown.total,
              scoreBreakdown,
            },
            patchAssignment: Array.from(directAssignment.assignment),
            interfaces: directBuilt.interfaces,
          };
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : String(error);
          // Attributed directly on the error itself: the top-level failure
          // message below only ever surfaces `constructionError.message`
          // (never `rejectedPieceCounts`, which this fallback runs after
          // the ordinary search has already exhausted and populated), so
          // attribution has to live here to reach the user-facing text.
          constructionError = new Error(
            `region-set-cover-driven direct assignment (${directCover.steps.length} directions, proven full region coverage) reached real exact construction but failed: ${rawMessage}`,
          );
          rejectedPieceCounts.push({ pieceCount: directBuilt.pieces.length, reason: constructionError.message });
        }
      }
    }

    // Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
    // when the CSG-boundary fallback above also fails (or never applied),
    // try one further real construction: the SAME region-set-cover-driven
    // assignment, built via a genuinely different technique -- a joint,
    // discrete multi-label reconstruction with an ICM/Potts-model
    // smoothness term that directly penalizes a voxel disagreeing with its
    // neighbors (see `multiLabelPartition.ts`'s own doc comment for the
    // full mechanism and its measured history). Every prior CSG-boundary
    // and volumetric-Voronoi attempt (five separate paradigms, five
    // separate tie-break variants -- `volumetricPartition.ts`'s own doc
    // comment has the complete history) failed to converge on the real
    // free-form regression fixture; this is the first to reach FULL
    // release verification for the large majority of its pieces (9 of 10
    // measured directly), with the one remaining failure traced to a
    // specific, tiny, already-diagnosed geometric island
    // (`masterMoldEngine.loop02RealRegression.test.ts`'s own doc comment
    // has the full derivation) rather than a fresh defect in this
    // technique. Tried as a genuine LAST resort after the CSG fallback,
    // not a replacement for it -- both are last resorts after the ordinary
    // search, and either succeeding is a real win.
    if (construction === null && directCover.uncoveredRegionIndexes.length === 0 && directCover.steps.length >= 2 && directCover.steps.length <= maxPieces) {
      const directAssignment = buildRegionDirectAssignment(refinedRegionGraph, planningMesh, analysis, directCover.steps);
      const multiLabelBuilt = directAssignment.unassignedPatchCount === 0
        ? buildMultiLabelConstructionPieces(planningMesh, analysis, directAssignment)
        : null;
      if (multiLabelBuilt !== null) {
        throwIfCancelled(hooks);
        budget.workingMoldConstructionAttempts += 1;
        partingSurfaceCandidateAttempts += 1;
        try {
          construction = await constructWorkingMold({
            sourceMesh: seed.sourceMesh,
            sourceBounds: seed.sourceBounds,
            releaseClearanceMm: seed.processProfile.releaseClearanceMm ?? 0,
            minimumToolingWallMm: seed.processProfile.minimumToolingWallMm,
            pieces: multiLabelBuilt.pieces,
            // Execution 08 LOOP 02/14/28 (principle 10 honesty): if a piece
            // fails release, try every candidate direction the WHOLE
            // planning search considered, not just the handful actually
            // used as release directions -- a real release failure against
            // this full set is much stronger evidence of a genuine
            // geometric constraint than a failure against only the small
            // used subset (masterMoldEngine.loop02RealRegression.test.ts
            // measures exactly what this changes).
            extraReleaseDirections: analysis.directions.map((direction) => direction.vector),
          });
          const pieceCount = multiLabelBuilt.pieces.length;
          const scoreBreakdown = {
            slidingWallAreaMm2: 0,
            seamCrossingCount: 0,
            areaImbalance: 0,
            interfaceCount: pieceCount - 1,
            total: pieceCount * 0.1,
          };
          constructionFinalist = {
            candidate: {
              pieceCount,
              pieces: multiLabelBuilt.pieces.map((piece, index) => ({
                releaseDirection: piece.releaseDirection,
                directionId: directCover.steps[index]!.directionId,
                prism: null,
              })),
              feasible: true,
              unassignablePatchCount: 0,
              score: scoreBreakdown.total,
              scoreBreakdown,
            },
            patchAssignment: Array.from(directAssignment.assignment),
            interfaces: multiLabelBuilt.interfaces,
          };
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : String(error);
          constructionError = new Error(
            `region-set-cover-driven multi-label reconstruction (${directCover.steps.length} directions, proven full region coverage) reached real exact construction but failed: ${rawMessage}`,
          );
          rejectedPieceCounts.push({ pieceCount: multiLabelBuilt.pieces.length, reason: constructionError.message });
        }
      }
    }
  }

  budget.budgetDetails = buildBudgetDetails({
    rawDirectionCount,
    finalDirectionCount: analysis.directions.length,
    planningDiagnostics,
    maxPieces,
    workingMoldConstructionAttempts: budget.workingMoldConstructionAttempts,
  });

  // Execution 08 LOOP 26: one consolidated, inspectable planner snapshot --
  // everything a person would otherwise open source code to piece together
  // from several separate result fields, in one place.
  const debugRegionGraph = buildSurfaceRegionGraph(planningMesh);
  const debugRegionCover = greedyRegionCover(debugRegionGraph, planningMesh, analysis);
  const debugSnapshot: MasterMoldDebugSnapshot = {
    sourceValidity: preflight.status === "valid" ? "valid" : "repairable-warning",
    regionCount: debugRegionGraph.regions.length,
    candidateDirectionCount: analysis.directions.length,
    coverageMatrixSummary: {
      totalRegions: debugRegionCover.totalRegionCount,
      uncoveredRegionCount: debugRegionCover.uncoveredRegionIndexes.length,
      minimumPieceEstimate: debugRegionCover.uncoveredRegionIndexes.length === 0 ? debugRegionCover.steps.length : null,
    },
    uncoveredRegionIndexes: debugRegionCover.uncoveredRegionIndexes,
    pieceCountAttempts: planningDiagnostics.map((diagnostic) => diagnostic.pieceCount),
    thresholdAttemptsByPieceCount: planningDiagnostics.map((diagnostic) => ({ pieceCount: diagnostic.pieceCount, thresholdCountUsed: diagnostic.thresholdCountUsed })),
    // Execution 08 LOOP 14: how many real non-half-space (curved) parting
    // surface constructions were actually attempted this run -- the
    // per-finalist height-field fallback and the region-direct-assignment
    // last resort. General multi-piece non-half-space construction is
    // still not the default path (every finalist tries its flat plane
    // first), so this is usually 0 on an easy part; honest either way, not
    // hardcoded.
    partingSurfaceCandidateCount: partingSurfaceCandidateAttempts,
    exactConstructionAttempts: budget.workingMoldConstructionAttempts,
    selectedPieceCount: constructionFinalist === null ? null : constructionFinalist.candidate.pieceCount,
  };

  if (construction === null || constructionFinalist === null) {
    // Execution 07 LOOP 09: this stop means the bounded search exhausted its
    // configured limits -- it is NOT proof that rigid tooling is impossible.
    // The message and the structured failure family both say so.
    const budgetReached = budget.limitsExceeded.length > 0 || rejectedPieceCounts.length > 0;
    // Execution 08 LOOP 17: "raise the piece-count cap" is only an
    // actionable recommendation when a cap below the internal safety
    // ceiling actually exists to raise (a profile or user preference set
    // one deliberately). In automatic mode (the default: LOOP 16 lets
    // maxPieces already reach the ceiling), there is no hidden cap left to
    // raise, and normal failure text must not ask for an unavailable action.
    const atAutomaticCeiling = maxPieces >= MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces;
    const recovery = atAutomaticCeiling
      ? `automatic escalation already reached the internal safety ceiling of ${maxPieces} piece(s); use flexible/sacrificial tooling for fully enclosed features, or simplify the part`
      : `raise the piece-count cap (currently ${maxPieces} of a ${MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces}-piece safety ceiling) in the process profile or preferred piece-count setting, or use flexible/sacrificial tooling for fully enclosed features`;
    // Execution 08 LOOP 19: name exactly which budget(s) actually hit their
    // limit, instead of one generic "search failed" message -- 0 exact
    // construction attempts is then never confusable with an exact-CSG
    // engine failure (which would show attempts > 0 with a construction
    // error instead).
    const exhaustedBudgetNames = budget.budgetDetails
      .filter((item) => item.name !== "parting_surface" && item.limit > 0 && item.used >= item.limit)
      .map((item) => item.name);
    const exhaustedBudgetClause = exhaustedBudgetNames.length > 0
      ? ` Exhausted budget(s): ${exhaustedBudgetNames.join(", ")}.`
      : budget.workingMoldConstructionAttempts === 0
        ? " No individual search budget was exhausted; planning itself never produced a feasible candidate at any attempted piece count (see planningDiagnostics for the per-count reason)."
        : "";
    return {
      seedId: seed.seedId,
      plan: null,
      toolingSets: [],
      failures: [
        {
          moldPartId: "working-mold",
          reason: "no_release_plan",
          family: masterMoldFailureFamilyOf("no_release_plan"),
          message: budgetReached
            ? `the bounded search reached its configured limits (piece-count cap ${maxPieces}, ${budget.workingMoldConstructionAttempts} exact construction attempt(s), ${rejectedPieceCounts.length} piece count(s) rejected) without finding a releasable decomposition${constructionError === null ? "" : ` (last exact failure: ${constructionError.message})`}.${exhaustedBudgetClause} This is a search-budget outcome, not proof that rigid tooling is impossible: review the part, ${recovery}.`
            : `no working-mold decomposition could be planned${constructionError === null ? "" : ` (last exact failure: ${constructionError.message})`}. This is a search-budget outcome, not proof that rigid tooling is impossible; flexible/sacrificial tooling may be required for fully enclosed features.`,
        },
      ],
      elapsedMs: Date.now() - started,
      budget,
      planningDiagnostics,
      debugSnapshot,
    };
  }
  const pieceTargets = construction.pieces;
  throwIfCancelled(hooks);

  // Stage D: per-piece Master tooling planning (exact CSG, bounded).
  const negativeTool = await buildSourceNegativeTool(seed);
  const context = toolingContextOf(seed);
  const priorByPiece = new Map(priorSets.map((set) => [set.moldPartId, set] as const));
  const toolingSets: MasterToolingSet[] = [];

  for (let index = 0; index < pieceTargets.length; index += 1) {
    const piece = pieceTargets[index]!;
    emit("planning_master_tooling", `piece ${index + 1} of ${pieceTargets.length}`);
    throwIfCancelled(hooks);

    const prior = priorByPiece.get(piece.pieceId);
    const signature = toolingSetInputSignature(seed, piece.pieceId, piece.geometryVersion);
    if (prior !== undefined && prior.sourceSignature === signature) {
      toolingSets.push(prior);
      continue;
    }
    const cached = toolingSetCache.get(signature);
    if (cached !== undefined) {
      toolingSets.push(cached);
      continue;
    }

    const castTarget: MasterCastTarget = {
      moldPartId: piece.pieceId,
      moldPartName: piece.name,
      mesh: piece.mesh,
      bounds: piece.bounds,
      volumeMm3: piece.volumeMm3,
      geometryVersion: piece.geometryVersion,
      featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
      warnings: [],
    };

    try {
      budget.toolingExactPlanAttempts += 1;
      const set = await buildToolingSetForWorkingMoldPiece(seed, castTarget, negativeTool, context, budget, piece.assignedDirection, hooks);
      if (set !== null) {
        if (toolingSetCache.size >= TOOLING_CACHE_MAX_ENTRIES) {
          const oldest = toolingSetCache.keys().next().value;
          if (oldest !== undefined) toolingSetCache.delete(oldest);
        }
        toolingSetCache.set(signature, set);
        toolingSets.push(set);
      }
    } catch (error) {
      failures.push({
        moldPartId: piece.pieceId,
        reason: "tooling_construction_failed",
        family: masterMoldFailureFamilyOf("tooling_construction_failed"),
        message: `${piece.name}: ${error instanceof Error ? error.message : "tooling construction failed."}`,
      });
    }
  }

  // Stage E: the plan contract. Score/interfaces describe the exact-verified
  // finalist, and the rejection evidence covers planning AND exact failures
  // across every escalated piece count (Execution 07 LOOP 01).
  emit("verifying_release", `${pieceTargets.length} pieces verified`);
  const plan: AutoWorkingMoldPlan = {
    sourceGeometryVersion: seed.sourceGeometryVersion,
    moldPieces: pieceTargets,
    partingInterfaces: constructionFinalist.interfaces,
    releaseSequence: construction.releaseSequence,
    registrationPlan: construction.registrationPlan,
    warnings,
    score: constructionFinalist.candidate.scoreBreakdown,
    rejectedPieceCounts,
  };
  if (construction.registrationPlan.reason !== null) {
    warnings.push({
      code: "working_mold_registration_unplaced",
      message: `working mold assembled without automatic alignment features: ${construction.registrationPlan.reason}`,
      pieceIndex: null,
    });
  }

  emit("finalizing", null);
  return {
    seedId: seed.seedId,
    plan,
    toolingSets,
    failures,
    elapsedMs: Date.now() - started,
    budget,
    planningDiagnostics,
    debugSnapshot,
  };
}

/** Master's own source-part negative (the functional cavity geometry tooling must respect). */
async function buildSourceNegativeTool(seed: MasterMoldSeedSnapshot): Promise<{ readonly mesh: ReturnType<typeof payloadFromManifold>; readonly bounds: ReturnType<typeof boundsFromManifold> }> {
  const module = await getManifoldModule();
  const policy = buildGeometryTolerancePolicy(seed.sourceBounds, 0);
  const solid = manifoldFromPayload(module, { positions: [...seed.sourceMesh.positions], indices: [...seed.sourceMesh.indices] }, policy.booleanToleranceMm);
  try {
    return { mesh: payloadFromManifold(solid), bounds: boundsFromManifold(solid) };
  } finally {
    solid.delete();
  }
}

/** Input-only identity backing per-piece tooling reuse without Boolean work. */
function toolingSetInputSignature(seed: MasterMoldSeedSnapshot, pieceId: string, geometryVersion: string): string {
  return hashStableValues({
    seedId: seed.seedId,
    pieceId,
    pieceGeometryVersion: geometryVersion,
    processProfileId: seed.processProfile.profileId,
    printerBuildVolume: seed.printerBuildVolume,
  });
}

/**
 * Execution 06 Article 09: the per-working-mold-piece Master tooling
 * planner. Ranked valid pour faces are tried in order (bounded); each face
 * gets a one-piece attempt and, when that fails, the adaptive multi-panel
 * planner. A face whose attempts all fail is evidence for the next face;
 * only when every bounded face fails does the structured sacrificial
 * fallback appear -- never fake geometry.
 */
async function buildToolingSetForWorkingMoldPiece(
  seed: MasterMoldSeedSnapshot,
  castTarget: MasterCastTarget,
  negativeTool: { readonly mesh: ReturnType<typeof payloadFromManifold>; readonly bounds: ReturnType<typeof boundsFromManifold> },
  context: ToolingContext,
  budget: MasterMoldBudgetReport,
  assignedDirection: PlanningVector3,
  hooks: MasterMoldEngineHooks,
): Promise<MasterToolingSet | null> {
  const parameters = context.parameters;
  const warnings: string[] = [];

  const pourFaceDecision = planPourFace({
    castTarget,
    negativeToolMesh: negativeTool.mesh,
    negativeToolBounds: negativeTool.bounds,
    caseWallThicknessMm: parameters.caseWallThicknessMm,
    caseBaseThicknessMm: parameters.caseBaseThicknessMm,
    geometryToleranceMm: parameters.geometryToleranceMm,
    userOverride: null,
  });
  budget.pourFaceAnalysisAttempts += 1;
  budget.ventAnalysisAttempts += pourFaceDecision.candidates.filter((candidate) => candidate.valid).length;
  warnings.push(...pourFaceDecision.fillabilityWarnings);
  warnings.push(...pourFaceDecision.ventPlan.unresolvedRecommendations.map((recommendation) => recommendation.message));
  if (pourFaceDecision.selected === null) {
    throw new Error("no valid pour face: every candidate was rejected by hard constraints.");
  }

  const accessibility = analyzeSurfaceAccessibility(castTarget);

  const validFaces = pourFaceDecision.candidates
    .filter((candidate) => candidate.valid)
    .sort((a, b) => a.score - b.score || a.direction.localeCompare(b.direction))
    .slice(0, MASTER_PLANNER_LIMITS.maxExactToolingPlansPerTarget)
    .map((candidate) => candidate.direction);

  let lastFailure: string | null = null;
  for (const pourFace of validFaces) {
    throwIfCancelled(hooks);
    const attempt = await attemptCaseForPourFace(
      seed, castTarget, negativeTool, context, budget, pourFace,
      pourFaceDecision, accessibility, assignedDirection,
    );
    if (attempt.set !== null) {
      return { ...attempt.set, warnings: [...warnings, ...attempt.set.warnings] };
    }
    lastFailure = attempt.rejection;
    if (attempt.rejection.includes("budget")) recordLimit(budget, "tooling_exact_plan");
  }

  if (!seed.processProfile.sacrificialToolingPermitted) {
    throw new Error(`no verified reusable tooling plan (${lastFailure ?? "unverified"}) and the profile forbids sacrificial fallback.`);
  }
  return sacrificialOutcome(seed, castTarget, pourFaceDecision, accessibility, warnings, `no verified reusable tooling plan (${lastFailure ?? "unverified"}).`);
}

async function attemptCaseForPourFace(
  seed: MasterMoldSeedSnapshot,
  castTarget: MasterCastTarget,
  negativeTool: { readonly mesh: ReturnType<typeof payloadFromManifold>; readonly bounds: ReturnType<typeof boundsFromManifold> },
  context: ToolingContext,
  budget: MasterMoldBudgetReport,
  pourFace: MasterMoldDirection,
  pourFaceDecision: MasterToolingSet["pourFaceDecision"],
  accessibility: MasterSurfaceAccessibility,
  assignedDirection: PlanningVector3,
): Promise<{ readonly set: MasterToolingSet; readonly rejection: string | null } | { readonly set: null; readonly rejection: string }> {
  const parameters = context.parameters;
  const warnings: string[] = [];

  budget.toolingOnePieceAttempts += 1;
  budget.releaseVerificationAttempts += 1;
  const onePiece = await attemptOnePiece(castTarget, pourFace, parameters, pourFaceDecision.ventPlan.unresolvedRecommendations, negativeTool.mesh);
  let releaseMode: MasterToolingSet["releaseMode"] = "multi-piece";
  let pieces: readonly MasterToolingPiece[] = [];
  let releaseSequence: MasterToolingSet["assembly"]["releaseSequence"] = [];
  let coreMode: MasterToolingSet["assembly"]["coreMode"] = "split";
  let ventFeatures: MasterToolingSet["pourFaceDecision"]["ventPlan"]["features"] = [];
  let registrationFeatures: MasterToolingSet["assembly"]["registrationFeatures"] = [];
  let partingSurfaces: MasterToolingSet["partingSurfaces"] = [];

  if (onePiece.ok) {
    releaseMode = "one-piece";
    pieces = onePiece.pieces;
    releaseSequence = onePiece.releaseSequence;
    ventFeatures = onePiece.ventFeatures;
    const buildVolume = context.buildVolume;
    if (buildVolume !== null && !pieces.every((piece) => fitsBuildVolumeFor(piece, buildVolume))) {
      warnings.push("one-piece case exceeds the printer build volume; multi-piece partition attempted.");
      budget.toolingMultiPieceAttempts += 1;
      const multi = await planMultiPieceTooling(castTarget, pourFace, parameters, negativeTool.mesh, assignedDirection, negativeTool.bounds, context.buildVolume ?? undefined, pourFaceDecision.ventPlan.unresolvedRecommendations);
      budget.toolingExactPlanAttempts += 1;
      if (multi.plan !== null && multi.plan.pieces.every((piece) => fitsBuildVolumeFor(piece, buildVolume))) {
        releaseMode = "multi-piece";
        pieces = multi.plan.pieces;
        releaseSequence = multi.plan.releaseSequence;
        coreMode = multi.plan.coreMode;
        ventFeatures = multi.plan.ventFeatures;
        registrationFeatures = multi.plan.registrationFeatures;
        partingSurfaces = [multi.plan.partingSurface];
        if (multi.plan.registrationNote !== null) warnings.push(multi.plan.registrationNote);
      } else {
        return { set: null, rejection: `${pourFace}: multi-piece partition could not satisfy the printer build volume.` };
      }
    }
  } else {
    // One-piece failure is planning evidence, never product failure.
    let localizedPlanAccepted = false;
    // Execution 07 LOOP 06: the localized-core search is lock-driven and
    // mesh-density independent. Candidate core regions derive from the exact
    // release-collision region of the failed sweep plus sampled inaccessible
    // patch clusters; exact CSG runs only on the shortlisted regions. A
    // dense mesh is never by itself a reason to skip the search.
    if (parameters.maxToolingPieces >= 2) {
      const lockEvidence = deriveLockRegions(castTarget, flipOf(pourFace), onePiece.collisionBounds);
      if (lockEvidence.regions.length > 0) {
        const localized = await planLocalizedRemovableCore(
          castTarget,
          pourFace,
          parameters,
          lockEvidence,
          assignedDirection,
          context.buildVolume ?? undefined,
          pourFaceDecision.ventPlan.unresolvedRecommendations,
        );
        budget.toolingExactPlanAttempts += 1;
        if (localized.plan !== null) {
          localizedPlanAccepted = true;
          releaseMode = "multi-piece";
          pieces = localized.plan.pieces;
          releaseSequence = localized.plan.releaseSequence;
          coreMode = localized.plan.coreMode;
          ventFeatures = localized.plan.ventFeatures;
          registrationFeatures = localized.plan.registrationFeatures;
          partingSurfaces = [localized.plan.partingSurface];
          warnings.push(localized.plan.registrationNote ?? "localized removable core selected after one-piece release failure.");
        }
      }
    }
    if (localizedPlanAccepted) {
      // A localized core is a complete, independently verified tooling plan.
    } else {
    budget.toolingMultiPieceAttempts += 1;
    const multi = await planMultiPieceTooling(castTarget, pourFace, parameters, negativeTool.mesh, assignedDirection, negativeTool.bounds, context.buildVolume ?? undefined, pourFaceDecision.ventPlan.unresolvedRecommendations);
    budget.toolingExactPlanAttempts += 1;
    if (multi.plan === null) {
      return { set: null, rejection: `${pourFace}: ${multi.rejectionReason ?? "unverified"}` };
    }
    const buildVolume = context.buildVolume;
    if (buildVolume !== null && !multi.plan.pieces.every((piece) => fitsBuildVolumeFor(piece, buildVolume))) {
      return { set: null, rejection: `${pourFace}: multi-piece partition could not satisfy the printer build volume.` };
    }
    releaseMode = "multi-piece";
    pieces = multi.plan.pieces;
    releaseSequence = multi.plan.releaseSequence;
    coreMode = multi.plan.coreMode;
    ventFeatures = multi.plan.ventFeatures;
    registrationFeatures = multi.plan.registrationFeatures;
    partingSurfaces = [multi.plan.partingSurface];
    if (multi.plan.registrationNote !== null) warnings.push(multi.plan.registrationNote);
    }
  }

  const fingerprint = hashStableValues({
    seedId: seed.seedId,
    castTargetVersion: castTarget.geometryVersion,
    pourFace,
    releaseMode,
    pieces: pieces.map((piece) => ({ id: piece.pieceId, geometry: piece.mesh, bounds: piece.bounds })),
    releaseSequence,
    registrationFeatures,
  });

  return {
    set: {
      moldPartId: castTarget.moldPartId,
      moldPartName: castTarget.moldPartName,
      castTargetVersion: castTarget.geometryVersion,
      sourceSignature: toolingSetInputSignature(seed, castTarget.moldPartId, castTarget.geometryVersion),
      pourFaceDecision: {
        ...pourFaceDecision,
        selected: pourFace,
        ventPlan: {
          ...pourFaceDecision.ventPlan,
          features: ventFeatures,
          unresolvedRecommendations: pourFaceDecision.ventPlan.unresolvedRecommendations.filter(
            (recommendation) => !ventFeatures.some((feature) => feature.featureId === recommendation.recommendationId),
          ),
          status: ventFeatures.length === pourFaceDecision.ventPlan.unresolvedRecommendations.length ? "clear" : "user-review",
        },
      },
      accessibility,
      releaseMode,
      partingSurfaces,
      assembly: { pieces, registrationFeatures, coreMode, releaseSequence },
      warnings,
      fingerprint: `master-tooling-set:${fingerprint}`,
    },
    rejection: "",
  };
}

function fitsBuildVolumeFor(piece: MasterToolingPiece, buildVolume: { readonly x: number; readonly y: number; readonly z: number }): boolean {
  return (
    piece.bounds.max.x - piece.bounds.min.x <= buildVolume.x &&
    piece.bounds.max.y - piece.bounds.min.y <= buildVolume.y &&
    piece.bounds.max.z - piece.bounds.min.z <= buildVolume.z
  );
}

function recordLimit(budget: MasterMoldBudgetReport, limit: string): void {
  if (!budget.limitsExceeded.includes(limit)) budget.limitsExceeded.push(limit);
}

function sacrificialOutcome(
  seed: MasterMoldSeedSnapshot,
  castTarget: MasterCastTarget,
  pourFaceDecision: MasterToolingSet["pourFaceDecision"],
  accessibility: MasterSurfaceAccessibility,
  warnings: string[],
  reason: string,
): MasterToolingSet {
  return {
    moldPartId: castTarget.moldPartId,
    moldPartName: castTarget.moldPartName,
    castTargetVersion: castTarget.geometryVersion,
    sourceSignature: toolingSetInputSignature(seed, castTarget.moldPartId, castTarget.geometryVersion),
    pourFaceDecision,
    accessibility,
    releaseMode: "sacrificial-recommended",
    partingSurfaces: [],
    assembly: { pieces: [], registrationFeatures: [], coreMode: "split", releaseSequence: [] },
    warnings: [...warnings, `reusable_plan_not_found → sacrificial_release_recommended: ${reason}`],
    fingerprint: `master-tooling-set:sacrificial:${castTarget.geometryVersion}`,
  };
}

/** One-piece attempt outcome: on release failure the exact collision region is retained as lock evidence (Execution 07 LOOP 06). */
type OnePieceAttempt =
  | { readonly ok: true; readonly pieces: readonly MasterToolingPiece[]; readonly releaseSequence: MasterToolingSet["assembly"]["releaseSequence"]; readonly ventFeatures: MasterToolingSet["pourFaceDecision"]["ventPlan"]["features"] }
  | { readonly ok: false; readonly collisionBounds: Bounds3 | null };

/** Article 09 stage: build the one-piece case and exactly verify release + assembled negative. */
async function attemptOnePiece(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: ReturnType<typeof toolingParametersFromProfile>,
  recommendations: MasterToolingSet["pourFaceDecision"]["ventPlan"]["unresolvedRecommendations"],
  protectedMesh: ReturnType<typeof payloadFromManifold> | null,
): Promise<OnePieceAttempt> {
  const module = await getManifoldModule();
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const policy = toolingTolerancePolicy(caseBounds);
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
  const axis = axisOf(pourFace);
  const sweepClearanceMm =
    (caseBounds.max[axis] - caseBounds.min[axis]) * TOOLING_ONE_PIECE_SWEEP_SAFETY_FACTOR;
  // Execution 07 LOOP 07: vent candidates get the exact mesh/protected-
  // surface proof; only proven routes become automatic vent features.
  const ventFeatures = safeVentPathsFor(castTarget.bounds, caseBounds, castTarget.bounds, recommendations, parameters.caseWallThicknessMm, { targetMesh: castTarget.mesh, protectedMesh });

  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let constructed;
  try {
    constructed = await constructCasePiece({ castTarget, pourFace, parameters, coreToolMesh: null, coreMode: "split", ventPaths: ventFeatures });
  } catch {
    targetSolid.delete();
    return { ok: false, collisionBounds: null };
  }

  try {
    const releaseDirection = flipOf(pourFace);
    const sweep = verifyDemoldTranslation(targetSolid, constructed.solid, releaseDirection, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    if (!sweep.removable) {
      // Exact lock localization: the overlap between the case and the
      // translated target at the first colliding distance is WHERE the
      // release physically jams. This region seeds the localized-core
      // search (Execution 07 LOOP 06).
      let collisionBounds: Bounds3 | null = null;
      if (sweep.firstCollisionDistanceMm !== null) {
        // The sweep moves the case relative to the target (see call above), so
        // the jam region is target ∩ case-translated-to-first-contact.
        const [dx, dy, dz] = DIRECTION_VECTORS[releaseDirection];
        const translated = constructed.solid.translate(dx * sweep.firstCollisionDistanceMm, dy * sweep.firstCollisionDistanceMm, dz * sweep.firstCollisionDistanceMm);
        const overlap = targetSolid.intersect(translated);
        try {
          if (!overlap.isEmpty()) collisionBounds = boundsFromManifold(overlap);
        } finally {
          overlap.delete();
          translated.delete();
        }
      }
      return { ok: false, collisionBounds };
    }

    const assembled = await validateAssembledNegative([constructed.solid], castTarget, pourFace, parameters);
    if (assembled.overlapVolumeMm3 > volumeTolerance || assembled.residualVoidVolumeMm3 < -volumeTolerance || assembled.residualVoidVolumeMm3 > castTarget.volumeMm3) return { ok: false, collisionBounds: null };

    const piece = pieceFromConstructed("piece-1", `${castTarget.moldPartName} Master Case`, constructed, releaseDirection, ["one-piece"]);
    return {
      ok: true,
      pieces: [piece],
      ventFeatures,
      releaseSequence: [
        { stepIndex: 0, pieceId: piece.pieceId, direction: releaseDirection, clearanceDistanceMm: sweepClearanceMm, collisionVerified: true },
      ],
    };
  } finally {
    constructed.solid.delete();
    targetSolid.delete();
  }
}

const TOOLING_ONE_PIECE_SWEEP_SAFETY_FACTOR = 1.1;

function flipOf(direction: MasterMoldDirection): MasterMoldDirection {
  return direction.startsWith("+") ? (`-${direction.slice(1)}` as MasterMoldDirection) : (`+${direction.slice(1)}` as MasterMoldDirection);
}
