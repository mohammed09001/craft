import type { PlanningCandidateDirection, PlanningMesh } from "./masterMoldPlanning.contracts";
import { MASTER_PLANNER_LIMITS } from "./masterMoldPlanning.contracts";

/**
 * Execution 06 Article 04: geometry-derived candidate release directions.
 *
 * Sources (bounded, deterministic): ±world axes, principal shape axes (PCA
 * over the vertex distribution), dominant planar-patch normals, and dominant
 * area-weighted normal clusters. Candidates are deduplicated by angle and
 * capped by a centralized budget. Revolution-axis inference is deferred
 * until a confidence measure exists (do not invent directions with low
 * confidence). Cheap preliminary ranking happens after global accessibility
 * (the two stages share one visibility computation).
 */

const RAD_TO_DEG = 180 / Math.PI;

export function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function angleBetweenDeg(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const cos = Math.min(1, Math.max(-1, dot(a, b)));
  return Math.acos(cos) * RAD_TO_DEG;
}

export function normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 1e-9 || !Number.isFinite(length)) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Deterministic canonical sign: the component with the largest magnitude is
 * made positive so ±d collapse to one representation before polarity split.
 */
function canonicalDirection(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  const flip = ax >= ay && ax >= az ? v.x < 0 : ay >= az ? v.y < 0 : v.z < 0;
  return flip ? { x: -v.x, y: -v.y, z: -v.z } : v;
}

export type CovarianceMatrix = readonly [number, number, number, number, number, number, number, number, number];

/**
 * Cyclic Jacobi eigendecomposition of a symmetric 3x3 matrix; returns
 * eigenvectors sorted by descending eigenvalue. Deterministic for a fixed
 * input (fixed sweep order, fixed rotation thresholds).
 */
export function principalAxesOfCovariance(covariance: CovarianceMatrix): { x: number; y: number; z: number }[] {
  let a: number[][] = [
    [covariance[0], covariance[1], covariance[2]],
    [covariance[3], covariance[4], covariance[5]],
    [covariance[6], covariance[7], covariance[8]],
  ];
  let v: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 32; sweep += 1) {
    const off = Math.abs(a[0]![1]!) + Math.abs(a[0]![2]!) + Math.abs(a[1]![2]!);
    if (off < 1e-12) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = a[p]![q]!;
      if (Math.abs(apq) < 1e-14) continue;
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      const next: number[][] = a.map((row) => [...row]);
      next[p]![p] = a[p]![p]! - t * apq;
      next[q]![q] = a[q]![q]! + t * apq;
      next[p]![q] = 0;
      next[q]![p] = 0;
      for (let i = 0; i < 3; i += 1) {
        if (i !== p && i !== q) {
          next[p]![i] = c * a[p]![i]! - s * a[q]![i]!;
          next[i]![p] = next[p]![i]!;
          next[q]![i] = s * a[p]![i]! + c * a[q]![i]!;
          next[i]![q] = next[q]![i]!;
        }
      }
      a = next;
      const nv: number[][] = v.map((row) => [...row]);
      for (let i = 0; i < 3; i += 1) {
        nv[i]![p] = c * v[i]![p]! - s * v[i]![q]!;
        nv[i]![q] = s * v[i]![p]! + c * v[i]![q]!;
      }
      v = nv;
    }
  }
  const eigen = [0, 1, 2]
    .map((index) => ({ value: a[index]![index]!, axis: { x: v[0]![index]!, y: v[1]![index]!, z: v[2]![index]! } }))
    .sort((first, second) => second.value - first.value);
  return eigen.map((entry) => canonicalDirection(normalize(entry.axis) ?? { x: 1, y: 0, z: 0 }));
}

function covarianceOfVertices(positions: readonly number[]): CovarianceMatrix {
  let count = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const stride = Math.max(1, Math.floor(positions.length / 3 / 8192));
  for (let vertex = 0; vertex < positions.length / 3; vertex += stride) {
    sx += positions[vertex * 3]!;
    sy += positions[vertex * 3 + 1]!;
    sz += positions[vertex * 3 + 2]!;
    count += 1;
  }
  const mx = sx / count;
  const my = sy / count;
  const mz = sz / count;
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex += stride) {
    const dx = positions[vertex * 3]! - mx;
    const dy = positions[vertex * 3 + 1]! - my;
    const dz = positions[vertex * 3 + 2]! - mz;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  return [xx, xy, xz, xy, yy, yz, xz, yz, zz];
}

interface ClusterSeed {
  readonly direction: { x: number; y: number; z: number };
  areaMm2: number;
}

/** Area-weighted greedy normal clustering (bounded seeds; deterministic by descending patch area). */
function dominantNormalClusters(planningMesh: PlanningMesh): ClusterSeed[] {
  const order = [...planningMesh.patches].sort(
    (a, b) => b.areaMm2 - a.areaMm2 || a.patchIndex - b.patchIndex,
  );
  const seeds: ClusterSeed[] = [];
  const clusterAngle = MASTER_PLANNER_LIMITS.directionDedupAngleDeg * 3;
  for (const patch of order) {
    const existing = seeds.find((seed) => angleBetweenDeg(seed.direction, patch.normal) <= clusterAngle);
    if (existing !== undefined) {
      existing.areaMm2 += patch.areaMm2;
    } else if (seeds.length < MASTER_PLANNER_LIMITS.maxNormalClusterSeeds) {
      seeds.push({ direction: { ...patch.normal }, areaMm2: patch.areaMm2 });
    }
  }
  return seeds;
}

function deduplicateAndCap(candidates: PlanningCandidateDirection[]): PlanningCandidateDirection[] {
  const unique: PlanningCandidateDirection[] = [];
  for (const candidate of candidates) {
    const duplicate = unique.find(
      (existing) => angleBetweenDeg(existing.vector, candidate.vector) <= MASTER_PLANNER_LIMITS.directionDedupAngleDeg,
    );
    if (duplicate !== undefined) continue;
    unique.push(candidate);
    if (unique.length >= MASTER_PLANNER_LIMITS.maxCandidateDirections) break;
  }
  return unique;
}

/**
 * Generates the bounded, deduplicated candidate direction set with BOTH
 * polarities of every geometry-derived direction (release feasibility is
 * polarity-specific: a patch visible along +Z is generally not visible along
 * -Z). Polarity-resolved candidates are what the accessibility matrix and
 * the decomposition search consume.
 */
export function generateCandidateDirections(planningMesh: PlanningMesh, worldPositions: readonly number[]): PlanningCandidateDirection[] {
  const canonical: PlanningCandidateDirection[] = [];
  const worldAxes: readonly { readonly vector: PlanningCandidateDirection["vector"]; readonly origin: string }[] = [
    { vector: { x: 1, y: 0, z: 0 }, origin: "world+X" },
    { vector: { x: 0, y: 1, z: 0 }, origin: "world+Y" },
    { vector: { x: 0, y: 0, z: 1 }, origin: "world+Z" },
  ];
  for (const axis of worldAxes) {
    canonical.push({ directionId: `world:${axis.origin}`, vector: axis.vector, source: "world-axis", origin: axis.origin });
  }

  if (worldPositions.length >= 9) {
    const axes = principalAxesOfCovariance(covarianceOfVertices(worldPositions));
    axes.forEach((axis, index) => {
      const normalized = normalize(axis);
      if (normalized === null) return;
      canonical.push({ directionId: `pca:${index}`, vector: normalized, source: "principal-axis", origin: `principal-${index}` });
    });
  }

  // Dominant planar patches: normal clusters already capture them; the two
  // sources intentionally overlap and deduplication merges them (Lin-Quang
  // candidate sources collapse to one bounded set).
  const clusters = dominantNormalClusters(planningMesh);
  clusters
    .sort((a, b) => b.areaMm2 - a.areaMm2)
    .forEach((cluster, index) => {
      const normalized = normalize(cluster.direction);
      if (normalized === null) return;
      const oriented = canonicalDirection(normalized);
      canonical.push({
        directionId: `cluster:${index}`,
        vector: oriented,
        source: "normal-cluster",
        origin: `cluster-${index}-area-${Math.round(cluster.areaMm2)}`,
      });
    });

  const deduped = deduplicateAndCap(canonical);
  const polarized: PlanningCandidateDirection[] = [];
  for (const candidate of deduped) {
    polarized.push(candidate);
    polarized.push({
      directionId: `${candidate.directionId}:neg`,
      vector: { x: -candidate.vector.x, y: -candidate.vector.y, z: -candidate.vector.z },
      source: candidate.source,
      origin: `${candidate.origin}-neg`,
    });
  }
  return polarized;
}
