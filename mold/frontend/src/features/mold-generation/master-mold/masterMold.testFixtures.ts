import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import { boundsFromManifold, createBlankSolid, getManifoldModule, payloadFromManifold } from "../cavity-generation/manifold.engine";

/**
 * A two-tier "pedestal": a wide 10x10 base (z in [0,2]) fused under a narrow
 * 4x4 top (z in [2,5]), both centered on the Z axis. Physically extractable
 * ONLY downward through the wide base (-Z) -- every other direction is
 * blocked by the shoulder the base forms around the narrower top.
 *
 * Built as a real Manifold union (not a hand-authored triangle soup) so it
 * is guaranteed watertight/manifold going into the Boolean/precise-demold
 * pipeline -- a hand-wound quad mesh can look correct triangle-by-triangle
 * while still failing Manifold's own stricter topological validation.
 */
export async function buildPedestalMesh(): Promise<{ readonly mesh: MoldMeshPayload; readonly bounds: Bounds3 }> {
  const module = await getManifoldModule();
  const base = createBlankSolid(module, { min: { x: -5, y: -5, z: 0 }, max: { x: 5, y: 5, z: 2 } });
  const tower = createBlankSolid(module, { min: { x: -2, y: -2, z: 2 }, max: { x: 2, y: 2, z: 5 } });
  const pedestal = base.add(tower);

  const mesh = payloadFromManifold(pedestal);
  const bounds = boundsFromManifold(pedestal);

  base.delete();
  tower.delete();
  pedestal.delete();

  return { mesh, bounds };
}
