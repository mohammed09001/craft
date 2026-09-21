import type { AccessibilityAnalysis, PlanningMesh, PlanningVector3 } from "./masterMoldPlanning.contracts";
import { dot } from "./candidateDirections";
import { extractPartingInterfaces, type WorkingMoldDecompositionFinalist } from "./workingMoldPlanner";
import type { PlannedPieceRegion } from "./workingMoldConstructor";
import type { RegionDirectAssignmentResult } from "./regionDirectAssignment";

/** Splits `patches` into mesh-adjacency-connected components, using `planningMesh.adjacency`. */
function splitIntoConnectedComponents(patches: readonly number[], adjacency: PlanningMesh["adjacency"]): number[][] {
  const patchSet = new Set(patches);
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const start of patches) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of adjacency[current] ?? []) {
        if (patchSet.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

interface PhysicalPiece {
  readonly directionIndex: number;
  readonly patches: readonly number[];
}

function computeComponentsByDirection(
  assignment: Int32Array,
  adjacency: PlanningMesh["adjacency"],
): { directionIndex: number; patches: number[] }[] {
  const patchesByDirection = new Map<number, number[]>();
  for (let patchIndex = 0; patchIndex < assignment.length; patchIndex += 1) {
    const directionIndex = assignment[patchIndex]!;
    if (directionIndex === -1) continue;
    const list = patchesByDirection.get(directionIndex) ?? [];
    list.push(patchIndex);
    patchesByDirection.set(directionIndex, list);
  }
  const components: { directionIndex: number; patches: number[] }[] = [];
  for (const [directionIndex, patches] of patchesByDirection) {
    for (const component of splitIntoConnectedComponents(patches, adjacency)) {
      components.push({ directionIndex, patches: component });
    }
  }
  return components;
}

/**
 * Execution 08 LOOP 02/14/28 (fragmentation root cause, upstream of every
 * construction technique): `buildRegionDirectAssignment` assigns each
 * region to the FIRST piece (in greedy cover order) that fully sees it --
 * a purely visibility-driven, first-match decision with zero regard for
 * whether the resulting per-direction patch set is spatially compact.
 * Measured directly against the real free-form regression fixture: 132 of
 * 187 regions (70%) are fully visible from MORE than one of the 5 chosen
 * directions, so this first-match tie-break is genuinely arbitrary for most
 * of the surface, not forced by geometry.
 *
 * `splitIntoConnectedComponents` (below) already proved a single
 * direction's own assigned patches routinely land in several
 * mesh-disconnected components (visibility does not require adjacency).
 * This pass tries, for every component OTHER than a direction's own
 * largest ("orphan" components), to reassign it wholesale to an
 * ALTERNATIVE direction that (a) also fully covers every one of its
 * patches' regions (from `alternativePiecesByPatch`, so this never
 * assigns a patch to a direction that cannot actually see it) and (b) is
 * mesh-adjacent to it (some patch in the orphan component neighbors a
 * patch already assigned to that alternative) -- i.e. only merges an
 * orphan into a piece it would actually become topologically CONNECTED
 * to, never just relocates fragmentation elsewhere. Repeats to a fixpoint
 * (capped) since one merge can newly expose adjacency for another orphan.
 * A component with no valid, adjacent alternative is left exactly as it
 * was -- this can only reduce fragmentation, never increase it.
 */
function absorbSmallDisconnectedComponents(planningMesh: PlanningMesh, direct: RegionDirectAssignmentResult): Int32Array {
  const assignment = Int32Array.from(direct.assignment);
  const MAX_PASSES = 8;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const components = computeComponentsByDirection(assignment, planningMesh.adjacency);
    const largestSizeByDirection = new Map<number, number>();
    for (const component of components) {
      const current = largestSizeByDirection.get(component.directionIndex) ?? 0;
      if (component.patches.length > current) largestSizeByDirection.set(component.directionIndex, component.patches.length);
    }
    let changed = false;
    for (const component of components) {
      if (component.patches.length === largestSizeByDirection.get(component.directionIndex)) continue; // this direction's own primary component.

      let candidates: Set<number> | null = null;
      for (const patchIndex of component.patches) {
        const alternatives: readonly number[] = direct.alternativePiecesByPatch[patchIndex] ?? [];
        const ownAlternatives = new Set<number>(alternatives.filter((pieceIndex) => pieceIndex !== component.directionIndex));
        if (candidates === null) {
          candidates = ownAlternatives;
        } else {
          const intersected = new Set<number>();
          for (const pieceIndex of candidates) if (ownAlternatives.has(pieceIndex)) intersected.add(pieceIndex);
          candidates = intersected;
        }
        if (candidates.size === 0) break;
      }
      if (candidates === null || candidates.size === 0) continue;

      let chosen = -1;
      for (const patchIndex of component.patches) {
        for (const neighbor of planningMesh.adjacency[patchIndex] ?? []) {
          const neighborDirection = assignment[neighbor]!;
          if (candidates.has(neighborDirection)) {
            chosen = neighborDirection;
            break;
          }
        }
        if (chosen !== -1) break;
      }
      if (chosen === -1) continue;

      for (const patchIndex of component.patches) assignment[patchIndex] = chosen;
      changed = true;
    }
    if (!changed) break;
  }
  return assignment;
}

/**
 * Splits each region-cover direction's assigned patches into its own
 * mesh-connected components (see `buildDirectAssignmentConstructionPieces`'s
 * own doc comment for why this matters), producing one `PhysicalPiece` per
 * component, still tagged with its parent direction. Shared by both the
 * CSG-boundary and volumetric construction paths below -- the disjoint-
 * assignment problem this fixes is upstream of and common to both.
 *
 * Runs `absorbSmallDisconnectedComponents` first so a spatially-adjacent
 * alternative direction is preferred over accepting an arbitrary orphan
 * fragment as its own physical piece.
 */
function buildPhysicalPieces(
  planningMesh: PlanningMesh,
  direct: RegionDirectAssignmentResult,
): readonly PhysicalPiece[] | null {
  const directionCount = direct.pieceDirectionIndexes.length;
  if (directionCount < 2) return null;
  const assignment = absorbSmallDisconnectedComponents(planningMesh, direct);
  const patchesByDirection = new Map<number, number[]>();
  for (let patchIndex = 0; patchIndex < assignment.length; patchIndex += 1) {
    const directionIndex = assignment[patchIndex]!;
    const list = patchesByDirection.get(directionIndex) ?? [];
    list.push(patchIndex);
    patchesByDirection.set(directionIndex, list);
  }
  const physicalPieces: PhysicalPiece[] = [];
  for (let directionIndex = 0; directionIndex < directionCount; directionIndex += 1) {
    const patches = patchesByDirection.get(directionIndex) ?? [];
    if (patches.length === 0) return null; // an empty direction: this assignment is unusable.
    for (const component of splitIntoConnectedComponents(patches, planningMesh.adjacency)) {
      physicalPieces.push({ directionIndex, patches: component });
    }
  }
  return physicalPieces.length < 2 ? null : physicalPieces;
}

/** Test-only seam: exposes the PRE-absorption component list, for measuring the absorption pass's own effect. */
export function __TEST_ONLY_componentsBeforeAbsorption(
  planningMesh: PlanningMesh,
  direct: RegionDirectAssignmentResult,
): readonly PhysicalPiece[] {
  return computeComponentsByDirection(direct.assignment, planningMesh.adjacency);
}

/** Test-only seam: exposes the post-absorption component list for direct measurement without running full CSG/volumetric construction. */
export function __TEST_ONLY_buildPhysicalPieceComponents(
  planningMesh: PlanningMesh,
  direct: RegionDirectAssignmentResult,
): readonly PhysicalPiece[] {
  return buildPhysicalPieces(planningMesh, direct) ?? [];
}

/**
 * Execution 08 LOOP 02/14/28 (volumetric reconstruction): turns a
 * `buildRegionDirectAssignment` result into inputs for
 * `constructWorkingMold`'s volumetric partition mode -- see
 * `volumetricPartition.ts`'s own doc comment for the full mechanism and
 * why it replaces every CSG-boundary attempt this project tried (all of
 * which diverged on the real free-form regression fixture).
 *
 * Unlike `buildDirectAssignmentConstructionPieces` below, there is no
 * catch-all here: a genuine 3D nearest-SURFACE partition covers the whole
 * envelope by construction (every point has SOME nearest triangle among
 * ALL pieces), so every physical piece -- including what would have been
 * "the last one" in the CSG-boundary construction -- gets built the exact
 * same way, symmetrically, with `otherTriangleIndices` spanning every
 * OTHER physical piece.
 *
 * Only real SOURCE TRIANGLE indices are produced here -- no point sampling
 * at all. `volumetricAssignmentSolid` queries the actual continuous
 * triangle surface (via `MeshBVH.closestPointToPoint`), not a discrete
 * approximation of it; see that function's own doc comment for why every
 * earlier point-sampling attempt here (centroids, then vertices, then a
 * density-proportional barycentric grid) was a real bug, not just
 * imprecision, and had to be replaced rather than tuned further.
 */
export function buildVolumetricConstructionPieces(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  direct: RegionDirectAssignmentResult,
): { readonly pieces: readonly PlannedPieceRegion[]; readonly interfaces: WorkingMoldDecompositionFinalist["interfaces"] } | null {
  if (direct.unassignedPatchCount > 0) return null;
  const physicalPieces = buildPhysicalPieces(planningMesh, direct);
  if (physicalPieces === null) return null;

  const releaseDirections = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.vector);
  const directionIds = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.directionId);
  const interfaces = extractPartingInterfaces(
    planningMesh,
    direct.assignment,
    releaseDirections.map((releaseDirection, index) => ({ releaseDirection, directionId: directionIds[index]!, prism: null })),
  );

  const triangleIndicesOf = (physical: PhysicalPiece): number[] =>
    physical.patches.map((patchIndex) => planningMesh.patches[patchIndex]!.sourceTriangle);

  const pieces: PlannedPieceRegion[] = physicalPieces.map((physical, pieceIndex) => {
    const direction = releaseDirections[physical.directionIndex]!;
    const ownTriangleIndices = triangleIndicesOf(physical);
    const otherTriangleIndices: number[] = [];
    for (let otherIndex = 0; otherIndex < physicalPieces.length; otherIndex += 1) {
      if (otherIndex === pieceIndex) continue;
      otherTriangleIndices.push(...triangleIndicesOf(physicalPieces[otherIndex]!));
    }
    return { releaseDirection: direction, plane: null, volumetric: { ownTriangleIndices, otherTriangleIndices } };
  });

  return { pieces, interfaces };
}

/**
 * Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
 * turns a `buildRegionDirectAssignment` result into inputs for
 * `constructWorkingMold`'s multi-label partition mode -- see
 * `multiLabelPartition.ts`'s own doc comment for the full mechanism.
 * Structurally identical to `buildVolumetricConstructionPieces` above
 * (same physical-piece splitting, same "no catch-all" property), except
 * each piece only needs its OWN triangles: the reconstruction is a single
 * joint computation across every piece, not an independent per-piece
 * comparison against a merged "everyone else".
 */
export function buildMultiLabelConstructionPieces(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  direct: RegionDirectAssignmentResult,
): { readonly pieces: readonly PlannedPieceRegion[]; readonly interfaces: WorkingMoldDecompositionFinalist["interfaces"] } | null {
  if (direct.unassignedPatchCount > 0) return null;
  const physicalPieces = buildPhysicalPieces(planningMesh, direct);
  if (physicalPieces === null) return null;

  const releaseDirections = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.vector);
  const directionIds = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.directionId);
  const interfaces = extractPartingInterfaces(
    planningMesh,
    direct.assignment,
    releaseDirections.map((releaseDirection, index) => ({ releaseDirection, directionId: directionIds[index]!, prism: null })),
  );

  const pieces: PlannedPieceRegion[] = physicalPieces.map((physical) => {
    const direction = releaseDirections[physical.directionIndex]!;
    const ownTriangleIndices = physical.patches.map((patchIndex) => planningMesh.patches[patchIndex]!.sourceTriangle);
    return { releaseDirection: direction, plane: null, multiLabel: { ownTriangleIndices } };
  });

  return { pieces, interfaces };
}

/**
 * Execution 08 LOOP 14 (real-regression root cause fix, construction side):
 * turns a `buildRegionDirectAssignment` result into REAL construction
 * inputs -- one `PlannedPieceRegion` per PHYSICAL piece, sequenced so each
 * one's cutting tool only needs to separate it from what remains (later
 * pieces), plus the SAME `WorkingMoldPartingInterface[]` shape the ordinary
 * prism search already produces (so downstream reporting -- plan.score,
 * plan.partingInterfaces -- doesn't need a second code path).
 *
 * "Physical piece" is deliberately NOT the same thing as "direction":
 * `greedyRegionCover` only proves VISIBILITY from a shared direction, which
 * does not require adjacency, so a single direction's own assigned patches
 * are not guaranteed to be one connected surface region. Measured directly
 * against the real free-form regression fixture: 3 of 5 directions' own
 * assignments were themselves split across 2-4 mesh-disconnected
 * components. No boundary construction -- flat, curved, or a full 2D
 * height field, all tried here -- can force genuinely disjoint surface
 * territory into one connected solid; every attempt at forcing it produced
 * a fragmented, multi-component "piece", which is not a valid mold piece
 * regardless of how clean its own topology checks out. Part of the real
 * fix is upstream of geometry entirely: split each direction's assigned
 * patches into their own connected components FIRST
 * (`splitIntoConnectedComponents` above), and give each component its own
 * real physical piece, still released along its parent direction (so this
 * never adds a new release direction to search or verify). The other part
 * of the fix IS in `constructWorkingMold`: its simultaneous-partition
 * construction mode (own doc comment there) removed a further, separate
 * fragmentation source this component-splitting alone did not close.
 *
 * Each non-last physical piece's cutting tool is driven DIRECTLY by its own
 * real per-patch assignment (`localBoundedAssignmentSolid`, wired in
 * `constructWorkingMold`'s simultaneous-partition mode) -- `ownPoints` are
 * this piece's own component's patch centroids, `otherPoints` are EVERY
 * OTHER physical piece's patch centroids, including the catch-all's own
 * (symmetric: there is no carving order in that mode, so "later" is not a
 * meaningful distinction any more -- see `constructWorkingMold`'s own doc
 * comment for why). `plane`'s own flat offset (the minimum projection of
 * just this component's own patches) is kept as the local claim's own
 * "how deep does my own material reach" bound, and for registration-pin
 * placement / candidate release directions, which both already tolerate an
 * approximate value (verified downstream by real boolean checks, never
 * trusted blindly). The last physical piece overall is the catch-all:
 * whatever remains after every other piece's own local claim.
 *
 * History: an earlier version of this function used one `PlannedPieceRegion`
 * per DIRECTION (not per component), first with a single global flat offset
 * plus local curve corrections (reached real construction for the first
 * time, but a single outlier patch could drag the global offset into
 * stealing large amounts of other pieces' material), then with a per-
 * direction grid tool with a LOCAL (non-global) offset decision (fixed the
 * over-capture but left pieces fragmenting into many disconnected
 * components -- root-caused as a mismatch between "one physical piece per
 * direction" and the true assignment's own disconnected structure), then
 * with `otherPoints` scoped to only LATER physical pieces in a sequential
 * remainder-carving order (fixed most of that fragmentation but left the
 * physical piece count climbing -- 5, then 11, then 23 -- as sequential
 * carving order itself kept rippling fragmentation from one piece into the
 * next). `otherPoints` is symmetric now (every other piece, not just later
 * ones) because `constructWorkingMold`'s simultaneous-partition mode
 * removes that ordering dependency at the source -- own doc comment on
 * `localBoundedAssignmentSolid` and in `constructWorkingMold` for the full
 * mechanism, and on the fact that even this genuine paradigm change did
 * NOT converge for the hardest known fixture (piece count still climbed,
 * to 25).
 */
export function buildDirectAssignmentConstructionPieces(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  direct: RegionDirectAssignmentResult,
): { readonly pieces: readonly PlannedPieceRegion[]; readonly interfaces: WorkingMoldDecompositionFinalist["interfaces"] } | null {
  if (direct.unassignedPatchCount > 0) return null;
  const physicalPieces = buildPhysicalPieces(planningMesh, direct);
  if (physicalPieces === null) return null;

  const releaseDirections = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.vector);
  const directionIds = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.directionId);
  const interfaces = extractPartingInterfaces(
    planningMesh,
    direct.assignment,
    releaseDirections.map((releaseDirection, index) => ({ releaseDirection, directionId: directionIds[index]!, prism: null })),
  );

  const pieces: PlannedPieceRegion[] = [];
  for (let pieceIndex = 0; pieceIndex < physicalPieces.length - 1; pieceIndex += 1) {
    const physical: PhysicalPiece = physicalPieces[pieceIndex]!;
    const direction = releaseDirections[physical.directionIndex]!;
    let minProjection = Infinity;
    let ownPatchRadiusMm = 0;
    const ownPoints: PlanningVector3[] = physical.patches.map((patchIndex: number) => {
      const patch = planningMesh.patches[patchIndex]!;
      const projection = dot(patch.centroid, direction);
      if (projection < minProjection) minProjection = projection;
      const equivalentRadius = Math.sqrt(patch.areaMm2 / Math.PI);
      if (equivalentRadius > ownPatchRadiusMm) ownPatchRadiusMm = equivalentRadius;
      return patch.centroid;
    });
    if (!Number.isFinite(minProjection)) return null;
    const offsetMm = minProjection - 1e-4;
    // Symmetric: every OTHER physical piece, including the catch-all's own
    // (the last entry in `physicalPieces`) -- the simultaneous-partition
    // construction mode has no carving order, so there is no "not yet
    // carved" distinction to scope this to.
    const otherPoints: PlanningVector3[] = [];
    for (let otherIndex = 0; otherIndex < physicalPieces.length; otherIndex += 1) {
      if (otherIndex === pieceIndex) continue;
      for (const patchIndex of physicalPieces[otherIndex]!.patches) {
        otherPoints.push(planningMesh.patches[patchIndex]!.centroid);
      }
    }
    pieces.push({
      releaseDirection: direction,
      plane: { direction, offsetMm },
      grid: { ownPoints, otherPoints, ownPatchRadiusMm },
    });
  }
  const lastDirectionIndex = physicalPieces[physicalPieces.length - 1]!.directionIndex;
  pieces.push({ releaseDirection: releaseDirections[lastDirectionIndex]!, plane: null });

  return { pieces, interfaces };
}
