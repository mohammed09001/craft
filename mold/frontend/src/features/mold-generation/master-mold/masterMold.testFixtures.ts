import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";

function addQuad(
  positions: number[],
  indices: number[],
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
): void {
  const base = positions.length / 3;
  positions.push(...p0, ...p1, ...p2, ...p3);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * A two-tier "pedestal": a wide 10x10 base (z in [0,2]) fused under a narrow
 * 4x4 top (z in [2,5]), both centered on the Z axis. Physically extractable
 * ONLY downward through the wide base (-Z) -- every other direction is
 * blocked by the shoulder the base forms around the narrower top.
 */
export function buildPedestalMesh(): { readonly mesh: MoldMeshPayload; readonly bounds: Bounds3 } {
  const positions: number[] = [];
  const indices: number[] = [];

  addQuad(positions, indices, [-5, -5, 0], [-5, 5, 0], [5, 5, 0], [5, -5, 0]); // base bottom, -Z
  addQuad(positions, indices, [-5, -5, 0], [-5, -5, 2], [-5, 5, 2], [-5, 5, 0]); // base -X wall
  addQuad(positions, indices, [5, -5, 0], [5, 5, 0], [5, 5, 2], [5, -5, 2]); // base +X wall
  addQuad(positions, indices, [-5, -5, 0], [5, -5, 0], [5, -5, 2], [-5, -5, 2]); // base -Y wall
  addQuad(positions, indices, [-5, 5, 0], [-5, 5, 2], [5, 5, 2], [5, 5, 0]); // base +Y wall

  // Shoulder at z=2: the 10x10 top face of the base minus the 4x4 footprint of the tower, as 4 non-overlapping strips.
  addQuad(positions, indices, [-5, 2, 2], [5, 2, 2], [5, 5, 2], [-5, 5, 2]); // north
  addQuad(positions, indices, [-5, -5, 2], [5, -5, 2], [5, -2, 2], [-5, -2, 2]); // south
  addQuad(positions, indices, [2, -2, 2], [5, -2, 2], [5, 2, 2], [2, 2, 2]); // east
  addQuad(positions, indices, [-5, -2, 2], [-2, -2, 2], [-2, 2, 2], [-5, 2, 2]); // west

  addQuad(positions, indices, [-2, -2, 2], [-2, -2, 5], [-2, 2, 5], [-2, 2, 2]); // tower -X wall
  addQuad(positions, indices, [2, -2, 2], [2, 2, 2], [2, 2, 5], [2, -2, 5]); // tower +X wall
  addQuad(positions, indices, [-2, -2, 2], [2, -2, 2], [2, -2, 5], [-2, -2, 5]); // tower -Y wall
  addQuad(positions, indices, [-2, 2, 2], [-2, 2, 5], [2, 2, 5], [2, 2, 2]); // tower +Y wall

  addQuad(positions, indices, [-2, -2, 5], [2, -2, 5], [2, 2, 5], [-2, 2, 5]); // tower top, +Z

  return { mesh: { positions, indices }, bounds: { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 5 } } };
}
