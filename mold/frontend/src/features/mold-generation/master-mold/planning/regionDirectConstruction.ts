import type { AccessibilityAnalysis, PlanningMesh } from "./masterMoldPlanning.contracts";
import { dot } from "./candidateDirections";
import { extractPartingInterfaces, type WorkingMoldDecompositionFinalist } from "./workingMoldPlanner";
import type { PlannedPieceRegion } from "./workingMoldConstructor";
import type { RegionDirectAssignmentResult } from "./regionDirectAssignment";

/**
 * Execution 08 LOOP 14 (real-regression root cause fix, construction side):
 * turns a `buildRegionDirectAssignment` result into REAL construction
 * inputs -- one `PlannedPieceRegion` per piece, sequenced so each piece's
 * cutting tool only needs to separate it from what remains (later-indexed
 * pieces), plus the SAME `WorkingMoldPartingInterface[]` shape the ordinary
 * prism search already produces (so downstream reporting -- plan.score,
 * plan.partingInterfaces -- doesn't need a second code path).
 *
 * There is no half-space search here (that is exactly the gap this
 * sidesteps): each non-last piece gets a "best-fit" flat offset computed
 * directly from ITS OWN already-assigned patches (the minimum projection
 * along its own direction, matching `exactPartingThreshold`'s own
 * provenly-safe convention, but derived from the real assignment instead
 * of driving it), corrected locally by its own real parting curve(s)
 * against later-indexed neighbors (heightFieldPartingSolid /
 * multiNeighborHeightFieldSolid, wired in `constructWorkingMold`). The
 * last piece (by construction order) is the catch-all: whatever remains.
 *
 * Verified directly against the real free-form regression fixture
 * (buildFreeFormObliqueLockFixture): this reaches real exact-CSG
 * construction (previously 0 attempts, `budget-exhausted` at every piece
 * count) and gets all the way through partition and carving -- the
 * assignment-level fix that motivated this file is real. Full release
 * verification for that specific, deliberately hard fixture did NOT
 * succeed in that same trial, and -- checked directly -- an all-flat-plane
 * variant of the SAME assignment failed at the exact same point, so the
 * remaining gap there is not curve-fitting precision; it is something
 * deeper about this sequential single-direction-per-piece removal order
 * not sufficing for that fixture's own real complexity, even with a
 * provably correct patch assignment. Not yet root-caused further.
 */
export function buildDirectAssignmentConstructionPieces(
  planningMesh: PlanningMesh,
  analysis: AccessibilityAnalysis,
  direct: RegionDirectAssignmentResult,
): { readonly pieces: readonly PlannedPieceRegion[]; readonly interfaces: WorkingMoldDecompositionFinalist["interfaces"] } | null {
  if (direct.unassignedPatchCount > 0) return null;
  const pieceCount = direct.pieceDirectionIndexes.length;
  if (pieceCount < 2) return null;

  const releaseDirections = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.vector);
  const directionIds = direct.pieceDirectionIndexes.map((directionIndex) => analysis.directions[directionIndex]!.directionId);
  const interfaces = extractPartingInterfaces(
    planningMesh,
    direct.assignment,
    releaseDirections.map((releaseDirection, index) => ({ releaseDirection, directionId: directionIds[index]!, prism: null })),
  );

  const interfacesByPiece = new Map<number, typeof interfaces[number][]>();
  for (const face of interfaces) {
    for (const pieceIndex of [face.pieceAIndex, face.pieceBIndex]) {
      const list = interfacesByPiece.get(pieceIndex) ?? [];
      list.push(face);
      interfacesByPiece.set(pieceIndex, list);
    }
  }

  const patchesByPiece = new Map<number, number[]>();
  for (let patchIndex = 0; patchIndex < direct.assignment.length; patchIndex += 1) {
    const pieceIndex = direct.assignment[patchIndex]!;
    const list = patchesByPiece.get(pieceIndex) ?? [];
    list.push(patchIndex);
    patchesByPiece.set(pieceIndex, list);
  }

  const pieces: PlannedPieceRegion[] = [];
  for (let pieceIndex = 0; pieceIndex < pieceCount - 1; pieceIndex += 1) {
    const direction = releaseDirections[pieceIndex]!;
    const assignedPatches = patchesByPiece.get(pieceIndex) ?? [];
    let minProjection = Infinity;
    for (const patchIndex of assignedPatches) {
      const projection = dot(planningMesh.patches[patchIndex]!.centroid, direction);
      if (projection < minProjection) minProjection = projection;
    }
    if (!Number.isFinite(minProjection)) return null; // an empty piece: this assignment is unusable.
    const offsetMm = minProjection - 1e-4;
    // Only curves against LATER-indexed (not-yet-carved) neighbors matter:
    // earlier neighbors' material is already gone from the remainder by
    // the time this piece is carved (the same "ordered, nested" convention
    // the half-space prism sequence already relies on).
    const laterCurves = (interfacesByPiece.get(pieceIndex) ?? [])
      .filter((face) => (face.pieceAIndex === pieceIndex ? face.pieceBIndex : face.pieceAIndex) > pieceIndex)
      .map((face) => face.samplePoints);
    pieces.push({
      releaseDirection: direction,
      plane: { direction, offsetMm },
      curve: laterCurves.length > 0 ? laterCurves : null,
    });
  }
  pieces.push({ releaseDirection: releaseDirections[pieceCount - 1]!, plane: null });

  return { pieces, interfaces };
}
