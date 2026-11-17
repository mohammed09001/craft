/**
 * Master Mold foundation reference fixture generator for the native migration.
 *
 * Runs the real reference seed builder, source-mesh preflight, planning mesh
 * and candidate-direction generator on fixed inputs and records inputs and
 * outputs in native/tests/fixtures/reference/master-reference.json, which
 * native/tests/tst_master_equivalence.cpp replays.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hashNumericArray } from "@/features/mold-generation/geometry/geometryFingerprint";
import {
  buildMasterMoldSeedSnapshot,
  masterSeedStalenessIdentity,
  worldMeshFromSnapshot,
} from "@/features/mold-generation/master-mold/seed/masterMoldSeed";
import { runMeshPreflight } from "@/features/mold-generation/master-mold/planning/meshPreflight";
import { buildPlanningMesh } from "@/features/mold-generation/master-mold/planning/planningMesh";
import { generateCandidateDirections } from "@/features/mold-generation/master-mold/planning/candidateDirections";
import { buildSurfaceRegionGraph, summarizeRegionAccessibility, unresolvedSurfaceRegions } from "@/features/mold-generation/master-mold/planning/surfaceRegions";
import { refineRegionGraphByVisibility } from "@/features/mold-generation/master-mold/planning/regionSubdivision";
import { analyzeDirectionAccessibility, pruneDirections } from "@/features/mold-generation/master-mold/planning/accessibility";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.CRAFT_MASTER_OUTPUT ?? resolve(here, "../fixtures/reference/master-reference.json");

type Bounds = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

interface MeshSpec {
  name: string;
  positions: number[];
  indices: number[];
  transform: number[];
  printer: { x: number; y: number; z: number } | null;
  /** Present for meshes the native test regenerates from a recipe instead of storing them. */
  recipe?: { kind: "cube-grid"; segments: number; size: number };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function boundsOf(positions: number[]): Bounds {
  const b: Bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (let i = 0; i < positions.length; i += 3) {
    b.min.x = Math.min(b.min.x, positions[i]!); b.max.x = Math.max(b.max.x, positions[i]!);
    b.min.y = Math.min(b.min.y, positions[i + 1]!); b.max.y = Math.max(b.max.y, positions[i + 1]!);
    b.min.z = Math.min(b.min.z, positions[i + 2]!); b.max.z = Math.max(b.max.z, positions[i + 2]!);
  }
  return b;
}

function boxMesh(x: number, y: number, z: number): { positions: number[]; indices: number[] } {
  const positions = [0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, z, x, 0, z, x, y, z, 0, y, z];
  const indices = [
    0, 2, 1, 0, 3, 2, // bottom (-z)
    4, 5, 6, 4, 6, 7, // top (+z)
    0, 1, 5, 0, 5, 4, // front (-y)
    2, 3, 7, 2, 7, 6, // back (+y)
    1, 2, 6, 1, 6, 5, // right (+x)
    3, 0, 4, 3, 4, 7, // left (-x)
  ];
  return { positions, indices };
}

/** Binary STL read as an unindexed triangle soup, like the real import path. */
function stlSoup(path: string): { positions: number[]; indices: number[] } {
  const buf = readFileSync(path);
  const count = buf.readUInt32LE(80);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let t = 0; t < count; t += 1) {
    const base = 84 + t * 50;
    for (let v = 0; v < 3; v += 1) {
      for (let c = 0; c < 3; c += 1) positions.push(buf.readFloatLE(base + 12 + v * 12 + c * 4));
      indices.push(t * 3 + v);
    }
  }
  return { positions, indices };
}

/** Closed-per-face subdivided cube; the recipe is mirrored exactly in the native test. */
function cubeGrid(segments: number, size: number): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const uAxis = (axis + 1) % 3;
    const vAxis = (axis + 2) % 3;
    for (const positive of [true, false]) {
      const base = positions.length / 3;
      for (let i = 0; i <= segments; i += 1) {
        for (let j = 0; j <= segments; j += 1) {
          const p = [0, 0, 0];
          p[axis] = positive ? size : 0;
          p[uAxis] = (i * size) / segments;
          p[vAxis] = (j * size) / segments;
          positions.push(p[0]!, p[1]!, p[2]!);
        }
      }
      const at = (i: number, j: number) => base + i * (segments + 1) + j;
      for (let i = 0; i < segments; i += 1) {
        for (let j = 0; j < segments; j += 1) {
          if (positive) indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
          else indices.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1));
        }
      }
    }
  }
  return { positions, indices };
}

function runCase(spec: MeshSpec) {
  const localBounds = boundsOf(spec.positions);
  const seed = buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: `model-${spec.name}`,
      positions: spec.positions,
      indices: spec.indices,
      transform: spec.transform,
      localBounds,
      geometryVersion: `geom-${spec.name}`,
      sourceSignature: `sig-${spec.name}`,
    },
    printerBuildVolume: spec.printer,
    projectRevision: "rev-1",
  });
  const world = worldMeshFromSnapshot(seed);
  const preflight = runMeshPreflight({ positions: world.sourceMesh.positions, indices: world.sourceMesh.indices });
  const planning = buildPlanningMesh({
    positions: world.sourceMesh.positions,
    indices: world.sourceMesh.indices,
    bounds: world.sourceMesh.bounds,
    sourceGeometryVersion: world.sourceGeometryVersion,
  });
  const directions = generateCandidateDirections(planning, world.sourceMesh.positions);
  const accessibility = analyzeDirectionAccessibility({ positions: world.sourceMesh.positions, indices: world.sourceMesh.indices }, planning, directions);
  const regionGraph = buildSurfaceRegionGraph(planning);
  const summaries = summarizeRegionAccessibility(regionGraph, planning, accessibility);
  const refined = refineRegionGraphByVisibility(regionGraph, planning, accessibility);
  const refinedSummaries = summarizeRegionAccessibility(refined.regionGraph, planning, accessibility);
  const summaryJson = (list: typeof summaries) => list.map((s) => ({
    regionIndex: s.regionIndex,
    bestDirectionId: s.bestDirectionId,
    bestVisibleAreaFraction: s.bestVisibleAreaFraction,
    fractions: Object.fromEntries(s.visibleAreaFractionByDirectionId),
  }));
  const pruned = pruneDirections(directions, accessibility, planning, 6);
  return {
    surface: {
      regions: regionGraph.regions,
      regionOfPatch: regionGraph.regionOfPatch,
      summaries: summaryJson(summaries),
      unresolved: unresolvedSurfaceRegions(summaries, regionGraph).map((r) => r.regionIndex),
      refined: { regions: refined.regionGraph.regions, regionOfPatch: refined.regionGraph.regionOfPatch, subdividedRegionCount: refined.subdividedRegionCount, summaries: summaryJson(refinedSummaries) },
    },
    accessibility: { perDirection: accessibility.perDirection, dominantPatchOrder: accessibility.dominantPatchOrder },
    pruned: pruned.directions.map((d) => d.directionId),
    name: spec.name,
    input: spec.recipe
      ? { recipe: spec.recipe, transform: spec.transform, printer: spec.printer }
      : { positions: spec.positions, indices: spec.indices, transform: spec.transform, printer: spec.printer },
    seed: {
      seedId: seed.seedId,
      sourceGeometryVersion: seed.sourceGeometryVersion,
      bounds: seed.sourceBounds,
      worldPositionsHash: (hashNumericArray(Array.from(world.sourceMesh.positions)) >>> 0).toString(16).padStart(8, "0"),
      stalenessIdentity: masterSeedStalenessIdentity(seed),
    },
    preflight,
    planningMesh: {
      patches: planning.patches,
      adjacency: planning.adjacency,
      totalAreaMm2: planning.totalAreaMm2,
      vertexCount: planning.vertexCount,
      triangleCount: planning.triangleCount,
    },
    directions,
  };
}

it("writes the master mold foundation reference fixture", () => {
  const box = boxMesh(40, 30, 12);
  const bracket = stlSoup(process.env.CRAFT_BRACKET_STL ?? resolve(here, "../fixtures/models/bracket.stl"));
  const grid = cubeGrid(65, 100);
  // An open box (one triangle removed) and a box with a duplicated face exercise the preflight issues.
  const open = { positions: box.positions, indices: box.indices.slice(3) };
  const duplicated = { positions: box.positions, indices: [...box.indices, 0, 2, 1] };
  // C-shaped extrusion: the inner faces of the arms are undercuts along z, open along +x.
  const poly = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 20], [30, 20], [30, 30], [0, 30]] as const;
  const cPositions: number[] = [];
  for (const y of [0, 20]) for (const [px, pz] of poly) cPositions.push(px, y, pz);
  const cIndices: number[] = [];
  for (const [a, b, c] of [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 7], [4, 5, 6], [4, 6, 7]] as const) {
    cIndices.push(a + 8, c + 8, b + 8); // y = 20 cap, normal +y
    cIndices.push(a, b, c); // y = 0 cap, normal -y
  }
  for (let i = 0; i < 8; i += 1) {
    const j = (i + 1) % 8;
    cIndices.push(i, j + 8, j, i, i + 8, j + 8);
  }
  // Tessellated boxes (n x n quads per face, outward winding), unioned as a soup of parts: spine, two arms and a lip that
  // covers only half of the top arm, so the ceiling region is partly visible along +x.
  const tessBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, positions: number[], indices: number[]) => {
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let axis = 0; axis < 3; axis += 1) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (const positive of [true, false]) {
        const base = positions.length / 3;
        for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n; j += 1) {
          const p = [0, 0, 0];
          p[axis] = positive ? hi[axis]! : lo[axis]!;
          p[u] = lo[u]! + ((hi[u]! - lo[u]!) * i) / n;
          p[v] = lo[v]! + ((hi[v]! - lo[v]!) * j) / n;
          positions.push(p[0]!, p[1]!, p[2]!);
        }
        const at = (i: number, j: number) => base + i * (n + 1) + j;
        for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
          if (positive) indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
          else indices.push(at(i, j), at(i + 1, j + 1), at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1));
        }
      }
    }
  };
  const assemblyPositions: number[] = [];
  const assemblyIndices: number[] = [];
  tessBox(0, 0, 0, 10, 20, 30, 3, assemblyPositions, assemblyIndices);
  tessBox(10, 0, 0, 30, 20, 10, 3, assemblyPositions, assemblyIndices);
  tessBox(10, 0, 20, 30, 20, 30, 3, assemblyPositions, assemblyIndices);
  tessBox(26, 0, 12, 30, 10, 20, 2, assemblyPositions, assemblyIndices);
  const specs: MeshSpec[] = [
    { name: "box-rotated-translated", ...box, transform: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 10, 20, 5, 1], printer: { x: 220, y: 220, z: 250 } },
    { name: "bracket-soup", ...bracket, transform: IDENTITY, printer: null },
    { name: "c-extrusion", positions: cPositions, indices: cIndices, transform: IDENTITY, printer: null },
    { name: "c-assembly", positions: assemblyPositions, indices: assemblyIndices, transform: IDENTITY, printer: null },
    { name: "box-open", ...open, transform: IDENTITY, printer: null },
    { name: "box-duplicate-face", ...duplicated, transform: IDENTITY, printer: null },
    { name: "cube-grid-large", positions: grid.positions, indices: grid.indices, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -50, -50, 0, 1], printer: null, recipe: { kind: "cube-grid", segments: 65, size: 100 } },
  ];
  const cases = specs.map(runCase);
  const document = {
    schema: "craft.native-master-reference/1",
    generator: "native/tests/reference/craftMasterReference.test.ts",
    reference: "mold/frontend master-mold seed + meshPreflight + planningMesh + candidateDirections",
    cases,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document)}\n`, "utf8");
  expect(cases.length).toBe(specs.length);
}, 120_000);
