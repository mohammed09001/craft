import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

import type { Bounds3 } from "../../split-face/splitFace.contracts";
import { assertManifoldStatus, getManifoldModule, type ManifoldSolid } from "../../geometry/manifold";
import { argminLabels, relaxLabeling } from "./multiLabelReconstruction";

/**
 * Execution 08 LOOP 02/14/28: wires `multiLabelReconstruction.ts`'s
 * geometry-independent ICM/Potts-model relaxation into real mesh geometry
 * -- the mesh-specific half of "true multi-label surface reconstruction",
 * the path this project's own doc comments (`volumetricPartition.ts`)
 * conclude is needed after five separate construction paradigms and five
 * separate distance-metric tie-break variants all failed to converge on
 * the real free-form regression fixture.
 *
 * Unlike `volumetricAssignmentSolid` (one piece built independently per
 * call, compared only against a merged "everyone else"), this solves ALL
 * pieces JOINTLY: one voxel grid over the shared envelope, one per-voxel
 * data cost per piece (Euclidean distance to that piece's own triangle
 * surface, via the same exact `MeshBVH.closestPointToPoint` primitive
 * already proven correct in `volumetricPartition.ts`), then one ICM pass
 * that can see and penalize every voxel's disagreement with its own
 * neighbors -- something no independent per-piece decision, however its
 * tie-break is tuned, can ever do.
 *
 * Measured against the real free-form regression fixture: this is the
 * first technique in this project's entire investigation to reach full
 * release verification for the large majority of a hard fixture's own
 * pieces (9 of 10, `regionDirectConstruction.multiLabel.test.ts` has the
 * full measurement) -- every prior technique produced 25-101+ physical
 * pieces end to end.
 *
 * A real, understood LIMITATION, found while proving this even for
 * trivial geometry (same test file, its own "asymmetric split" case):
 * unlike a direction-driven half-space/CSG construction, NOTHING in this
 * technique's own objective is biased toward producing a shape that is
 * monotonic along any particular release axis -- it optimizes purely for
 * "nearest real surface, smoothed against neighbor disagreement," with no
 * notion of "release direction" anywhere in it. A piece assigned a small
 * fraction of the total surface (relative to its neighbors) gets a thin,
 * face-hugging territory that is the geometrically CORRECT nearest-
 * surface answer, but is not guaranteed releasable along the direction
 * that region-cover happened to assign it -- confirmed directly: a simple
 * box split as 1 face (2 triangles) vs the other 5 faces (10 triangles)
 * fails release, even though it is about as simple as real geometry gets.
 * This is a genuine trade-off against the fragmentation-elimination
 * strength above, not a bug to fix, and it is why `masterMoldEngine.ts`
 * wires this in as a further LAST-RESORT fallback (tried only after the
 * ordinary search and the CSG fallback have both already failed), not a
 * blanket replacement for either.
 */
export interface MultiLabelPartitionInput {
  readonly pieceTriangleIndices: readonly (readonly number[])[];
  readonly sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array };
  readonly bounds: Bounds3;
  readonly voxelSizeMm: number;
  /** Cost of one 6-connected neighbor voxel disagreeing, in the same units as Euclidean distance (mm). */
  readonly smoothnessWeight: number;
  readonly maxIterations: number;
}

export interface MultiLabelPartitionResult {
  readonly solids: readonly ManifoldSolid[];
  readonly dims: readonly [number, number, number];
  readonly iterationsRun: number;
  readonly converged: boolean;
}

function buildPieceBvh(
  sourceMesh: { readonly positions: readonly number[] | Float32Array; readonly indices: readonly number[] | Uint32Array },
  triangleIndices: readonly number[],
): MeshBVH {
  const positions = sourceMesh.positions instanceof Float32Array ? sourceMesh.positions : new Float32Array(sourceMesh.positions);
  const subsetIndices = new Uint32Array(triangleIndices.length * 3);
  for (let i = 0; i < triangleIndices.length; i += 1) {
    const base = triangleIndices[i]! * 3;
    subsetIndices[i * 3] = sourceMesh.indices[base]!;
    subsetIndices[i * 3 + 1] = sourceMesh.indices[base + 1]!;
    subsetIndices[i * 3 + 2] = sourceMesh.indices[base + 2]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(subsetIndices, 1));
  return new MeshBVH(geometry);
}

export function buildMultiLabelPartitionSolids(
  module: Awaited<ReturnType<typeof getManifoldModule>>,
  input: MultiLabelPartitionInput,
): MultiLabelPartitionResult {
  const { pieceTriangleIndices, sourceMesh, bounds, voxelSizeMm, smoothnessWeight, maxIterations } = input;
  const labelCount = pieceTriangleIndices.length;
  if (labelCount < 2) throw new Error("multi-label partition needs at least two pieces.");
  const bvhs = pieceTriangleIndices.map((indices) => {
    if (indices.length === 0) throw new Error("multi-label partition piece has no triangles.");
    return buildPieceBvh(sourceMesh, indices);
  });

  const sizeX = Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) / voxelSizeMm));
  const sizeY = Math.max(1, Math.ceil((bounds.max.y - bounds.min.y) / voxelSizeMm));
  const sizeZ = Math.max(1, Math.ceil((bounds.max.z - bounds.min.z) / voxelSizeMm));
  const dims: readonly [number, number, number] = [sizeX, sizeY, sizeZ];
  const voxelCount = sizeX * sizeY * sizeZ;

  const dataCost = new Float64Array(voxelCount * labelCount);
  const probe = new Vector3();
  for (let z = 0; z < sizeZ; z += 1) {
    const wz = bounds.min.z + (z + 0.5) * voxelSizeMm;
    for (let y = 0; y < sizeY; y += 1) {
      const wy = bounds.min.y + (y + 0.5) * voxelSizeMm;
      for (let x = 0; x < sizeX; x += 1) {
        const wx = bounds.min.x + (x + 0.5) * voxelSizeMm;
        probe.set(wx, wy, wz);
        const v = (z * sizeY + y) * sizeX + x;
        for (let label = 0; label < labelCount; label += 1) {
          const hit = bvhs[label]!.closestPointToPoint(probe);
          dataCost[v * labelCount + label] = hit === null ? Infinity : hit.distance;
        }
      }
    }
  }

  const initialLabels = argminLabels(dataCost, voxelCount, labelCount);
  const { labels, iterationsRun, converged } = relaxLabeling({
    dims,
    labelCount,
    dataCost,
    initialLabels,
    smoothnessWeight,
    maxIterations,
  });

  const box = {
    min: [bounds.min.x, bounds.min.y, bounds.min.z] as [number, number, number],
    max: [bounds.max.x, bounds.max.y, bounds.max.z] as [number, number, number],
  };
  const solids: ManifoldSolid[] = [];
  for (let label = 0; label < labelCount; label += 1) {
    const sdf = (point: [number, number, number]): number => {
      const ix = Math.min(sizeX - 1, Math.max(0, Math.floor((point[0] - bounds.min.x) / voxelSizeMm)));
      const iy = Math.min(sizeY - 1, Math.max(0, Math.floor((point[1] - bounds.min.y) / voxelSizeMm)));
      const iz = Math.min(sizeZ - 1, Math.max(0, Math.floor((point[2] - bounds.min.z) / voxelSizeMm)));
      const v = (iz * sizeY + iy) * sizeX + ix;
      return labels[v] === label ? 1 : -1;
    };
    const solid = module.Manifold.levelSet(sdf, box, voxelSizeMm, 0);
    assertManifoldStatus(solid, `Multi-label partition piece ${label}`);
    solids.push(solid);
  }

  return { solids, dims, iterationsRun, converged };
}
