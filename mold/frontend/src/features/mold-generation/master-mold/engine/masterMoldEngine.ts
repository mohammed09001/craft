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
} from "../planning/masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "../planning/masterMoldPlanning.contracts";
import { buildPlanningMesh } from "../planning/planningMesh";
import { generateCandidateDirections } from "../planning/candidateDirections";
import { analyzeDirectionAccessibility, pruneDirections } from "../planning/accessibility";
import { planWorkingMoldDecomposition } from "../planning/workingMoldPlanner";
import { constructWorkingMold } from "../planning/workingMoldConstructor";
import type { MasterMoldDirection } from "../masterMold.contracts";
import type {
  MasterCastTarget,
  MasterMoldBudgetReport,
  MasterMoldEngineResult,
  MasterMoldFailure,
  MasterMoldProgressStage,
  MasterMoldProgressStageName,
  MasterSurfaceAccessibility,
  MasterToolingPiece,
  MasterToolingSet,
} from "./contracts";
import { MASTER_MOLD_PROGRESS_STAGES } from "./contracts";
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
import { axisOf } from "../masterMoldDirection.analyzer";

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
    budget.candidateDirectionCount = directions.length;
    let analysis = analyzeDirectionAccessibility(seed.sourceMesh, planningMesh, directions);
    const pruned = pruneDirections(analysis.directions, analysis, planningMesh, MASTER_PLANNER_LIMITS.maxCandidateDirections);
    analysis = pruned.analysis;
    entry = { planningMesh, directions: pruned.directions, analysis };
    if (planningCache.size >= PLANNING_CACHE_MAX_ENTRIES) {
      const oldest = planningCache.keys().next().value;
      if (oldest !== undefined) planningCache.delete(oldest);
    }
    planningCache.set(cacheKey, entry);
  }
  const { planningMesh, analysis } = entry;
  throwIfCancelled(hooks);

  // Stage B: piece-count optimization (cheap set-cover search).
  emit("optimizing_working_mold", "searching mold-piece count");
  const maxPieces = Math.min(
    seed.processProfile.maximumWorkingMoldPieceCount,
    seed.userPreferences.preferredMaximumWorkingMoldPieces ?? seed.processProfile.maximumWorkingMoldPieceCount,
    MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces,
  );
  const decomposition = planWorkingMoldDecomposition({
    planningMesh,
    analysis,
    maxWorkingMoldPieces: maxPieces,
  });
  budget.workingMoldPlanCandidateCount = decomposition?.finalists.length ?? 0;
  if (decomposition === null) {
    return {
      seedId: seed.seedId,
      plan: null,
      toolingSets: [],
      failures: [
        {
          moldPartId: "working-mold",
          reason: "no_release_plan",
          message: `no feasible working-mold decomposition within ${maxPieces} pieces; the part may require flexible/sacrificial tooling.`,
        },
      ],
      elapsedMs: Date.now() - started,
      budget,
    };
  }
  throwIfCancelled(hooks);

  // Stage C: exact construction of the shortlisted decomposition.
  emit("constructing_working_mold", `${decomposition.candidate.pieceCount} pieces`);
  let construction = null;
  let constructionFinalist: (typeof decomposition.finalists)[number] | null = null;
  let constructionError: Error | null = null;
  for (const finalist of decomposition.finalists) {
    throwIfCancelled(hooks);
    budget.workingMoldConstructionAttempts += 1;
    try {
      construction = await constructWorkingMold({
        sourceMesh: seed.sourceMesh,
        sourceBounds: seed.sourceBounds,
        releaseClearanceMm: seed.processProfile.releaseClearanceMm ?? 0,
        minimumToolingWallMm: seed.processProfile.minimumToolingWallMm,
        pieces: finalist.candidate.pieces.map((piece) => ({
          releaseDirection: piece.releaseDirection,
          plane: piece.prism === null
            ? null
            : {
                direction: analysis.directions[piece.prism.directionIndex]!.vector,
                offsetMm: piece.prism.offsetMm,
              },
        })),
      });
      constructionFinalist = finalist;
      break;
    } catch (error) {
      constructionError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (construction === null) {
    return {
      seedId: seed.seedId,
      plan: null,
      toolingSets: [],
      failures: [
        {
          moldPartId: "working-mold",
          reason: "no_release_plan",
          message: `no ${decomposition.candidate.pieceCount}-piece working-mold plan survived exact verification: ${constructionError?.message ?? "unknown"}`,
        },
      ],
      elapsedMs: Date.now() - started,
      budget,
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
        message: `${piece.name}: ${error instanceof Error ? error.message : "tooling construction failed."}`,
      });
    }
  }

  // Stage E: the plan contract.
  emit("verifying_release", `${pieceTargets.length} pieces verified`);
  const plan: AutoWorkingMoldPlan = {
    sourceGeometryVersion: seed.sourceGeometryVersion,
    moldPieces: pieceTargets,
    partingInterfaces: constructionFinalist?.interfaces ?? decomposition.finalists[0]?.interfaces ?? [],
    releaseSequence: construction.releaseSequence,
    registrationPlan: construction.registrationPlan,
    warnings,
    score: decomposition.candidate.scoreBreakdown,
    rejectedPieceCounts: decomposition.rejectedPieceCounts,
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
  const onePiece = await attemptOnePiece(castTarget, pourFace, parameters, pourFaceDecision.ventPlan.unresolvedRecommendations);
  let releaseMode: MasterToolingSet["releaseMode"] = "multi-piece";
  let pieces: readonly MasterToolingPiece[] = [];
  let releaseSequence: MasterToolingSet["assembly"]["releaseSequence"] = [];
  let coreMode: MasterToolingSet["assembly"]["coreMode"] = "split";
  let ventFeatures: MasterToolingSet["pourFaceDecision"]["ventPlan"]["features"] = [];
  let registrationFeatures: MasterToolingSet["assembly"]["registrationFeatures"] = [];
  let partingSurfaces: MasterToolingSet["partingSurfaces"] = [];

  if (onePiece !== null) {
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
    // Dense meshes already consume the exact-search budget and are not a
    // reliable signal for a localized lock. Keep the local-core primitive
    // available for bounded, feature-scale targets without adding a second
    // expensive search to the high-poly responsiveness path.
    if (negativeTool.mesh !== null && parameters.maxToolingPieces >= 2 && castTarget.mesh.indices.length / 3 <= 2000) {
      const localized = await planLocalizedRemovableCore(
        castTarget,
        pourFace,
        parameters,
        negativeTool.mesh,
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

/** Article 09 stage: build the one-piece case and exactly verify release + assembled negative. */
async function attemptOnePiece(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: ReturnType<typeof toolingParametersFromProfile>,
  recommendations: MasterToolingSet["pourFaceDecision"]["ventPlan"]["unresolvedRecommendations"],
): Promise<{ readonly pieces: readonly MasterToolingPiece[]; readonly releaseSequence: MasterToolingSet["assembly"]["releaseSequence"]; readonly ventFeatures: MasterToolingSet["pourFaceDecision"]["ventPlan"]["features"] } | null> {
  const module = await getManifoldModule();
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const policy = toolingTolerancePolicy(caseBounds);
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
  const axis = axisOf(pourFace);
  const sweepClearanceMm =
    (caseBounds.max[axis] - caseBounds.min[axis]) * TOOLING_ONE_PIECE_SWEEP_SAFETY_FACTOR;
  const ventFeatures = safeVentPathsFor(castTarget.bounds, caseBounds, castTarget.bounds, recommendations, parameters.caseWallThicknessMm);

  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let constructed;
  try {
    constructed = await constructCasePiece({ castTarget, pourFace, parameters, coreToolMesh: null, coreMode: "split", ventPaths: ventFeatures });
  } catch {
    targetSolid.delete();
    return null;
  }

  try {
    const releaseDirection = flipOf(pourFace);
    const sweep = verifyDemoldTranslation(targetSolid, constructed.solid, releaseDirection, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    if (!sweep.removable) return null;

    const assembled = await validateAssembledNegative([constructed.solid], castTarget, pourFace, parameters);
    if (assembled.overlapVolumeMm3 > volumeTolerance || assembled.residualVoidVolumeMm3 < -volumeTolerance || assembled.residualVoidVolumeMm3 > castTarget.volumeMm3) return null;

    const piece = pieceFromConstructed("piece-1", `${castTarget.moldPartName} Master Case`, constructed, releaseDirection, ["one-piece"]);
    return {
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
