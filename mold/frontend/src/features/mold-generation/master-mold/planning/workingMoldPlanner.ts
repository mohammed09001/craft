import type {
  AccessibilityAnalysis,
  DecompositionCandidate,
  PlanningMesh,
  PlanningVector3,
  SurfaceRegionGraph,
  WorkingMoldPartingInterface,
  WorkingMoldPieceCountDiagnostics,
  WorkingMoldPlanScore,
} from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";
import { dot } from "./candidateDirections";
import { buildSurfaceRegionGraph } from "./surfaceRegions";
import { greedyRegionCover } from "./regionSetCover";

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
const BEAM_WIDTH = MASTER_PLANNER_LIMITS.beamWidth;

interface BeamPrefix {
  readonly prisms: { readonly directionIndex: number; readonly offsetMm: number }[];
  readonly unassignable: number;
  readonly score: number;
  /** Execution 08 LOOP 18: sorted region indexes this prefix leaves entirely in the remainder -- the beam's diversity key. */
  readonly uncoveredRegionSignature: string;
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

const THRESHOLD_ROUND_DECIMALS = 1e4;

/**
 * Execution 08 LOOP 09: bounded multiple parting-threshold candidates per
 * direction (`MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection`,
 * previously defined but unused -- `exactPartingThreshold` alone gave every
 * direction exactly one offset attempt). A single valid release direction
 * must not fail the whole search because the ONE plane offset that was
 * tried happened to be the wrong one.
 *
 * Sources (Article 07): the exact direction-exclusive minimum (always
 * candidate 0 -- the geometrically tightest, provenly safe default), major
 * section changes (the largest gaps in the direction-exclusive patches'
 * own projection distribution -- a natural place to split off an isolated
 * cluster instead of dragging the whole prism down to include it), region
 * boundary projections (LOOP 05's region graph: each coherent region's own
 * entry point along the axis), and the undercut boundary level (the
 * furthest projection among BLOCKED patches -- a more conservative cut
 * that clears every inaccessible patch entirely, rather than the minimal
 * exclusive-patch cut).
 */
export function candidatePartingThresholds(
  planningMesh: PlanningMesh,
  visibilityForDirection: readonly number[],
  visibilityOpposing: readonly number[],
  direction: PlanningVector3,
  regionGraph: SurfaceRegionGraph,
): number[] {
  const primary = exactPartingThreshold(planningMesh, visibilityForDirection, visibilityOpposing, direction);
  if (primary === null) return [];

  const exclusiveProjections: number[] = [];
  let maxBlockedProjection = -Infinity;
  for (const patch of planningMesh.patches) {
    const index = patch.patchIndex;
    const projection = dot(patch.centroid, direction);
    if (visibilityForDirection[index] === 1 && visibilityOpposing[index] !== 1) exclusiveProjections.push(projection);
    if (visibilityForDirection[index] !== 1 && projection > maxBlockedProjection) maxBlockedProjection = projection;
  }

  const candidates: number[] = [primary];
  const pushCandidate = (value: number) => {
    if (!Number.isFinite(value)) return;
    const rounded = Math.round(value * THRESHOLD_ROUND_DECIMALS) / THRESHOLD_ROUND_DECIMALS;
    if (candidates.some((existing) => Math.abs(existing - rounded) < 1 / THRESHOLD_ROUND_DECIMALS)) return;
    candidates.push(rounded);
  };

  // Major section changes: the largest gaps in the exclusive-patch
  // projection distribution -- each gap's upper edge is a candidate cut
  // that leaves the isolated lower cluster out of the prism.
  const sorted = [...exclusiveProjections].sort((a, b) => a - b);
  const gaps: { size: number; afterValue: number }[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const size = sorted[index]! - sorted[index - 1]!;
    if (size > 1e-6) gaps.push({ size, afterValue: sorted[index]! });
  }
  gaps.sort((a, b) => b.size - a.size);
  for (const gap of gaps) {
    if (candidates.length >= MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection) break;
    pushCandidate(gap.afterValue - 1e-4);
  }

  // Region boundary projections: each region touching this direction's
  // exclusive set contributes its own entry point along the axis.
  for (const region of regionGraph.regions) {
    if (candidates.length >= MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection) break;
    let regionMin = Infinity;
    let touchesExclusive = false;
    for (const patchIndex of region.patchIndexes) {
      if (visibilityForDirection[patchIndex] === 1 && visibilityOpposing[patchIndex] !== 1) {
        touchesExclusive = true;
        const projection = dot(planningMesh.patches[patchIndex]!.centroid, direction);
        if (projection < regionMin) regionMin = projection;
      }
    }
    if (touchesExclusive) pushCandidate(regionMin - 1e-4);
  }

  // Undercut boundary level: a conservative cut that clears every blocked
  // patch entirely (may sacrifice more material than the minimal cut, but
  // is sometimes the only offset that yields a physically sound prism).
  if (candidates.length < MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection && Number.isFinite(maxBlockedProjection)) {
    pushCandidate(maxBlockedProjection + 1e-4);
  }

  return candidates.slice(0, MASTER_PLANNER_LIMITS.maxPartingThresholdsPerDirection);
}

/**
 * Execution 08 LOOP 10: piece ownership is decided by whole MOLDABLE
 * REGIONS (LOOP 05's region graph), never by an individual patch's raw
 * spatial position -- a coherent surface feature can no longer be silently
 * split across two pieces just because a prism plane happens to cut through
 * its interior (inventing a seam through a face interior instead of a
 * natural boundary).
 *
 * Ownership is an AREA-WEIGHTED MAJORITY VOTE among a region's own member
 * patches' raw per-patch assignment (the same ordered half-space walk a
 * patch always used), applied ONLY when it is SAFE: every member patch
 * must remain visible along the majority piece's own direction. A region
 * can have real spatial extent -- on a smoothly curved closed body a
 * cone-capped region can legitimately span a whole polar cap, ~10% of the
 * surface -- and forcing such a region unconditionally can push thousands
 * of individually well-assigned patches onto a direction that cannot
 * actually see them, measurably WORSENING accessibility versus the raw
 * per-patch rule (caught directly against the high-poly sphere golden
 * case). When forcing would break any member, that region falls back to
 * its raw per-patch assignment untouched -- a provable non-regression: this
 * can only ever match or improve on the old per-patch-only behavior, never
 * make it worse.
 */
function regionOwnedAssignment(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  regionGraph: SurfaceRegionGraph,
  prisms: { directionIndex: number; offsetMm: number }[],
  remainderPieceIndex: number,
  remainderDirectionIndex: number | null,
): Int32Array {
  const directionIndexOf = (pieceIndex: number): number | null =>
    pieceIndex >= 0 && pieceIndex < prisms.length ? prisms[pieceIndex]!.directionIndex : remainderDirectionIndex;

  const rawAssignment = new Int32Array(planningMesh.patches.length);
  for (const patch of planningMesh.patches) {
    let pieceIndex = remainderPieceIndex;
    for (let p = 0; p < prisms.length; p += 1) {
      const prism = prisms[p]!;
      const direction = analysis.directions[prism.directionIndex]!.vector;
      if (dot(patch.centroid, direction) >= prism.offsetMm) {
        pieceIndex = p;
        break;
      }
    }
    rawAssignment[patch.patchIndex] = pieceIndex;
  }

  // null = unsafe to force; that region keeps its raw per-patch assignment.
  const regionOwner = new Array<number | null>(regionGraph.regions.length).fill(null);
  for (const region of regionGraph.regions) {
    const areaByPiece = new Map<number, number>();
    for (const patchIndex of region.patchIndexes) {
      const pieceIndex = rawAssignment[patchIndex]!;
      areaByPiece.set(pieceIndex, (areaByPiece.get(pieceIndex) ?? 0) + planningMesh.patches[patchIndex]!.areaMm2);
    }
    let bestPiece = remainderPieceIndex;
    let bestArea = -1;
    for (const [pieceIndex, area] of areaByPiece) {
      // Deterministic tie-break: prefer the lower piece index (earlier prism).
      if (area > bestArea || (area === bestArea && pieceIndex < bestPiece)) {
        bestArea = area;
        bestPiece = pieceIndex;
      }
    }
    const bestDirectionIndex = directionIndexOf(bestPiece);
    const safe = bestDirectionIndex === null
      ? true
      : region.patchIndexes.every((patchIndex) => analysis.perDirection[bestDirectionIndex]!.visible[patchIndex] === 1);
    if (safe) regionOwner[region.regionIndex] = bestPiece;
  }

  const assignment = new Int32Array(planningMesh.patches.length);
  for (let patchIndex = 0; patchIndex < planningMesh.patches.length; patchIndex += 1) {
    const regionIndex = regionGraph.regionOfPatch[patchIndex] ?? -1;
    const forced = regionIndex >= 0 ? regionOwner[regionIndex] : null;
    assignment[patchIndex] = forced ?? rawAssignment[patchIndex]!;
  }
  return assignment;
}

/**
 * Evaluates one prism prefix: returns per-patch piece assignment (prism
 * pieces in order; patches outside all prisms get -1 = still remainder) and
 * the unassignable count assuming prisms only (no catch-all yet).
 */
function evaluatePrefix(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  regionGraph: SurfaceRegionGraph,
  prisms: { directionIndex: number; offsetMm: number }[],
): { assignment: Int32Array; unassignable: number } {
  const assignment = regionOwnedAssignment(planningMesh, analysis, regionGraph, prisms, -1, null);
  let unassignable = 0;
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

/** Sorted, deduplicated region indexes an assignment leaves entirely in the remainder (-1) -- a beam prefix's diversity key (Execution 08 LOOP 18). */
function uncoveredRegionSignature(assignment: Int32Array, regionGraph: SurfaceRegionGraph): string {
  const regions = new Set<number>();
  for (let patchIndex = 0; patchIndex < assignment.length; patchIndex += 1) {
    if (assignment[patchIndex] !== -1) continue;
    const regionIndex = regionGraph.regionOfPatch[patchIndex];
    if (regionIndex !== undefined && regionIndex >= 0) regions.add(regionIndex);
  }
  return [...regions].sort((a, b) => a - b).join(",");
}

/**
 * Execution 08 LOOP 18: region-aware beam selection. A pure top-N-by-score
 * slice can collapse the whole beam onto near-identical variations of the
 * single best-scoring prefix, silently dropping a lower-scored prefix that
 * is the only one addressing some DIFFERENT unresolved region -- exactly
 * the failure mode Article 18 describes. Candidates are admitted in score
 * order, but a candidate whose uncovered-region signature duplicates one
 * already in the beam is skipped in favor of a still-distinct one; only
 * once distinct signatures are exhausted does the beam fill remaining
 * slots by score alone. The beam width itself (`BEAM_WIDTH`) is never
 * raised -- diversity is a selection policy within the existing bound.
 */
function selectDiverseBeam(candidates: readonly BeamPrefix[], width: number): BeamPrefix[] {
  const ranked = [...candidates].sort((a, b) => a.unassignable - b.unassignable || a.score - b.score);
  const selected: BeamPrefix[] = [];
  const seenSignatures = new Set<string>();
  const leftover: BeamPrefix[] = [];
  for (const candidate of ranked) {
    if (selected.length >= width) break;
    if (seenSignatures.has(candidate.uncoveredRegionSignature)) {
      leftover.push(candidate);
      continue;
    }
    seenSignatures.add(candidate.uncoveredRegionSignature);
    selected.push(candidate);
  }
  for (const candidate of leftover) {
    if (selected.length >= width) break;
    selected.push(candidate);
  }
  return selected;
}

/** Full feasibility+score of a finalized decomposition (prefix + catch-all direction). Exported for direct testing (Execution 08 LOOP 15). */
export function evaluateFinalized(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  regionGraph: SurfaceRegionGraph,
  prisms: { directionIndex: number; offsetMm: number }[],
  catchAllDirectionIndex: number,
): { candidate: DecompositionCandidate; assignment: Int32Array; unassignableRegionIndexes: ReadonlySet<number> } {
  const pieceCount = prisms.length + 1;
  // Execution 08 LOOP 10: region-consistent ownership (see
  // regionOwnedAssignment) -- a coherent region can no longer be split
  // across pieces by a prism plane cutting through its interior.
  const assignment = regionOwnedAssignment(planningMesh, analysis, regionGraph, prisms, pieceCount - 1, catchAllDirectionIndex);
  let unassignable = 0;
  // Execution 08 LOOP 15: a "blocked" classification (LOOP 06: every
  // scale-aware probe offset agreed) is an unambiguous, hard rejection.
  // "grazing"/"uncertain" is a planning-level AMBIGUITY, not a proven
  // block -- exact CSG (Article 41's real final authority) is far better
  // positioned to resolve it than a cheap ray cast, so it must not by
  // itself reject the whole decomposition before exact verification ever
  // runs. Only a hard-blocked patch counts against feasibility.
  let hardBlockedPatchCount = 0;
  let slidingWallAreaMm2 = 0;
  // Execution 08 LOOP 20: WHICH regions the unassignable patches belong to,
  // not just how many patches -- a precise, per-attempt diagnostic instead
  // of a raw count with no geometric referent.
  const unassignableRegionIndexes = new Set<number>();
  // Execution 07 LOOP 03 pre-CSG accessibility-gain gate: patches the
  // catch-all direction cannot see are the ONLY ones the prisms can rescue.
  let catchAllInvisible = 0;
  const catchAllVisible = analysis.perDirection[catchAllDirectionIndex]!.visible;
  for (const patch of planningMesh.patches) {
    if (catchAllVisible[patch.patchIndex] !== 1) catchAllInvisible += 1;
  }

  for (const patch of planningMesh.patches) {
    const pieceIndex = assignment[patch.patchIndex]!;
    const directionIndex = pieceIndex < prisms.length ? prisms[pieceIndex]!.directionIndex : catchAllDirectionIndex;
    const perDirection = analysis.perDirection[directionIndex]!;
    const visible = perDirection.visible[patch.patchIndex] === 1;
    if (!visible) {
      unassignable += 1;
      const classification = perDirection.classification[patch.patchIndex];
      if (classification !== "grazing" && classification !== "uncertain") hardBlockedPatchCount += 1;
      const regionIndex = regionGraph.regionOfPatch[patch.patchIndex];
      if (regionIndex !== undefined && regionIndex >= 0) unassignableRegionIndexes.add(regionIndex);
      continue;
    }
    const direction = analysis.directions[directionIndex]!.vector;
    if (Math.abs(dot(patch.normal, direction)) < SLIDING_WALL_COSINE) slidingWallAreaMm2 += patch.areaMm2;
  }

  // A split is useless when it rescues nothing: every patch is visible along
  // the catch-all alone, so the prisms add interfaces without accessibility
  // gain. Rejected here, before any exact CSG. Execution 08 LOOP 15: only a
  // HARD-blocked patch disqualifies the split; a grazing/uncertain one is
  // let through to exact verification instead of rejecting the plan on a
  // planning-level ambiguity alone.
  const feasible = hardBlockedPatchCount === 0 && catchAllInvisible > 0;

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
    unassignableRegionIndexes,
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
  /** Execution 08 LOOP 01: machine-readable evidence for why this count did (or did not) produce finalists. */
  readonly diagnostics: WorkingMoldPieceCountDiagnostics;
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
  const regionGraph = buildSurfaceRegionGraph(planningMesh);
  // Execution 08 LOOP 11: computed once per search (direction-set-dependent,
  // not piece-count-dependent) -- how many directions a bounded set-cover
  // needs to release every moldable region, and which regions (if any) no
  // direction can reach at all.
  const regionCover = greedyRegionCover(regionGraph, planningMesh, analysis);
  const regionSetCoverUncoveredRegionCount = regionCover.uncoveredRegionIndexes.length;
  const regionSetCoverMinimumPieceEstimate = regionSetCoverUncoveredRegionCount === 0 ? regionCover.steps.length : null;

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

  // Execution 08 LOOP 09: every direction offers its full bounded set of
  // threshold candidates, not just the single exact-exclusive-minimum --
  // one valid release direction must not fail the search because the ONE
  // offset tried happened to be the wrong one.
  const extensionsOf = (prisms: { directionIndex: number; offsetMm: number }[]): { directionIndex: number; offsetMm: number }[] => {
    const directionBudget = prisms.length === 0
      ? analysis.directions.length
      : Math.min(analysis.directions.length, MASTER_PLANNER_LIMITS.maxCombinationDirections);
    const result: { directionIndex: number; offsetMm: number }[] = [];
    for (let d = 0; d < directionBudget; d += 1) {
      const offsets = candidatePartingThresholds(planningMesh, analysis.perDirection[d]!.visible, opposingVisibilityOf(d), analysis.directions[d]!.vector, regionGraph);
      for (const offset of offsets) result.push({ directionIndex: d, offsetMm: offset });
    }
    return result;
  };

  return {
    next(): WorkingMoldPieceCountStep | null {
      if (pieceCount > maxPieces) return null;
      const currentCount = pieceCount;
      pieceCount += 1;
      const prismCount = currentCount - 1;

      let combinationDirectionCountUsed: number;
      let thresholdCountUsed: number;

      if (prismCount === 1) {
        beam = [];
        const extensions = extensionsOf([]);
        combinationDirectionCountUsed = analysis.directions.length;
        thresholdCountUsed = extensions.length;
        for (const prism of extensions) {
          const key = prefixKey([prism]);
          if (evaluated.has(key)) continue;
          evaluated.add(key);
          const evaluation = evaluatePrefix(planningMesh, analysis, regionGraph, [prism]);
          beam.push({
            prisms: [prism],
            unassignable: evaluation.unassignable,
            score: evaluation.unassignable,
            uncoveredRegionSignature: uncoveredRegionSignature(evaluation.assignment, regionGraph),
          });
        }
        // Region-aware diverse selection (LOOP 18), not a plain top-N score
        // slice: oblique geometry-derived directions must compete with
        // world axes, AND a prefix addressing a different unresolved region
        // must not be silently dropped just because its raw score is worse.
        beam = selectDiverseBeam(beam, BEAM_WIDTH);
      } else {
        const nextBeam: BeamPrefix[] = [];
        const extensions = extensionsOf(beam[0]?.prisms ?? []);
        combinationDirectionCountUsed = Math.min(analysis.directions.length, MASTER_PLANNER_LIMITS.maxCombinationDirections);
        thresholdCountUsed = extensions.length;
        for (const prefix of beam) {
          for (const extension of extensions) {
            if (prefix.prisms.some((existing) => existing.directionIndex === extension.directionIndex)) continue;
            const prisms = [...prefix.prisms, extension];
            const key = prefixKey(prisms);
            if (evaluated.has(key)) continue;
            evaluated.add(key);
            const evaluation = evaluatePrefix(planningMesh, analysis, regionGraph, prisms);
            nextBeam.push({
              prisms,
              unassignable: evaluation.unassignable,
              score: evaluation.unassignable + prisms.length * 0.01,
              uncoveredRegionSignature: uncoveredRegionSignature(evaluation.assignment, regionGraph),
            });
          }
        }
        beam = selectDiverseBeam(nextBeam, BEAM_WIDTH);
      }

      if (beam.length === 0) {
        const diagnostics: WorkingMoldPieceCountDiagnostics = {
          pieceCount: currentCount,
          planningCandidatesGenerated: 0,
          planningCandidatesFeasible: 0,
          bestUnassignablePatchCount: null,
          bestUnresolvedRegionCount: null,
          rejectionReason: "no_prism_prefix_survived_the_search_budget",
          candidateDirectionCountUsed: analysis.directions.length,
          combinationDirectionCountUsed,
          thresholdCountUsed,
          beamSizeUsed: beam.length,
          regionSetCoverMinimumPieceEstimate,
          regionSetCoverUncoveredRegionCount,
        };
        logPlanningDiagnostics(diagnostics);
        return { pieceCount: currentCount, finalists: [], rejectionReason: diagnostics.rejectionReason, diagnostics };
      }

      // Finalize: attach a catch-all release direction to each surviving prefix.
      const finalized: { candidate: DecompositionCandidate; assignment: Int32Array; unassignableRegionIndexes: ReadonlySet<number>; prisms: { directionIndex: number; offsetMm: number }[]; catchAllDirectionIndex: number }[] = [];
      for (const prefix of beam.slice(0, MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount * 4)) {
        for (let catchIndex = 0; catchIndex < analysis.directions.length; catchIndex += 1) {
          const result = evaluateFinalized(planningMesh, analysis, regionGraph, prefix.prisms, catchIndex);
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

      const bestUnassignablePatchCount = finalized.reduce<number | null>(
        (best, entry) => (best === null ? entry.candidate.unassignablePatchCount : Math.min(best, entry.candidate.unassignablePatchCount)),
        null,
      );

      if (feasible.length === 0) {
        const best = finalized.sort((a, b) => a.candidate.unassignablePatchCount - b.candidate.unassignablePatchCount)[0];
        const bestUnresolvedRegionCount = best === undefined ? null : best.unassignableRegionIndexes.size;
        // Execution 08 LOOP 11: a stronger, more honest rejection when
        // region set-cover PROVES this piece count is directionally
        // achievable -- the failure is this search's prism-ORDERING
        // combinatorics, not a lack of any viable release direction.
        const coverProvesAchievable = regionSetCoverMinimumPieceEstimate !== null && regionSetCoverMinimumPieceEstimate <= currentCount;
        // Execution 08 LOOP 20: name the unresolved REGION count, not just
        // the raw patch count -- a precise geometric referent a person (or
        // a later loop) can act on.
        const baseReason = best === undefined
          ? "no_decomposition_candidate_generated"
          : best.candidate.unassignablePatchCount === 0
            ? "split_added_no_accessibility (the prisms did not improve on the catch-all release)"
            : `no_feasible_release_assignment (best left ${best.candidate.unassignablePatchCount} inaccessible patch(es) across ${bestUnresolvedRegionCount} unresolved region(s))`;
        const diagnostics: WorkingMoldPieceCountDiagnostics = {
          pieceCount: currentCount,
          planningCandidatesGenerated: finalized.length,
          planningCandidatesFeasible: 0,
          bestUnassignablePatchCount,
          bestUnresolvedRegionCount,
          rejectionReason: coverProvesAchievable
            ? `${baseReason} (region set-cover proves ${regionSetCoverMinimumPieceEstimate} direction(s) can release every region; this search's prism ordering did not find a matching geometric arrangement)`
            : baseReason,
          candidateDirectionCountUsed: analysis.directions.length,
          combinationDirectionCountUsed,
          thresholdCountUsed,
          beamSizeUsed: beam.length,
          regionSetCoverMinimumPieceEstimate,
          regionSetCoverUncoveredRegionCount,
        };
        logPlanningDiagnostics(diagnostics);
        return { pieceCount: currentCount, finalists: [], rejectionReason: diagnostics.rejectionReason, diagnostics };
      }

      const finalists = feasible
        .slice(0, MASTER_PLANNER_LIMITS.maxExactPlansPerPieceCount)
        .map((entry) => ({
          candidate: entry.candidate,
          patchAssignment: Array.from(entry.assignment),
          interfaces: extractPartingInterfaces(planningMesh, entry.assignment, entry.candidate.pieces),
        }));
      const diagnostics: WorkingMoldPieceCountDiagnostics = {
        pieceCount: currentCount,
        planningCandidatesGenerated: finalized.length,
        planningCandidatesFeasible: feasible.length,
        bestUnassignablePatchCount,
        bestUnresolvedRegionCount: bestUnassignablePatchCount === null ? null : 0,
        rejectionReason: null,
        candidateDirectionCountUsed: analysis.directions.length,
        combinationDirectionCountUsed,
        thresholdCountUsed,
        beamSizeUsed: beam.length,
        regionSetCoverMinimumPieceEstimate,
        regionSetCoverUncoveredRegionCount,
      };
      logPlanningDiagnostics(diagnostics);
      return { pieceCount: currentCount, finalists, rejectionReason: null, diagnostics };
    },
  };
}

/** Execution 08 LOOP 01: developer-log surface for planning diagnostics (bounded: at most one line per piece count per run). */
function logPlanningDiagnostics(diagnostics: WorkingMoldPieceCountDiagnostics): void {
  if (typeof console === "undefined") return;
  console.debug("[MasterMold planning]", diagnostics);
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
