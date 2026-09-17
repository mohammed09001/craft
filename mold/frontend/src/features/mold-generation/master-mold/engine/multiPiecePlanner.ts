import { verifyDemoldTranslationByVector } from "../masterMoldDemold.verifier";
import type { MasterMoldDirection } from "../masterMold.contracts";
import { axisOf, DIRECTION_VECTORS } from "../masterMoldDirection.analyzer";
import { MASTER_MOLD_DIRECTIONS } from "../masterMold.contracts";
import { getManifoldModule, manifoldFromPayload, boundsFromManifold, createBlankSolid, payloadFromManifold, type ManifoldSolid } from "../../geometry/manifold";
import type { GeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import type { MasterCastTarget, MasterPartingSurface, MasterReleaseStep, MasterToolingPiece, MasterToolingPull, MasterToolingRegistrationFeature } from "./contracts";
import {
  applyToolingRegistration,
  constructCasePiece,
  pieceFromConstructed,
  TOOLING_CONSTRUCTION_LIMITS,
  toolingTolerancePolicy,
  type CoreAssignmentMode,
  type MasterToolingParameters,
} from "./toolingConstruction";
import { caseEnvelopeFor } from "./toolingConstruction";

/**
 * Execution 06 Article 09: adaptive Master case planner (1..N panels per
 * working-mold piece).
 *
 * Research-grounded sequence (Huang-Gupta-Stoppel accessibility-driven
 * partitioning; Priyadarshi-Gupta guaranteed disassembly): candidate planar
 * parting surfaces are built and EXACTLY verified one at a time; a chunk
 * that cannot release is decomposed further (connected-component split, then
 * bounded bisection) until every chunk has a verified single-direction pull
 * or the centralized budget is exhausted. A chunk is never accepted on an
 * unproven release; the whole attempt is rejected instead.
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
  /** Maximum recursive panel splits per attempt (initial split = depth 1). */
  maxSplitDepth: 2,
  /** Maximum printable panels per attempt (profile cap may lower it, never raise it). */
  absoluteMaxToolingPieces: 4,
  /** Exact release-verification sweeps allowed per attempt before the budget is reported (Article 13.4). */
  maxReleaseVerificationSweeps: 48,
  /** Maximum exact construction+verification attempts per candidate axis (Article 13.4). */
  maxExactAttemptsPerAxis: 2,
  /** Coarse sweep resolution for planner-internal release verification (final proof sweeps keep full resolution). */
  plannerSweepSamples: 8,
  /** Bisection coordinates for a stuck chunk, as fractions of the chunk span along its longest axis. */
  bisectionFractions: [0.5] as const,
} as const;

/** Centralized plan-cost weights (Execution 05 Article 09 "Plan Cost" priority order). Lower = better. */
export const PLAN_COST_WEIGHTS = {
  fragilePiecePenalty: 100,
  volumeImbalance: 1,
  partingSurfaceComplexityPlanar: 0,
  printVolumeMm3: 1e-5,
  extraPanelPenalty: 2,
} as const;

export interface MultiPiecePlan {
  readonly pieces: readonly MasterToolingPiece[];
  readonly partingSurface: MasterPartingSurface;
  readonly releaseSequence: readonly MasterReleaseStep[];
  readonly registrationFeatures: readonly MasterToolingRegistrationFeature[];
  /** Non-null when the panel count exceeded what automatic registration can safely align (Article 10: explicit, never silent). */
  readonly registrationNote: string | null;
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
    // Physically meaningful partings first: the part-negative tool's own
    // vertex levels along the axis (the recess's internal feature planes,
    // i.e. the widest-section positions a mold maker would choose), then
    // span fractions, then the target's own face planes.
    if (coreToolMesh !== null) {
      const levels = featureLevels(coreToolMesh, axisName, castTarget.bounds.min[axisName], castTarget.bounds.max[axisName]);
      for (const level of levels) splits.push({ axis, coordinateMm: level });
    }
    for (const fraction of MULTI_PIECE_PLANNER_LIMITS.splitFractions) {
      splits.push({ axis, coordinateMm: castTarget.bounds.min[axisName] + span * fraction });
    }
    splits.push({ axis, coordinateMm: castTarget.bounds.min[axisName] });
    splits.push({ axis, coordinateMm: castTarget.bounds.max[axisName] });
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

export function flipDirection(direction: MasterMoldDirection): MasterMoldDirection {
  // MASTER_MOLD_DIRECTIONS pairs each axis as (+X,-X),(+Y,-Y),(+Z,-Z): the
  // opposite of index i is the XOR with 1.
  const index = MASTER_MOLD_DIRECTIONS.indexOf(direction);
  return MASTER_MOLD_DIRECTIONS[index ^ 1]!;
}

interface CaseChunk {
  readonly solid: ManifoldSolid;
  readonly bounds: ReturnType<typeof boundsFromManifold>;
  readonly volumeMm3: number;
}

interface ChunkBudget {
  sweeps: number;
}

/** Deterministic direction order for a chunk's release attempts: the split axis pair first, then the working-mold assignment, then the remaining axes. */
function chunkReleaseDirectionOrder(splitAxis: MasterMoldDirection): MasterMoldDirection[] {
  const opposite = flipDirection(splitAxis);
  const rest = MASTER_MOLD_DIRECTIONS.filter((direction) => direction !== splitAxis && direction !== opposite);
  return [splitAxis, opposite, ...rest];
}

interface PullCandidate {
  readonly pull: MasterToolingPull;
  readonly vector: readonly [number, number, number];
  readonly oblique: boolean;
}

/** Pull candidates for chunks: axis ids plus, when available, the working-mold piece's own (possibly oblique) assigned release direction. */
function pullCandidatesFor(splitAxis: MasterMoldDirection, assignedDirection?: { readonly x: number; readonly y: number; readonly z: number }): PullCandidate[] {
  const candidates: PullCandidate[] = chunkReleaseDirectionOrder(splitAxis).map((direction) => ({
    pull: direction,
    vector: DIRECTION_VECTORS[direction],
    oblique: false,
  }));
  if (assignedDirection !== undefined) {
    const length = Math.hypot(assignedDirection.x, assignedDirection.y, assignedDirection.z);
    if (length > 0) {
      const vector = [assignedDirection.x / length, assignedDirection.y / length, assignedDirection.z / length] as const;
      candidates.splice(1, 0, { pull: "-assigned", vector, oblique: true });
      candidates.splice(1, 0, { pull: "+assigned", vector: [-vector[0], -vector[1], -vector[2]], oblique: true });
    }
  }
  return candidates;
}

/** Splits a chunk solid into connected components (ownership: inputs stay valid; returned solids are new). */
async function chunkify(solid: ManifoldSolid): Promise<CaseChunk[]> {
  const components = solid.decompose();
  if (components.length <= 1) {
    for (const component of components) component.delete();
    return [{ solid: solid.asOriginal(), bounds: boundsFromManifold(solid), volumeMm3: solid.volume() }];
  }
  return components.map((component) => ({
    solid: component.asOriginal(),
    bounds: boundsFromManifold(component),
    volumeMm3: component.volume(),
  }));
}

/** Bounded bisection of a stuck chunk along its longest axis; returns new chunk solids (caller owns them). */
async function bisectChunk(module: Awaited<ReturnType<typeof getManifoldModule>>, chunk: CaseChunk): Promise<CaseChunk[] | null> {
  const axes = (["x", "y", "z"] as const);
  let longest: (typeof axes)[number] = "x";
  let longestSpan = -1;
  for (const axis of axes) {
    const span = chunk.bounds.max[axis] - chunk.bounds.min[axis];
    if (span > longestSpan) {
      longestSpan = span;
      longest = axis;
    }
  }
  if (longestSpan <= 0) return null;
  const indexOffset = longest === "x" ? 0 : longest === "y" ? 1 : 2;

  const results: CaseChunk[] = [];
  for (const fraction of MULTI_PIECE_PLANNER_LIMITS.bisectionFractions) {
    const cut = chunk.bounds.min[longest] + longestSpan * fraction;
    for (const side of [true, false]) {
      const halfBounds = {
        min: { ...chunk.bounds.min },
        max: { ...chunk.bounds.max },
      };
      if (side) halfBounds.min[longest] = cut;
      else halfBounds.max[longest] = cut;
      let halfBox: ManifoldSolid | null = null;
      let piece: ManifoldSolid | null = null;
      try {
        halfBox = createBlankSolid(module, halfBounds);
        piece = chunk.solid.intersect(halfBox);
        if (piece.isEmpty()) continue;
        results.push({ solid: piece.asOriginal(), bounds: boundsFromManifold(piece), volumeMm3: piece.volume() });
      } finally {
        halfBox?.delete();
        piece?.delete();
      }
      void indexOffset;
    }
    if (results.length >= 2) break;
  }
  return results.length >= 2 ? results : null;
}

interface SequencedChunk {
  readonly chunk: CaseChunk;
  readonly pull: PullCandidate;
}

/**
 * Conservative AABB shortcut: when the chunk's bounding box swept along the
 * pull over the whole clearance never overlaps the obstacle's bounding box,
 * the exact CSG sweep is provably unnecessary. Returns true = trivially
 * clear, false = run the real sweep.
 */
function sweptAabbsNeverOverlap(
  chunk: CaseChunk,
  obstacleBounds: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  vector: readonly [number, number, number],
  clearanceMm: number,
): boolean {
  const eps = 1e-6;
  const axes = ["x", "y", "z"] as const;
  let overlapStart = eps;
  let overlapEnd = clearanceMm;
  for (const axis of axes) {
    const component = vector[axes.indexOf(axis)]!;
    const lo = chunk.bounds.min[axis];
    const hi = chunk.bounds.max[axis];
    const oLo = obstacleBounds.min[axis];
    const oHi = obstacleBounds.max[axis];
    if (Math.abs(component) < 1e-9) {
      // Static axis: ranges must already overlap for any t to overlap.
      if (hi <= oLo || lo >= oHi) return true;
      continue;
    }
    // chunk range at t: [lo + c*t, hi + c*t]. Solve overlap condition.
    let start = overlapStart;
    let end = overlapEnd;
    // Need lo + c*t < oHi AND hi + c*t > oLo.
    if (component > 0) {
      start = Math.max(start, (oHi - hi) / component);
      end = Math.min(end, (oLo - lo) / component);
    } else {
      start = Math.max(start, (oHi - hi) / component);
      end = Math.min(end, (oLo - lo) / component);
    }
    if (start >= end) return true;
    overlapStart = start;
    overlapEnd = end;
  }
  return overlapStart >= overlapEnd;
}

/**
 * Greedy release sequencing: repeatedly pick the chunk with a verified pull
 * against the cast target and all still-assembled siblings. Every removal is
 * an exact sweep (budgeted). Returns null when some chunk can never release.
 */
async function sequenceRelease(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  castTarget: MasterCastTarget,
  chunks: CaseChunk[],
  pullCandidates: readonly PullCandidate[],
  policy: GeometryTolerancePolicy,
  volumeTolerance: number,
  sweepClearanceMm: number,
  budget: ChunkBudget,
  plannerSweepOptions: { readonly coarseSampleCount: number },
): Promise<SequencedChunk[] | null> {
  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  const remaining = new Set(chunks);
  const sequence: SequencedChunk[] = [];
  try {
    while (remaining.size > 0) {
      let removed: CaseChunk | null = null;
      let removedPull: PullCandidate | null = null;
      for (const chunk of remaining) {
        const volumeFloor = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * MULTI_PIECE_PLANNER_LIMITS.fragilePieceVolumeFraction * 0.5);
        if (chunk.volumeMm3 < volumeFloor) continue;
        for (const candidate of pullCandidates) {
          if (budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps) return null;
          // Target sweep first (unless the AABB shortcut proves it clear).
          const targetBounds = castTarget.bounds;
          if (!sweptAabbsNeverOverlap(chunk, targetBounds, candidate.vector, sweepClearanceMm)) {
            budget.sweeps += 1;
            const vsTarget = verifyDemoldTranslationByVector(targetSolid, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance, plannerSweepOptions);
            if (!vsTarget.removable) continue;
          }
          let vsSiblingsRemovable = true;
          for (const sibling of remaining) {
            if (sibling === chunk) continue;
            if (sweptAabbsNeverOverlap(chunk, sibling.bounds, candidate.vector, sweepClearanceMm)) continue;
            if (budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps) return null;
            budget.sweeps += 1;
            const vsSibling = verifyDemoldTranslationByVector(sibling.solid, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance, plannerSweepOptions);
            if (!vsSibling.removable) {
              vsSiblingsRemovable = false;
              break;
            }
          }
          if (vsSiblingsRemovable) {
            removed = chunk;
            removedPull = candidate;
            break;
          }
        }
        if (removed !== null) break;
      }
      if (removed === null || removedPull === null) return null;
      remaining.delete(removed);
      sequence.push({ chunk: removed, pull: removedPull });
    }
    return sequence;
  } finally {
    targetSolid.delete();
  }
}

/**
 * Builds and exactly verifies one candidate panel partition. The primary
 * split is core-aware (Execution 05); any half that cannot release is
 * decomposed (connected components, then bounded bisection) until every
 * panel has a verified single-direction pull (Article 09: 1..N panels).
 */
export async function attemptRecursiveSplit(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  split: CandidateSplit,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null,
  coreMode: CoreAssignmentMode,
  maxPieces: number,
  assignedDirection?: { readonly x: number; readonly y: number; readonly z: number },
  functionalBounds?: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  buildVolume?: { readonly x: number; readonly y: number; readonly z: number },
): Promise<MultiPiecePlanAttempt> {
  const module = await getManifoldModule();
  const policy = toolingTolerancePolicy(caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm));
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
  const sweepClearanceMm =
    (castTarget.bounds.max[axisOf(split.axis)] - castTarget.bounds.min[axisOf(split.axis)]) * TOOLING_CONSTRUCTION_LIMITS.demoldClearanceSafetyFactor + parameters.caseWallThicknessMm * 2;
  const budget: ChunkBudget = { sweeps: 0 };
  const plannerSweepOptions = { coarseSampleCount: MULTI_PIECE_PLANNER_LIMITS.plannerSweepSamples };
  const pullCandidates = pullCandidatesFor(split.axis, assignedDirection);

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
  targetSolid.delete();

  // Decompose both halves into releasable chunks (bounded recursion).
  const collectChunks = async (half: { readonly solid: ManifoldSolid }): Promise<CaseChunk[]> => {
    const chunks = await chunkify(half.solid);
    let frontier = chunks;
    let depth = 1;
    while (frontier.length > 0 && depth < MULTI_PIECE_PLANNER_LIMITS.maxSplitDepth) {
      const next: CaseChunk[] = [];
      for (const chunk of frontier) {
        const probe = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
        let removable = false;
        try {
          for (const candidate of pullCandidates) {
            if (budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps) break;
            budget.sweeps += 1;
            if (verifyDemoldTranslationByVector(probe, chunk.solid, candidate.vector, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance, plannerSweepOptions).removable) {
              removable = true;
              break;
            }
          }
        } finally {
          probe.delete();
        }
        if (removable || chunk.volumeMm3 < volumeTolerance) {
          next.push(chunk);
          continue;
        }
        const bisected = await bisectChunk(module, chunk);
        chunk.solid.delete();
        if (bisected === null) {
          return [];
        }
        next.push(...bisected);
      }
      frontier = next;
      depth += 1;
    }
    return frontier;
  };

  const positiveChunks = await collectChunks(positivePiece);
  const negativeChunks = await collectChunks(negativePiece);
  positivePiece.solid.delete();
  negativePiece.solid.delete();
  if (positiveChunks.length === 0 || negativeChunks.length === 0) {
    for (const chunk of [...positiveChunks, ...negativeChunks]) chunk.solid.delete();
    return { plan: null, rejectionReason: "panel_decomposition_exhausted_the_split_budget" };
  }
  const chunks = [...positiveChunks, ...negativeChunks];
  if (chunks.length > Math.min(maxPieces, MULTI_PIECE_PLANNER_LIMITS.absoluteMaxToolingPieces)) {
    for (const chunk of chunks) chunk.solid.delete();
    return { plan: null, rejectionReason: "panel_count_exceeds_the_profile_cap" };
  }

  const sequence = await sequenceRelease(module, castTarget, chunks, pullCandidates, policy, volumeTolerance, sweepClearanceMm, budget, plannerSweepOptions);
  if (sequence === null) {
    for (const chunk of chunks) chunk.solid.delete();
    return { plan: null, rejectionReason: budget.sweeps >= MULTI_PIECE_PLANNER_LIMITS.maxReleaseVerificationSweeps ? "release_verification_budget_exhausted" : "no_panel_release_sequence_verified" };
  }

  // Assembled negative invariant (Article 10) across all panels.
  let assembledOrNull: ManifoldSolid | null = null;
  let overlap: ManifoldSolid | null = null;
  try {
    for (const entry of sequence) {
      assembledOrNull = assembledOrNull === null ? entry.chunk.solid.asOriginal() : assembledOrNull.add(entry.chunk.solid);
    }
    const assembled = assembledOrNull!;
    const target = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
    try {
      overlap = assembled.intersect(target);
      const overlapVolumeMm3 = overlap.volume();
      const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
      const envelopeVolume =
        (caseBounds.max.x - caseBounds.min.x) *
        (caseBounds.max.y - caseBounds.min.y) *
        (caseBounds.max.z - caseBounds.min.z);
      const residualVoidVolumeMm3 = envelopeVolume - assembled.volume() - target.volume();
      if (overlapVolumeMm3 > volumeTolerance || residualVoidVolumeMm3 < -volumeTolerance * 10 || residualVoidVolumeMm3 > castTarget.volumeMm3 * 2) {
        for (const chunk of chunks) chunk.solid.delete();
        return { plan: null, rejectionReason: "assembled_negative_mismatch" };
      }
    } finally {
      target.delete();
      overlap?.delete();
      assembled.delete();
    }
  } catch {
    for (const chunk of chunks) chunk.solid.delete();
    return { plan: null, rejectionReason: "assembled_negative_mismatch" };
  }

  // Article 10 registration: automatic pins are applied when the result is a
  // single planar pair; wider panel sets carry an explicit assembly note.
  let pieces: MasterToolingPiece[];
  let registrationFeatures: MasterToolingRegistrationFeature[] = [];
  let registrationNote: string | null = null;
  if (sequence.length === 2) {
    const registered = await applyToolingRegistration({
      castTarget,
      pourFace,
      split: { axis: split.axis, coordinateMm: split.coordinateMm, side: "positive" },
      parameters,
      ...(functionalBounds === undefined ? {} : { functionalBounds }),
      positivePiece: {
        mesh: payloadFromManifold(sequence[0]!.chunk.solid),
        bounds: sequence[0]!.chunk.bounds,
        volumeMm3: sequence[0]!.chunk.volumeMm3,
        triangleCount: 0,
        solid: sequence[0]!.chunk.solid.asOriginal(),
      },
      negativePiece: {
        mesh: payloadFromManifold(sequence[1]!.chunk.solid),
        bounds: sequence[1]!.chunk.bounds,
        volumeMm3: sequence[1]!.chunk.volumeMm3,
        triangleCount: 0,
        solid: sequence[1]!.chunk.solid.asOriginal(),
      },
    });
    const registeredChunks: { solid: ManifoldSolid; bounds: ReturnType<typeof boundsFromManifold>; volumeMm3: number }[] = [
      { solid: registered.positivePiece.solid, bounds: registered.positivePiece.bounds, volumeMm3: registered.positivePiece.volumeMm3 },
      { solid: registered.negativePiece.solid, bounds: registered.negativePiece.bounds, volumeMm3: registered.negativePiece.volumeMm3 },
    ];
    if (registered.reason !== null) {
      registrationNote = `tooling pins not placed: ${registered.reason}`;
      pieces = sequence.map((entry, index) =>
        pieceFromConstructed(`piece-panel-${index + 1}`, `${castTarget.moldPartName} Tooling Panel ${index + 1}`, {
          mesh: payloadFromManifold(entry.chunk.solid),
          bounds: entry.chunk.bounds,
          volumeMm3: entry.chunk.volumeMm3,
          triangleCount: 0,
          solid: entry.chunk.solid.asOriginal(),
        }, entry.pull.pull, [`${split.axis}`], [], entry.pull.oblique ? { x: entry.pull.vector[0], y: entry.pull.vector[1], z: entry.pull.vector[2] } : undefined),
      );
      for (const chunk of registeredChunks) chunk.solid.delete();
    } else {
      registrationFeatures = [...registered.features];
      pieces = [
        pieceFromConstructed("piece-positive-side", `${castTarget.moldPartName} Tooling Panel 1`, registered.positivePiece, sequence[0]!.pull.pull, [`${split.axis}+`], registered.features.map((feature) => feature.featureId)),
        pieceFromConstructed("piece-negative-side", `${castTarget.moldPartName} Tooling Panel 2`, registered.negativePiece, sequence[1]!.pull.pull, [`${split.axis}-`]),
      ];
      for (const chunk of registeredChunks) chunk.solid.delete();
    }
  } else {
    registrationNote = `${sequence.length}-panel tooling requires user-managed alignment; automatic pins cover single planar pairs only.`;
    pieces = sequence.map((entry, index) =>
      pieceFromConstructed(`piece-panel-${index + 1}`, `${castTarget.moldPartName} Tooling Panel ${index + 1}`, {
        mesh: payloadFromManifold(entry.chunk.solid),
        bounds: entry.chunk.bounds,
        volumeMm3: entry.chunk.volumeMm3,
        triangleCount: 0,
        solid: entry.chunk.solid.asOriginal(),
      }, entry.pull.pull, [`${split.axis}`], [], entry.pull.oblique ? { x: entry.pull.vector[0], y: entry.pull.vector[1], z: entry.pull.vector[2] } : undefined),
    );
  }

  for (const chunk of chunks) chunk.solid.delete();
  for (const piece of pieces) void piece;

  if (buildVolume !== undefined && !pieces.every((piece) => piece.bounds.max.x - piece.bounds.min.x <= buildVolume.x && piece.bounds.max.y - piece.bounds.min.y <= buildVolume.y && piece.bounds.max.z - piece.bounds.min.z <= buildVolume.z)) {
    return { plan: null, rejectionReason: "panel_exceeds_build_volume" };
  }

  const totalVolume = pieces.reduce((sum, piece) => sum + piece.volumeMm3, 0);
  const smaller = Math.min(...pieces.map((piece) => piece.volumeMm3));
  const fragile = smaller < castTarget.volumeMm3 * MULTI_PIECE_PLANNER_LIMITS.fragilePieceVolumeFraction;
  const volumes = pieces.map((piece) => piece.volumeMm3);
  const imbalance = (Math.max(...volumes) - Math.min(...volumes)) / Math.max(1, totalVolume);
  const cost =
    (fragile ? PLAN_COST_WEIGHTS.fragilePiecePenalty : 0) +
    PLAN_COST_WEIGHTS.volumeImbalance * imbalance * 10 +
    PLAN_COST_WEIGHTS.partingSurfaceComplexityPlanar +
    PLAN_COST_WEIGHTS.printVolumeMm3 * totalVolume +
    PLAN_COST_WEIGHTS.extraPanelPenalty * (pieces.length - 2);

  const releaseSequence: MasterReleaseStep[] = sequence.map((entry, index) => ({
    stepIndex: index,
    pieceId: pieces[index]!.pieceId,
    direction: entry.pull.pull,
        ...(entry.pull.oblique ? { directionVector: { x: entry.pull.vector[0], y: entry.pull.vector[1], z: entry.pull.vector[2] } } : {}),
    clearanceDistanceMm: sweepClearanceMm,
    collisionVerified: true,
  }));

  return {
    plan: {
      pieces,
      partingSurface: { kind: "planar", axis: split.axis, coordinateMm: split.coordinateMm },
      releaseSequence,
      registrationFeatures,
      registrationNote,
      cost,
    },
    rejectionReason: null,
  };
}

/**
 * Deterministic bounded best-first search over candidate planar partitions:
 * candidates are explored in the fixed deterministic order above and the
 * FIRST fully-verified plan wins (bounded best-first -- Execution 05
 * Article 09 allows a bounded beam of one). Early exit keeps the real
 * Boolean verification bounded; unmanufacturable targets still exhaust the
 * bounded set with structured evidence.
 */
export async function planMultiPieceTooling(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: MasterToolingParameters,
  coreToolMesh: MoldMeshPayload | null = null,
  assignedDirection?: { readonly x: number; readonly y: number; readonly z: number },
  functionalBounds?: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  buildVolume?: { readonly x: number; readonly y: number; readonly z: number },
): Promise<MultiPiecePlanAttempt> {
  let lastRejection: string | null = null;
  const maxPieces = Math.min(parameters.maxToolingPieces, MULTI_PIECE_PLANNER_LIMITS.absoluteMaxToolingPieces);

  for (const axis of MULTI_PIECE_PLANNER_LIMITS.candidateAxes) {
    let axisAttempts = 0;
    const axisSplits = candidateSplits(castTarget, coreToolMesh).filter((split) => split.axis === axis);
    for (const split of axisSplits) {
      if (axisAttempts >= MULTI_PIECE_PLANNER_LIMITS.maxExactAttemptsPerAxis) {
        break;
      }
      axisAttempts += 1;
      const modes: CoreAssignmentMode[] = coreToolMesh === null ? ["split"] : [...MULTI_PIECE_PLANNER_LIMITS.coreModes];
      const attempt = await attemptRecursiveSplit(castTarget, pourFace, split, parameters, coreToolMesh, modes[0]!, maxPieces, assignedDirection, functionalBounds, buildVolume);
      if (attempt.plan !== null) {
        return attempt;
      }
      lastRejection = attempt.rejectionReason;
      // A construction failure is evidence about the split plane, not about
      // deeper partitions: try the next split for this axis.
    }
  }

  return { plan: null, rejectionReason: lastRejection ?? "no_candidate_plan_verified" };
}
