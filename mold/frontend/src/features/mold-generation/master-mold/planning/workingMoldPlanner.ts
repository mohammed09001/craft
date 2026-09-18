import type {
  AccessibilityAnalysis,
  DecompositionCandidate,
  PlanningMesh,
  PlanningVector3,
  WorkingMoldPartingInterface,
  WorkingMoldPlanScore,
} from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { dot } from "./candidateDirections";

/**
 * Execution 06 Articles 06/07: the automatic working-mold piece count
 * optimizer (set cover over moldable regions) and geometry-driven parting
 * interfaces.
 *
 * Product policy: start at 2 pieces, never force two when the geometry is
 * mechanically locked, increase only while lower counts fail or score
 * materially worse, and cap at the profile limit. A failed two-piece plan is
 * planning evidence, not product failure.
 *
 * Search shape: a bounded beam over ordered half-space ("prism") sequences.
 * Piece i occupies the region beyond prism i's plane, minus all earlier
 * prisms; the final piece is the catch-all remainder released along its own
 * direction. Feasibility is decided purely from the accessibility matrix
 * (cheap); exact CSG happens later, on the shortlist only.
 */

const SLIDING_WALL_COSINE = 0.2;
const SEAM_INTERIOR_COSINE = 0.5;
const BEAM_WIDTH = 8;

interface BeamPrefix {
  readonly prisms: { readonly directionIndex: number; readonly offsetMm: number }[];
  readonly unassignable: number;
  readonly score: number;
}

export interface WorkingMoldDecompositionFinalist {
  readonly candidate: DecompositionCandidate;
  /** Patch -> piece index for this finalist. */
  readonly patchAssignment: readonly number[];
  readonly interfaces: readonly WorkingMoldPartingInterface[];
}

export interface WorkingMoldDecompositionPlan {
  /** The best feasible decomposition (also finalists[0]). */
  readonly candidate: DecompositionCandidate;
  /** Top candidates for this piece count, in score order -- the exact-verification shortlist (Article 13 stage F). */
  readonly finalists: readonly WorkingMoldDecompositionFinalist[];
  readonly rejectedPieceCounts: readonly { readonly pieceCount: number; readonly reason: string }[];
}

export interface WorkingMoldPlannerInput {
  readonly planningMesh: PlanningMesh;
  readonly analysis: AccessibilityAnalysis;
  readonly maxWorkingMoldPieces: number;
}

function unit(v: PlanningVector3): PlanningVector3 {
  const length = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Exact parting-plane offset for one direction: the smallest projection
 * among patches that are visible ONLY along it (d-exclusive patches --
 * front faces and blind recess interiors -- must all land inside the
 * prism; patches visible from both polarities may fall on either side).
 * One pass, provably the optimal half-space parting for that direction
 * (Article 07: geometry-driven parting surfaces, no arbitrary fractions).
 */
export function exactPartingThreshold(
  planningMesh: PlanningMesh,
  visibilityForDirection: readonly number[],
  visibilityOpposing: readonly number[],
  direction: PlanningVector3,
): number | null {
  let min = Infinity;
  for (const patch of planningMesh.patches) {
    const index = patch.patchIndex;
    if (visibilityForDirection[index] === 1 && visibilityOpposing[index] !== 1) {
      const projection = dot(patch.centroid, direction);
      if (projection < min) min = projection;
    }
  }
  if (!Number.isFinite(min)) return null;
  return Math.round(min * 1e4) / 1e4 - 1e-4;
}

/**
 * Evaluates one prism prefix: returns per-patch piece assignment (prism
 * pieces in order; patches outside all prisms get -1 = still remainder) and
 * the unassignable count assuming prisms only (no catch-all yet).
 */
function evaluatePrefix(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  prisms: { directionIndex: number; offsetMm: number }[],
): { assignment: Int32Array; unassignable: number } {
  const assignment = new Int32Array(planningMesh.patches.length).fill(-1);
  let unassignable = 0;
  for (const patch of planningMesh.patches) {
    let pieceIndex = -1;
    for (let p = 0; p < prisms.length; p += 1) {
      const prism = prisms[p]!;
      const direction = analysis.directions[prism.directionIndex]!.vector;
      if (dot(patch.centroid, direction) >= prism.offsetMm) {
        pieceIndex = p;
        break;
      }
    }
    assignment[patch.patchIndex] = pieceIndex;
  }
  // Prism pieces' feasibility can be pre-checked here; the remainder is
  // scored through the catch-all direction at finalization.
  for (const patch of planningMesh.patches) {
    const pieceIndex = assignment[patch.patchIndex]!;
    if (pieceIndex === -1) continue;
    const visibility = analysis.perDirection[prisms[pieceIndex]!.directionIndex]!.visible;
    if (visibility[patch.patchIndex] !== 1) unassignable += 1;
  }
  return { assignment, unassignable };
}

/** Full feasibility+score of a finalized decomposition (prefix + catch-all direction). */
function evaluateFinalized(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  prisms: { directionIndex: number; offsetMm: number }[],
  catchAllDirectionIndex: number,
): { candidate: DecompositionCandidate; assignment: Int32Array } {
  const patchCount = planningMesh.patches.length;
  const assignment = new Int32Array(patchCount).fill(-1);
  const pieceCount = prisms.length + 1;
  let unassignable = 0;
  let slidingWallAreaMm2 = 0;
  // Execution 07 LOOP 03 pre-CSG accessibility-gain gate: patches the
  // catch-all direction cannot see are the ONLY ones the prisms can rescue.
  let catchAllInvisible = 0;
  const catchAllVisible = analysis.perDirection[catchAllDirectionIndex]!.visible;
  for (const patch of planningMesh.patches) {
    if (catchAllVisible[patch.patchIndex] !== 1) catchAllInvisible += 1;
  }

  for (const patch of planningMesh.patches) {
    let pieceIndex = -1;
    for (let p = 0; p < prisms.length; p += 1) {
      const prism = prisms[p]!;
      const direction = analysis.directions[prism.directionIndex]!.vector;
      if (dot(patch.centroid, direction) >= prism.offsetMm) {
        pieceIndex = p;
        break;
      }
    }
    if (pieceIndex === -1) pieceIndex = pieceCount - 1;
    assignment[patch.patchIndex] = pieceIndex;

    const directionIndex = pieceIndex < prisms.length ? prisms[pieceIndex]!.directionIndex : catchAllDirectionIndex;
    const visible = analysis.perDirection[directionIndex]!.visible[patch.patchIndex] === 1;
    if (!visible) {
      unassignable += 1;
      continue;
    }
    const direction = analysis.directions[directionIndex]!.vector;
    if (Math.abs(dot(patch.normal, direction)) < SLIDING_WALL_COSINE) slidingWallAreaMm2 += patch.areaMm2;
  }

  // A split is useless when it rescues nothing: every patch is visible along
  // the catch-all alone, so the prisms add interfaces without accessibility
  // gain. Rejected here, before any exact CSG.
  const feasible = unassignable === 0 && catchAllInvisible > 0;

  // Parting-line quality: seam adjacency edges and whether they sit on a
  // natural silhouette (patch normal near-perpendicular to the releasing
  // piece's direction) or cut through a face interior.
  let seamCrossingCount = 0;
  for (const patch of planningMesh.patches) {
    for (const neighbor of planningMesh.adjacency[patch.patchIndex] ?? []) {
      if (neighbor <= patch.patchIndex) continue;
      if (assignment[patch.patchIndex] === assignment[neighbor]) continue;
      const directionIndex = assignment[patch.patchIndex]! < prisms.length
        ? prisms[assignment[patch.patchIndex]!]!.directionIndex
        : catchAllDirectionIndex;
      const direction = analysis.directions[directionIndex]!.vector;
      if (Math.abs(dot(patch.normal, direction)) > SEAM_INTERIOR_COSINE) seamCrossingCount += 1;
    }
  }

  // Piece robustness: area imbalance between the largest and smallest piece.
  const pieceAreas = new Array<number>(pieceCount).fill(0);
  for (const patch of planningMesh.patches) pieceAreas[assignment[patch.patchIndex]!]! += patch.areaMm2;
  const smallest = Math.min(...pieceAreas);
  const largest = Math.max(...pieceAreas);
  const areaImbalance = largest <= 0 ? 1 : (largest - smallest) / largest;

  const scoreBreakdown: WorkingMoldPlanScore = {
    slidingWallAreaMm2,
    seamCrossingCount,
    areaImbalance,
    interfaceCount: pieceCount - 1,
    total:
      slidingWallAreaMm2 * 1e-4 +
      seamCrossingCount * 0.05 +
      areaImbalance * 2 +
      pieceCount * 0.1,
  };

  const pieces = [
    ...prisms.map((prism, index) => {
      const direction = analysis.directions[prism.directionIndex]!.vector;
      return {
        releaseDirection: unit(direction),
        directionId: analysis.directions[prism.directionIndex]!.directionId,
        prism: { directionIndex: prism.directionIndex, offsetMm: prism.offsetMm },
        slot: index,
      };
    }),
    {
      releaseDirection: unit(analysis.directions[catchAllDirectionIndex]!.vector),
      directionId: analysis.directions[catchAllDirectionIndex]!.directionId,
      prism: null,
      slot: prisms.length,
    },
  ].map(({ releaseDirection, directionId, prism }) => ({ releaseDirection, directionId, prism }));

  return {
    assignment,
    candidate: {
      pieceCount,
      pieces,
      feasible,
      unassignablePatchCount: unassignable,
      score: scoreBreakdown.total,
      scoreBreakdown,
    },
  };
}

function interfaceLabel(a: number, b: number): string {
  return `wm-interface-${Math.min(a, b)}-${Math.max(a, b)}`;
}

/**
 * Extracts parting interfaces from the selected assignment: for every pair of
 * adjacent pieces, sample the shared boundary midpoints on the source
 * surface (silhouette-style parting curves, Article 07).
 *
 * Execution 07 LOOP 03: silhouette truth is decided per adjacency EDGE from
 * the edge's own patch A/B provenance -- the two actual patch normals against
 * BOTH pieces' release directions -- at interface creation time. The stored
 * midpoint sample is geometry only; no later lookup ever re-derives
 * classification (the previous centroid-equals-midpoint search counted
 * lookup misses as silhouette evidence).
 */
export function extractPartingInterfaces(
  planningMesh: PlanningMesh,
  assignment: Int32Array | readonly number[],
  pieces: DecompositionCandidate["pieces"],
): WorkingMoldPartingInterface[] {
  const samplesByPair = new Map<string, { pieceA: number; pieceB: number; points: PlanningVector3[]; silhouetteEdgeCount: number }>();
  for (const patch of planningMesh.patches) {
    for (const neighbor of planningMesh.adjacency[patch.patchIndex] ?? []) {
      if (neighbor <= patch.patchIndex) continue;
      const pieceA = assignment[patch.patchIndex]!;
      const pieceB = assignment[neighbor]!;
      if (pieceA === pieceB) continue;
      const other = planningMesh.patches[neighbor]!;
      const directionA = pieces[pieceA]!.releaseDirection;
      const directionB = pieces[pieceB]!.releaseDirection;
      // The edge sits on a natural silhouette when both of its patches slide
      // along both pieces' pull directions (normals near-perpendicular to
      // both); otherwise the parting cuts through a face interior.
      const slidesBoth = (normal: PlanningVector3) =>
        Math.abs(dot(normal, directionA)) < SEAM_INTERIOR_COSINE && Math.abs(dot(normal, directionB)) < SEAM_INTERIOR_COSINE;
      const edgeIsSilhouette = slidesBoth(patch.normal) && slidesBoth(other.normal);

      const key = interfaceLabel(pieceA, pieceB);
      let entry = samplesByPair.get(key);
      if (entry === undefined) {
        entry = { pieceA, pieceB, points: [], silhouetteEdgeCount: 0 };
        samplesByPair.set(key, entry);
      }
      if (entry.points.length >= 64) continue;
      if (edgeIsSilhouette) entry.silhouetteEdgeCount += 1;
      const a = patch.centroid;
      const b = other.centroid;
      entry.points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    }
  }
  return [...samplesByPair.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([interfaceId, entry]) => ({
      interfaceId,
      pieceAIndex: entry.pieceA,
      pieceBIndex: entry.pieceB,
      samplePoints: entry.points,
      kind: entry.silhouetteEdgeCount === entry.points.length ? ("silhouette" as const) : ("region-adjacency" as const),
    }));
}

/**
 * One per-count result of the incremental piece-count search: bounded
 * planning finalists for exact verification, or an explicit rejection
 * reason when the count produced none.
 */
export interface WorkingMoldPieceCountStep {
  readonly pieceCount: number;
  readonly finalists: readonly WorkingMoldDecompositionFinalist[];
  /** null exactly when finalists is non-empty. */
  readonly rejectionReason: string | null;
}

export interface WorkingMoldPieceCountSearch {
  /** Advances the beam to the next piece count (2 upward); null once counts are exhausted. */
  next(): WorkingMoldPieceCountStep | null;
}

/**
 * Incremental bounded beam search over prism sequences (Article 06 product
 * policy, Execution 07 LOOP 01): each next() call advances exactly one piece
 * count and hands back that count's planning finalists or its rejection
 * evidence. The exact-verification driver decides when to stop, so an exact
 * failure at N escalates to N+1 instead of terminating at the first
 * planning-feasible count.
 */
export function createWorkingMoldPieceCountSearch(input: WorkingMoldPlannerInput): WorkingMoldPieceCountSearch {
  const { planningMesh, analysis } = input;
  if (analysis.directions.length === 0 || planningMesh.patches.length === 0) {
    return { next: () => null };
  }

  const maxPieces = Math.max(
    2,
    Math.min(input.maxWorkingMoldPieces, MASTER_PLANNER_LIMITS.absoluteMaxWorkingMoldPieces),
  );

  // Depth-1 prefixes: single prisms over the kept directions.
  let pieceCount = 2;
  let beam: BeamPrefix[] = [];
  const evaluated = new Set<string>();
  const prefixKey = (prisms: { directionIndex: number; offsetMm: number }[]) => prisms.map((p) => `${p.directionIndex}@${p.offsetMm}`).join("|");

  const opposingVisibilityOf = (d: number): readonly number[] => {
    const vector = analysis.directions[d]!.vector;
    for (let j = 0; j < analysis.directions.length; j += 1) {
      if (j === d) continue;
      const other = analysis.directions[j]!.vector;
      if (vector.x * other.x + vector.y * other.y + vector.z * other.z < -0.999) {
        return analysis.perDirection[j]!.visible;
      }
    }
    return new Array<number>(planningMesh.patches.length).fill(0);
  };

  const extensionsOf = (prisms: { directionIndex: number; offsetMm: number }[]): { directionIndex: number; offsetMm: number }[] => {
    const directionBudget = prisms.length === 0
      ? analysis.directions.length
      : Math.min(analysis.directions.length, MASTER_PLANNER_LIMITS.maxCombinationDirections);
    const result: { directionIndex: number; offsetMm: number }[] = [];
    for (let d = 0; d < directionBudget; d += 1) {
      const offset = exactPartingThreshold(planningMesh, analysis.perDirection[d]!.visible, opposingVisibilityOf(d), analysis.directions[d]!.vector);
      if (offset === null) continue;
      result.push({ directionIndex: d, offsetMm: offset });
    }
    return result;
  };

  return {
    next(): WorkingMoldPieceCountStep | null {
      if (pieceCount > maxPieces) return null;
      const currentCount = pieceCount;
      pieceCount += 1;
      const prismCount = currentCount - 1;

      if (prismCount === 1) {
        beam = [];
        for (const prism of extensionsOf([])) {
          const key = prefixKey([prism]);
          if (evaluated.has(key)) continue;
          evaluated.add(key);
          const evaluation = evaluatePrefix(planningMesh, analysis, [prism]);
          beam.push({ prisms: [prism], unassignable: evaluation.unassignable, score: evaluation.unassignable });
        }
        // Promote the most-feasible prefixes into the finalize shortlist
        // regardless of candidate-direction insertion order (oblique
        // geometry-derived directions must compete with world axes).
        beam.sort((a, b) => a.unassignable - b.unassignable || a.score - b.score);
      } else {
        const nextBeam: BeamPrefix[] = [];
        const extensions = extensionsOf(beam[0]?.prisms ?? []);
        for (const prefix of beam) {
          for (const extension of extensions) {
            if (prefix.prisms.some((existing) => existing.directionIndex === extension.directionIndex)) continue;
            const prisms = [...prefix.prisms, extension];
            const key = prefixKey(prisms);
            if (evaluated.has(key)) continue;
            evaluated.add(key);
            const evaluation = evaluatePrefix(planningMesh, analysis, prisms);
            nextBeam.push({ prisms, unassignable: evaluation.unassignable, score: evaluation.unassignable + prisms.length * 0.01 });
          }
        }
        nextBeam.sort((a, b) => a.unassignable - b.unassignable || a.score - b.score);
        beam = nextBeam.slice(0, BEAM_WIDTH);
      }

      if (beam.length === 0) {
        return { pieceCount: currentCount, finalists: [], rejectionReason: "no_prism_prefix_survived_the_search_budget" };
      }

      // Finalize: attach a catch-all release direction to each surviving prefix.
      const finalized: { candidate: DecompositionCandidate; assignment: Int32Array; prisms: { directionIndex: number; offsetMm: number }[]; catchAllDirectionIndex: number }[] = [];
      for (const prefix of beam.slice(0, MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount * 4)) {
        for (let catchIndex = 0; catchIndex < analysis.directions.length; catchIndex += 1) {
          const result = evaluateFinalized(planningMesh, analysis, prefix.prisms, catchIndex);
          finalized.push({ ...result, prisms: prefix.prisms, catchAllDirectionIndex: catchIndex });
        }
      }

      const feasible = finalized
        .filter((entry) => entry.candidate.feasible)
        .sort(
          (a, b) =>
            a.candidate.scoreBreakdown.slidingWallAreaMm2 - b.candidate.scoreBreakdown.slidingWallAreaMm2 ||
            a.candidate.scoreBreakdown.seamCrossingCount - b.candidate.scoreBreakdown.seamCrossingCount ||
            a.candidate.score - b.candidate.score,
        );

      if (feasible.length === 0) {
        const best = finalized.sort((a, b) => a.candidate.unassignablePatchCount - b.candidate.unassignablePatchCount)[0];
        return {
          pieceCount: currentCount,
          finalists: [],
          rejectionReason: best === undefined
            ? "no_decomposition_candidate_generated"
            : best.candidate.unassignablePatchCount === 0
              ? "split_added_no_accessibility (the prisms did not improve on the catch-all release)"
              : `no_feasible_release_assignment (best left ${best.candidate.unassignablePatchCount} inaccessible patch group(s))`,
        };
      }

      const finalists = feasible
        .slice(0, MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount)
        .map((entry) => ({
          candidate: entry.candidate,
          patchAssignment: Array.from(entry.assignment),
          interfaces: extractPartingInterfaces(planningMesh, entry.assignment, entry.candidate.pieces),
        }));
      return { pieceCount: currentCount, finalists, rejectionReason: null };
    },
  };
}

/**
 * Single-shot planning-only view over the incremental search: the first
 * planning-feasible piece count, with the 2-piece plan kept as the preferred
 * candidate (and its finalists merged in front) when higher counts remain
 * allowed. Exact verification escalates per count via
 * createWorkingMoldPieceCountSearch (Execution 07 LOOP 01).
 */
export function planWorkingMoldDecomposition(input: WorkingMoldPlannerInput): WorkingMoldDecompositionPlan | null {
  const search = createWorkingMoldPieceCountSearch(input);
  const rejectedPieceCounts: { pieceCount: number; reason: string }[] = [];
  let preferredPlan: { readonly candidate: DecompositionCandidate; readonly finalists: readonly WorkingMoldDecompositionFinalist[] } | null = null;

  for (;;) {
    const step = search.next();
    if (step === null) break;
    if (step.rejectionReason !== null) {
      rejectedPieceCounts.push({ pieceCount: step.pieceCount, reason: step.rejectionReason });
      continue;
    }
    if (preferredPlan === null && step.pieceCount === 2 && input.maxWorkingMoldPieces > 2) {
      // Keep searching for a higher-count fallback. Exact verification may
      // reject every finalist at the preferred minimum count.
      preferredPlan = { candidate: step.finalists[0]!.candidate, finalists: step.finalists };
      continue;
    }
    if (preferredPlan !== null) {
      return {
        candidate: preferredPlan.candidate,
        finalists: [...preferredPlan.finalists, ...step.finalists],
        rejectedPieceCounts,
      };
    }
    return { candidate: step.finalists[0]!.candidate, finalists: step.finalists, rejectedPieceCounts };
  }

  return preferredPlan === null ? null : { ...preferredPlan, rejectedPieceCounts };
}
