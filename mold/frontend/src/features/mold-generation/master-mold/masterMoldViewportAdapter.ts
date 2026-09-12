import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import type { MasterMoldBodyResult } from "./masterMold.contracts";

/**
 * Article 10: only a "current" Master Mold body is safe to show as a
 * finished result -- a blocked body's `mesh`/`bounds` are null by
 * construction (Article 05), so stale or failed pieces can never masquerade
 * as current geometry in the viewport.
 */
export function selectRenderableMasterMoldBodies(
  bodies: readonly MasterMoldBodyResult[],
): readonly MoldBodyData[] {
  return bodies
    .filter((body) => body.status === "current" && body.mesh !== null && body.bounds !== null)
    .map((body) => ({
      id: body.source.finalMoldPartId,
      name: body.source.finalMoldPartName,
      visible: true,
      bounds: body.bounds!,
      triangleCount: body.triangleCount ?? 0,
      volumeMm3: body.volumeMm3 ?? 0,
      watertight: true as const,
      mesh: body.mesh!,
    }));
}
