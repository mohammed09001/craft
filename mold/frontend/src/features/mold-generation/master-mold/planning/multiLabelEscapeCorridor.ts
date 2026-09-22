/**
 * Execution 08/09 (assignment-stage investigation): built while
 * investigating why Execution 09's compound-path search found zero
 * release slack for the real fixture's one remaining multi-label piece.
 * A cheap raw-cavity voxel-BFS (no boolean CSG, `classifyPointInside`
 * raycasts only) proved directly that raw cavity space near that piece's
 * own patch reaches the envelope boundary via a short (197-voxel), real,
 * existing path -- ruling out a genuine part-level undercut. The
 * hypothesis this function was built to test: that the multi-label
 * reconstruction's OWN territory arbitration seals a piece away from that
 * real path (nearest-surface arbitration naturally shrinking a small
 * piece's territory once a larger neighbor's surface becomes nearer,
 * with no accounting for whether the result keeps a path out).
 *
 * That specific hypothesis turned out to be WRONG for the real fixture's
 * own island, once actually measured (`multiLabelPartition.ts`'s own doc
 * comment on `corridorsCarved` has the full finding): that piece's
 * territory already included boundary-touching voxels before this
 * function ever ran, and it is a moderately compact blob (not a thin
 * sealed-off sliver) -- so `corridorsCarved` is 0 for it, correctly, and
 * carving a corridor was never the fix that piece needed. Its real
 * problem is shape non-convexity: a bent/non-monotonic territory that no
 * translation-only search can navigate, a genuinely different failure
 * mode than topological sealing.
 *
 * This function is real, bounded, well-motivated, and kept regardless:
 * it correctly identifies and fixes GENUINE topological sealing when it
 * occurs (proven directly on synthetic grids in this file's own test),
 * and is a strict no-op for a piece that is not sealed, like the real
 * fixture's own island -- it can only ever help, never hurt.
 *
 * Mechanism: after ICM converges, for every piece whose own voxels do
 * not already reach the grid boundary, BFS through RAW CAVITY SPACE
 * (ignoring current labels) from every one of that piece's own voxels
 * simultaneously, tracking parents for a real shortest path, until either
 * the boundary is reached or cavity space is exhausted. If a path is
 * found, every voxel on it (previously belonging to some OTHER piece) is
 * reassigned to the orphaned piece -- carving a minimal escape corridor
 * through space that was always physically free, just previously
 * arbitrated away.
 *
 * Known limitation: pieces are processed in label order, and a later
 * piece's own corridor BFS can pass through (and re-claim) an earlier
 * piece's already-carved corridor voxels if their shortest paths cross,
 * potentially re-sealing the earlier piece. Not resolved here -- a real
 * simultaneous multi-source routing would be needed to rule this out
 * entirely -- but downstream release verification (the unconditional
 * final authority throughout this project) still catches it if it
 * happens, rather than silently accepting a broken result.
 */
export interface EscapeCorridorResult {
  readonly labels: Int32Array;
  /** How many pieces needed a corridor carved (0 means every piece already reached the boundary, or none had any path even through raw cavity). */
  readonly corridorsCarved: number;
  readonly totalCorridorVoxels: number;
  /** Pieces that reached neither the boundary through their own territory NOR through raw cavity space at all -- genuinely locked even before any partition, per the same reasoning the voxel-BFS itself used. */
  readonly genuinelyUnreachablePieceLabels: readonly number[];
}

function voxelIndex(dims: readonly [number, number, number], x: number, y: number, z: number): number {
  return (z * dims[1] + y) * dims[0] + x;
}

function isOnGridBoundary(dims: readonly [number, number, number], x: number, y: number, z: number): boolean {
  return x === 0 || y === 0 || z === 0 || x === dims[0] - 1 || y === dims[1] - 1 || z === dims[2] - 1;
}

export function carveEscapeCorridors(
  labels: Int32Array,
  dims: readonly [number, number, number],
  isCavity: Uint8Array,
  labelCount: number,
): EscapeCorridorResult {
  const [sizeX, sizeY, sizeZ] = dims;
  const voxelCount = sizeX * sizeY * sizeZ;
  const updatedLabels = Int32Array.from(labels);
  let corridorsCarved = 0;
  let totalCorridorVoxels = 0;
  const genuinelyUnreachablePieceLabels: number[] = [];

  for (let label = 0; label < labelCount; label += 1) {
    let alreadyTouchesBoundary = false;
    const ownVoxels: number[] = [];
    for (let v = 0; v < voxelCount; v += 1) {
      if (updatedLabels[v] !== label) continue;
      ownVoxels.push(v);
      const z = Math.floor(v / (sizeX * sizeY));
      const y = Math.floor((v % (sizeX * sizeY)) / sizeX);
      const x = v % sizeX;
      if (isOnGridBoundary(dims, x, y, z)) {
        alreadyTouchesBoundary = true;
        break;
      }
    }
    if (alreadyTouchesBoundary || ownVoxels.length === 0) continue;

    const visited = new Uint8Array(voxelCount);
    const parent = new Int32Array(voxelCount).fill(-1);
    const queue: number[] = [...ownVoxels];
    for (const v of ownVoxels) visited[v] = 1;

    let boundaryHit = -1;
    let head = 0;
    while (head < queue.length) {
      const v = queue[head]!;
      head += 1;
      const z = Math.floor(v / (sizeX * sizeY));
      const y = Math.floor((v % (sizeX * sizeY)) / sizeX);
      const x = v % sizeX;
      if (updatedLabels[v] !== label && isOnGridBoundary(dims, x, y, z)) {
        boundaryHit = v;
        break;
      }
      const neighbors: (readonly [number, number, number])[] = [
        [x - 1, y, z], [x + 1, y, z], [x, y - 1, z], [x, y + 1, z], [x, y, z - 1], [x, y, z + 1],
      ];
      for (const [nx, ny, nz] of neighbors) {
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) continue;
        const nv = voxelIndex(dims, nx, ny, nz);
        if (visited[nv] === 0 && isCavity[nv] === 1) {
          visited[nv] = 1;
          parent[nv] = v;
          queue.push(nv);
        }
      }
    }

    if (boundaryHit === -1) {
      genuinelyUnreachablePieceLabels.push(label);
      continue;
    }

    let cursor = boundaryHit;
    let carvedThisPiece = 0;
    while (cursor !== -1 && updatedLabels[cursor] !== label) {
      updatedLabels[cursor] = label;
      carvedThisPiece += 1;
      cursor = parent[cursor]!;
    }
    if (carvedThisPiece > 0) {
      corridorsCarved += 1;
      totalCorridorVoxels += carvedThisPiece;
    }
  }

  return { labels: updatedLabels, corridorsCarved, totalCorridorVoxels, genuinelyUnreachablePieceLabels };
}
