import type { AccessibilityAnalysis, PlanningMesh } from "./masterMoldPlanning.contracts";
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
  const directionCount = direct.pieceDirectionIndexes.length;
  if (directionCount < 2) return null;

  const releaseDirections = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.vector);
  const directionIds = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.directionId);
  const interfaces = extractPartingInterfaces(
    planningMesh,
    direct.assignment,
    releaseDirections.map((releaseDirection, index) => ({ releaseDirection, directionId: directionIds[index]!, prism: null })),
  );

  const patchesByDirection = new Map<number, number[]>();
  for (let patchIndex = 0; patchIndex < direct.assignment.length; patchIndex += 1) {
    const directionIndex = direct.assignment[patchIndex]!;
    const list = patchesByDirection.get(directionIndex) ?? [];
    list.push(patchIndex);
    patchesByDirection.set(directionIndex, list);
  }

  interface PhysicalPiece {
    readonly directionIndex: number;
    readonly patches: readonly number[];
  }
  const physicalPieces: PhysicalPiece[] = [];
  for (let directionIndex = 0; directionIndex < directionCount; directionIndex += 1) {
    const patches = patchesByDirection.get(directionIndex) ?? [];
    if (patches.length === 0) return null; // an empty direction: this assignment is unusable.
    for (const component of splitIntoConnectedComponents(patches, planningMesh.adjacency)) {
      physicalPieces.push({ directionIndex, patches: component });
    }
  }
  if (physicalPieces.length < 2) return null;

  const pieces: PlannedPieceRegion[] = [];
  for (let pieceIndex = 0; pieceIndex < physicalPieces.length - 1; pieceIndex += 1) {
    const physical = physicalPieces[pieceIndex]!;
    const direction = releaseDirections[physical.directionIndex]!;
    let minProjection = Infinity;
    let ownPatchRadiusMm = 0;
    const ownPoints = physical.patches.map((patchIndex) => {
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
    const otherPoints: typeof ownPoints = [];
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
