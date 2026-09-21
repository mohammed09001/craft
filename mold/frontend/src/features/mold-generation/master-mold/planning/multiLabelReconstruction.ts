/**
 * Execution 08 LOOP 02/14/28 (true multi-label surface reconstruction):
 * every prior attempt on the real free-form regression fixture -- five
 * separate CSG/volumetric construction paradigms, then five separate
 * distance-metric tie-break variants on top of the best of those (see
 * `volumetricPartition.ts`'s own doc comment for the full, conclusive
 * history) -- shares one property: the piece a point belongs to is decided
 * PURELY by a local distance/plane criterion evaluated independently at
 * that one point, with NO awareness of what its neighbors decided. That is
 * exactly what lets a small, isolated pocket of points end up on the
 * "wrong" side of a criterion that is only slightly closer for the wrong
 * piece -- nothing in any prior attempt's own objective penalizes that
 * outcome.
 *
 * This is a genuinely different family: a discrete multi-label
 * relaxation-labeling optimization (Besag's ICM -- Iterated Conditional
 * Modes -- for a Potts-model random field; a real, well-established
 * approximate solver for exactly this kind of labeling problem, simpler
 * to implement correctly than exact multi-label graph cuts/alpha-expansion
 * while sharing the same objective: `sum(dataCost) + smoothnessWeight *
 * sum(neighbor label mismatches)`) that explicitly, directly penalizes a
 * label differing from its neighbors in its own objective function. A
 * small isolated pocket of one label surrounded by another now has a real
 * COST attached to staying that way, not just an emergent side effect of
 * how a distance field happens to fall.
 *
 * `relaxLabeling` is the reusable, geometry-independent core: given only a
 * data-cost grid (voxel x label) and its dimensions, it repeatedly
 * revisits each voxel and keeps whichever label locally minimizes the
 * combined cost, converging (or reaching `maxIterations`) when no voxel's
 * label would change. This can be tested and verified in complete
 * isolation from any mesh/BVH/Manifold machinery -- see
 * `multiLabelReconstruction.test.ts`'s synthetic "isolated island" case,
 * which proves directly that this mechanism does what none of the prior
 * distance-metric attempts could: remove a small mislabeled pocket
 * entirely, purely because sitting inside a much larger region of a
 * different label costs more than switching.
 */
export interface RelaxLabelingInput {
  readonly dims: readonly [number, number, number];
  readonly labelCount: number;
  /** Flat, voxel-major: `dataCost[voxelIndex * labelCount + label]`. Lower is a better fit for that label at that voxel. */
  readonly dataCost: Float64Array;
  /** Initial label per voxel (typically argmin of `dataCost`); mutated copy is NOT returned in place -- a new array is returned. */
  readonly initialLabels: Int32Array;
  /** Weight of one 6-connected neighbor having a different label, in the same units as `dataCost`. */
  readonly smoothnessWeight: number;
  readonly maxIterations: number;
}

export interface RelaxLabelingResult {
  readonly labels: Int32Array;
  readonly iterationsRun: number;
  readonly converged: boolean;
}

function voxelIndex(dims: readonly [number, number, number], x: number, y: number, z: number): number {
  return (z * dims[1] + y) * dims[0] + x;
}

/**
 * Besag's ICM for a Potts-model multi-label field over a 6-connected voxel
 * grid: revisits every voxel in raster order, each time picking the label
 * that minimizes `dataCost[label] + smoothnessWeight * (count of
 * 6-neighbors whose CURRENT label differs)` -- using neighbors' already-
 * updated labels within the same pass (Gauss-Seidel style), so improvements
 * propagate within a single iteration rather than waiting a full pass per
 * change. Monotonically non-increasing total energy by construction (a
 * voxel only changes label when doing so strictly lowers its own local
 * cost), so this always converges (or hits `maxIterations`) -- it is not
 * guaranteed to reach the GLOBAL optimum (that would need exact
 * multi-label graph cuts), but every step is a real, verifiable
 * improvement, never a heuristic guess.
 */
export function relaxLabeling(input: RelaxLabelingInput): RelaxLabelingResult {
  const { dims, labelCount, dataCost, initialLabels, smoothnessWeight, maxIterations } = input;
  const [sizeX, sizeY, sizeZ] = dims;
  const labels = Int32Array.from(initialLabels);
  const neighborCounts = new Float64Array(labelCount);
  let iterationsRun = 0;
  let converged = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    iterationsRun += 1;
    let changed = false;
    for (let z = 0; z < sizeZ; z += 1) {
      for (let y = 0; y < sizeY; y += 1) {
        for (let x = 0; x < sizeX; x += 1) {
          const v = voxelIndex(dims, x, y, z);
          neighborCounts.fill(0);
          let neighborTotal = 0;
          const visit = (nx: number, ny: number, nz: number) => {
            if (nx < 0 || ny < 0 || nz < 0 || nx >= sizeX || ny >= sizeY || nz >= sizeZ) return;
            const neighborLabel = labels[voxelIndex(dims, nx, ny, nz)]!;
            neighborCounts[neighborLabel]! += 1;
            neighborTotal += 1;
          };
          visit(x - 1, y, z);
          visit(x + 1, y, z);
          visit(x, y - 1, z);
          visit(x, y + 1, z);
          visit(x, y, z - 1);
          visit(x, y, z + 1);

          let bestLabel = labels[v]!;
          let bestCost = Infinity;
          for (let label = 0; label < labelCount; label += 1) {
            const mismatchCount = neighborTotal - neighborCounts[label]!;
            const cost = dataCost[v * labelCount + label]! + smoothnessWeight * mismatchCount;
            if (cost < bestCost) {
              bestCost = cost;
              bestLabel = label;
            }
          }
          if (bestLabel !== labels[v]) {
            labels[v] = bestLabel;
            changed = true;
          }
        }
      }
    }
    if (!changed) {
      converged = true;
      break;
    }
  }

  return { labels, iterationsRun, converged };
}

/** argmin over labels of `dataCost[voxel * labelCount + label]`, per voxel -- the natural "no smoothness at all" starting point (equivalent in spirit to `volumetricPartition.ts`'s no-tie-break baseline). */
export function argminLabels(dataCost: Float64Array, voxelCount: number, labelCount: number): Int32Array {
  const labels = new Int32Array(voxelCount);
  for (let v = 0; v < voxelCount; v += 1) {
    let bestLabel = 0;
    let bestCost = Infinity;
    for (let label = 0; label < labelCount; label += 1) {
      const cost = dataCost[v * labelCount + label]!;
      if (cost < bestCost) {
        bestCost = cost;
        bestLabel = label;
      }
    }
    labels[v] = bestLabel;
  }
  return labels;
}
