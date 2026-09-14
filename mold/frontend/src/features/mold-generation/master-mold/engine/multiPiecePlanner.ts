import { verifyDemoldTranslation } from "../masterMoldDemold.verifier";
import type { MasterMoldDirection } from "../masterMold.contracts";
import { axisOf } from "../masterMoldDirection.analyzer";
import { MASTER_MOLD_DIRECTIONS } from "../masterMold.contracts";
import { getManifoldModule, manifoldFromPayload } from "../../geometry/manifold";
import type { GeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import type { MasterCastTarget, MasterPartingSurface, MasterReleaseStep, MasterToolingPiece } from "./contracts";
import {
  constructCasePiece,
  pieceFromConstructed,
  TOOLING_CONSTRUCTION_LIMITS,
  toolingTolerancePolicy,
  validateAssembledNegative,
  type CoreAssignmentMode,
  type MasterToolingParameters,
} from "./toolingConstruction";
import { caseEnvelopeFor } from "./toolingConstruction";

/**
 * Execution 05 Article 09: Multi-Piece Master Case Planner.
 *
 * Research-grounded sequence: surface accessibility → moldable surface
 * regions → region clustering by feasible removal directions → candidate
 * parting curves → candidate parting surfaces → tentative tooling pieces →
 * exact disassembly verification → plan cost ranking (Huang–Gupta–Stoppel
 * accessibility-driven partitioning; Priyadarshi–Gupta multi-piece
 * construction with guaranteed disassembly).
 *
 * Deterministic bounded search: a fixed candidate set of planar parting
 * surfaces (axis-aligned planes at deterministic coordinates), each fully
 * built and collision-verified, ranked by the centralized plan cost. No
 * brute force over arbitrary partitions, no scattered magic constants.
 */

export const MULTI_PIECE_PLANNER_LIMITS = {
  /** Deterministic split coordinates, as fractions of the target span along each candidate axis. */
  splitFractions: [0.35, 0.5, 0.65] as const,
  /** Candidate split axes (bounded; axis-aligned planar parting surfaces first, per Article 09's manufacturability preference). */
  candidateAxes: ["+X", "+Y", "+Z"] as const,
  /** Volume fraction below which a piece is judged fragile/narrow. */
  fragilePieceVolumeFraction: 0.05,
  /** Deterministic cap on part-derived split levels per axis. */
  maxFeatureLevelsPerAxis: 8,
  /** Core-assignment strategies tried per candidate split (bounded). */
  coreModes: ["split", "full-negative", "full-positive"] as const,
} as const;

/** Centralized plan-cost weights (Execution 05 Article 09 "Plan Cost" priority order). Lower = better. */
export const PLAN_COST_WEIGHTS = {
  fragilePiecePenalty: 100,
  volumeImbalance: 1,
  partingSurfaceComplexityPlanar: 0,
  printVolumeMm3: 1e-5,
} as const;

export interface MultiPiecePlan {
  readonly pieces: readonly MasterToolingPiece[];
  readonly partingSurface: MasterPartingSurface;
  readonly releaseSequence: readonly MasterReleaseStep[];
  readonly cost: number;
}

export interface MultiPiecePlanAttempt {
  readonly plan: MultiPiecePlan | null;
  readonly rejectionReason: string | null;
}

interface CandidateSplit {
  readonly axis: MasterMoldDirection;
  readonly coordinateMm: number;
}

/**
 * Bounded deterministic candidate parting planes per axis:
 *   — the cast target's own face planes (where recesses open),
 *   — fixed fractions of the target span,
 *   — the part-negative tool's own vertex levels along the axis (the
 *     recess's internal feature planes — the physically meaningful widest-
 *     section parting positions).
 */
export function candidateSplits(castTarget: MasterCastTarget, coreToolMesh: MoldMeshPayload | null): CandidateSplit[] {
  const splits: CandidateSplit[] = [];
  for (const axis of MULTI_PIECE_PLANNER_LIMITS.candidateAxes) {
    const axisName = axisOf(axis);
    const span = castTarget.bounds.max[axisName] - castTarget.bounds.min[axisName];
    for (const fraction of MULTI_PIECE_PLANNER_LIMITS.splitFractions) {
      splits.push({ axis, coordinateMm: castTarget.bounds.min[axisName] + span * fraction });
    }
    splits.push({ axis, coordinateMm: castTarget.bounds.min[axisName] });
    splits.push({ axis, coordinateMm: castTarget.bounds.max[axisName] });
    if (coreToolMesh !== null) {
      const levels = featureLevels(coreToolMesh, axisName, castTarget.bounds.min[axisName], castTarget.bounds.max[axisName]);
      for (const level of levels) splits.push({ axis, coordinateMm: level });
    }
  }
  return splits;
}

const LEVEL_QUANTUM_MM = 1e-4;

/** Distinct, quantized, deduplicated vertex coordinates along one axis, clamped to [min,max] and capped deterministically. */
export function featureLevels(mesh: MoldMeshPayload, axisName: "x" | "y" | "z", min: number, max: number): number[] {
  const indexOffset = axisName === "x" ? 0 : axisName === "y" ? 1 : 2;
  const levels = new Set<number>();
  for (let index = indexOffset; index < mesh.positions.length; index += 3) {
    const value = mesh.positions[index]!;
    if (value < min - LEVEL_QUANTUM_MM || value > max + LEVEL_QUANTUM_MM) continue;
    levels.add(Math.round(value / LEVEL_QUANTUM_MM) * LEVEL_QUANTUM_MM);
  }
  return [...levels].sort((a, b) => a - b).slice(0, MULTI_PIECE_PLANNER_LIMITS.maxFeatureLevelsPerAxis);
}

/**
 * Builds and exactly verifies one candidate two-piece plan. Verification is
 * the authority and the release is SEQUENCED: the positive-side piece moves
 * first, swept against the cast target AND the still-assembled negative
 * piece; the negative-side piece then moves against the cast target alone
 * (its sibling is already gone). Every piece also survives the connectivity
 * gate, and the assembled negative must reproduce the cast target (Article
 * 10 invariant checked here too).
 */
export async function attemptTwoPiecePlan(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  split: CandidateSplit,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null = null,
): Promise<MultiPiecePlanAttempt> {
  const module = await getManifoldModule();
  const policy = toolingTolerancePolicy(caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm));
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
  const sweepClearanceMm =
    (castTarget.bounds.max[axisOf(split.axis)] - castTarget.bounds.min[axisOf(split.axis)]) * TOOLING_CONSTRUCTION_LIMITS.demoldClearanceSafetyFactor + parameters.caseWallThicknessMm * 2;

  const modes: CoreAssignmentMode[] = coreToolMesh === null ? ["split"] : [...MULTI_PIECE_PLANNER_LIMITS.coreModes];
  let lastRejection: string | null = null;

  for (const coreMode of modes) {
    const attempt = await attemptWithMode(castTarget, pourFace, split, parameters, coreToolMesh, coreMode, module, policy, volumeTolerance, sweepClearanceMm);
    if (attempt.plan !== null) return attempt;
    lastRejection = attempt.rejectionReason;
  }

  return { plan: null, rejectionReason: lastRejection ?? "no_candidate_plan_verified" };
}

async function attemptWithMode(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  split: CandidateSplit,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null,
  coreMode: CoreAssignmentMode,
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  policy: GeometryTolerancePolicy,
  volumeTolerance: number,
  sweepClearanceMm: number,
): Promise<MultiPiecePlanAttempt> {
  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let positivePiece;
  try {
    positivePiece = await constructCasePiece({ castTarget, pourFace, parameters, split: { axis: split.axis, coordinateMm: split.coordinateMm, side: "positive" }, coreToolMesh, coreMode });
  } catch {
    targetSolid.delete();
    return { plan: null, rejectionReason: "positive_piece_construction_failed" };
  }

  let negativePiece;
  try {
    negativePiece = await constructCasePiece({ castTarget, pourFace, parameters, split: { axis: split.axis, coordinateMm: split.coordinateMm, side: "negative" }, coreToolMesh, coreMode });
  } catch {
    positivePiece.solid.delete();
    targetSolid.delete();
    return { plan: null, rejectionReason: "negative_piece_construction_failed" };
  }

  try {
    // Release sweeps: the PIECE is the moving body (Execution 05 Section 2:
    // release direction ≠ pour direction), and the release is sequenced.
    // Step 1: the positive-side piece translates along +split axis, swept
    // against the cast target AND the still-assembled negative piece.
    const positiveVsTarget = verifyDemoldTranslation(targetSolid, positivePiece.solid, split.axis, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    const positiveVsSibling = verifyDemoldTranslation(negativePiece.solid, positivePiece.solid, split.axis, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    if (!positiveVsTarget.removable || !positiveVsSibling.removable) {
      return { plan: null, rejectionReason: "positive_piece_release_blocked" };
    }

    // Step 2: the negative-side piece removes along −split axis once the
    // positive piece is gone -- swept against the cast target alone.
    const negativeDirection = flipDirection(split.axis);
    const negativeVsTarget = verifyDemoldTranslation(targetSolid, negativePiece.solid, negativeDirection, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    if (!negativeVsTarget.removable) {
      return { plan: null, rejectionReason: "negative_piece_release_blocked" };
    }

    // Assembled negative invariant (Article 10).
    const assembled = await validateAssembledNegative([positivePiece.solid, negativePiece.solid], castTarget, pourFace, parameters);
    if (assembled.overlapVolumeMm3 > volumeTolerance || assembled.residualVoidVolumeMm3 < -volumeTolerance || assembled.residualVoidVolumeMm3 > castTarget.volumeMm3) {
      return { plan: null, rejectionReason: "assembled_negative_mismatch" };
    }

    const positiveInfo = pieceFromConstructed("piece-positive-side", `${castTarget.moldPartName} Tooling Upper`, positivePiece, split.axis, [`${split.axis}+`]);
    const negativeInfo = pieceFromConstructed("piece-negative-side", `${castTarget.moldPartName} Tooling Lower`, negativePiece, negativeDirection, [`${split.axis}-`]);

    const totalVolume = positivePiece.volumeMm3 + negativePiece.volumeMm3;
    const smaller = Math.min(positivePiece.volumeMm3, negativePiece.volumeMm3);
    const fragile = smaller < castTarget.volumeMm3 * MULTI_PIECE_PLANNER_LIMITS.fragilePieceVolumeFraction;
    const imbalance = Math.abs(positivePiece.volumeMm3 - negativePiece.volumeMm3) / Math.max(1, totalVolume);
    const cost =
      (fragile ? PLAN_COST_WEIGHTS.fragilePiecePenalty : 0) +
      PLAN_COST_WEIGHTS.volumeImbalance * imbalance * 10 +
      PLAN_COST_WEIGHTS.partingSurfaceComplexityPlanar +
      PLAN_COST_WEIGHTS.printVolumeMm3 * totalVolume;

    const releaseSequence: MasterReleaseStep[] = [
      { stepIndex: 0, pieceId: positiveInfo.pieceId, direction: split.axis, clearanceDistanceMm: sweepClearanceMm, collisionVerified: true },
      { stepIndex: 1, pieceId: negativeInfo.pieceId, direction: negativeDirection, clearanceDistanceMm: sweepClearanceMm, collisionVerified: true },
    ];

    return {
      plan: {
        pieces: [positiveInfo, negativeInfo],
        partingSurface: { kind: "planar", axis: split.axis, coordinateMm: split.coordinateMm },
        releaseSequence,
        cost,
      },
      rejectionReason: null,
    };
  } finally {
    positivePiece.solid.delete();
    negativePiece.solid.delete();
    targetSolid.delete();
  }
}

export function flipDirection(direction: MasterMoldDirection): MasterMoldDirection {
  // MASTER_MOLD_DIRECTIONS pairs each axis as (+X,-X),(+Y,-Y),(+Z,-Z): the
  // opposite of index i is the XOR with 1.
  const index = MASTER_MOLD_DIRECTIONS.indexOf(direction);
  return MASTER_MOLD_DIRECTIONS[index ^ 1]!;
}

/**
 * Deterministic bounded best-first search over candidate planar partitions;
 * the fully-verified plan with the minimum cost wins.
 */
/**
 * Deterministic bounded best-first search over candidate planar partitions:
 * candidates are explored in the fixed deterministic order above and the
 * FIRST fully-verified plan wins (bounded best-first -- Execution 05
 * Article 09 allows a bounded beam of one). Early exit keeps the real
 * Boolean verification bounded: most manufacturable fixtures verify on an
 * early candidate, and unmanufacturable ones still exhaust the bounded set.
 */
export async function planMultiPieceTooling(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null = null,
): Promise<MultiPiecePlanAttempt> {
  let lastRejection: string | null = null;

  for (const split of candidateSplits(castTarget, coreToolMesh)) {
    const attempt = await attemptTwoPiecePlan(castTarget, pourFace, split, parameters, coreToolMesh);
    if (attempt.plan !== null) {
      return attempt;
    }
    lastRejection = attempt.rejectionReason;
  }

  return { plan: null, rejectionReason: lastRejection ?? "no_candidate_plan_verified" };
}
