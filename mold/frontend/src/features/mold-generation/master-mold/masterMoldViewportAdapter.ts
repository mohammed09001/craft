import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import type { MasterMoldBodyResult } from "./masterMold.contracts";

/**
 * Article 02: a Master Mold body the viewport may draw, tagged with whether
 * it is the live current result or a ghosted holdover from before the source
 * went stale. Never a `blocked` body -- its `mesh`/`bounds` are null by
 * construction (Article 05), so a failed piece has no geometry to show at all.
 */
export interface MasterMoldRenderableBody extends MoldBodyData {
  /** True when this body's source has changed since it was generated -- the runtime must render it as a visually distinct, non-manufacturable holdover, never as an ordinary current result (Article 02). */
  readonly stale: boolean;
}

/**
 * Article 02: a stale result still has valid, previously-generated
 * `mesh`/`bounds` (Article 01's `reviveIfStale`/`markMasterMoldStale` never
 * null them out) -- dropping it from the viewport entirely is exactly the
 * "Master Mold disappears when it becomes stale" regression this repairs.
 * Both `current` and `stale` bodies are returned so the runtime can render
 * the stale ones as a clearly ghosted holdover instead of erasing them.
 */
export function selectRenderableMasterMoldBodies(
  bodies: readonly MasterMoldBodyResult[],
): readonly MasterMoldRenderableBody[] {
  return bodies
    .filter((body) => (body.status === "current" || body.status === "stale") && body.mesh !== null && body.bounds !== null)
    .map((body) => ({
      id: body.source.finalMoldPartId,
      name: body.source.finalMoldPartName,
      visible: true,
      bounds: body.bounds!,
      triangleCount: body.triangleCount ?? 0,
      volumeMm3: body.volumeMm3 ?? 0,
      watertight: true as const,
      mesh: body.mesh!,
      stale: body.status === "stale",
    }));
}
