import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";

/**
 * Execution 05 Article 04: neutral mesh topology inspection. Counts
 * boundary (used-once) and non-manifold (used-more-than-twice) edge uses of
 * an indexed triangle mesh -- generic validation math with no product
 * semantics.
 */
export function meshTopology(mesh: MoldMeshPayload): { openEdgeCount: number; nonManifoldEdgeCount: number } {
  const uses = new Map<string, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return {
    openEdgeCount: [...uses.values()].filter(n => n === 1).length,
    nonManifoldEdgeCount: [...uses.values()].filter(n => n > 2).length,
  };
}
