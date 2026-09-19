import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import { masterMoldPieceKey, type MasterToolingSetState } from "./masterMold.contracts";

/**
 * Execution 05 Article 14: a Master Mold tooling piece the viewport may
 * draw, tagged with whether its set is the live current result or a ghosted
 * holdover from before the source went stale. Blocked sets contribute no
 * geometry at all -- a failed or sacrificial-recommended part has no
 * printable tooling to show.
 */
export interface MasterMoldRenderableBody extends MoldBodyData {
  /** True when this piece's source has changed since it was generated -- the runtime must render it as a visually distinct, non-manufacturable holdover, never as an ordinary current result (Article 02). */
  readonly stale: boolean;
  /**
   * A stable identity for the actual generated mesh content -- the owning
   * set's fingerprint plus the piece id, which changes exactly when the
   * set's inputs or plan change. Shape-derived stats like bounds or triangle
   * counts can coincide across two genuinely different meshes; this cannot,
   * so the render runtime keys its rebuild decision on this.
   */
  readonly geometryIdentity: string;
}

/**
 * Both `current` and `stale` sets are returned so the runtime can render the
 * stale ones as a clearly ghosted holdover instead of erasing them --
 * dropping a set from the viewport entirely is exactly the "Master Mold
 * disappears when it becomes stale" regression.
 *
 * Execution 06 Article 15: piece visibility comes from the store's
 * presentation state (default visible); the runtime syncs visibility without
 * rebuilding geometry.
 */
export function selectRenderableMasterMoldBodies(
  sets: readonly MasterToolingSetState[],
  pieceVisibility: Readonly<Record<string, boolean>> = {},
): readonly MasterMoldRenderableBody[] {
  return sets
    .filter((entry) => (entry.status === "current" || entry.status === "stale") && entry.set !== null)
    .flatMap((entry) => {
      const set = entry.set!;
      return set.assembly.pieces.map((piece) => ({
        // Engine piece ids are set-local; the rendered-body id (and every
        // visibility lookup) keys the composite (set, piece) identity so two
        // sets' "piece-panel-1" never collide (Execution 07 LOOP 10).
        id: masterMoldPieceKey(entry.moldPartId, piece.pieceId),
        name: piece.name,
        visible: pieceVisibility[masterMoldPieceKey(entry.moldPartId, piece.pieceId)] !== false,
        bounds: piece.bounds,
        triangleCount: piece.triangleCount,
        volumeMm3: piece.volumeMm3,
        watertight: true as const,
        mesh: piece.mesh,
        stale: entry.status === "stale",
        geometryIdentity: `${set.fingerprint}:${piece.pieceId}`,
      }));
    });
}
