/**
 * Reference fixture generator for the native migration.
 *
 * This file is NOT part of the frontend test suite. It runs the *real*
 * reference implementation (the TypeScript mold pipeline + manifold-3d WASM
 * in mold/frontend) on a fixed set of inputs and records both the inputs and
 * the outputs in native/tests/fixtures/reference/mold-reference.json.
 * native/tests/tst_reference_equivalence.cpp then feeds the recorded inputs
 * to the native C++ pipeline and compares the results.
 *
 * Regenerate with scripts/native/generate-reference-fixtures.ps1 (needs the
 * frontend's node_modules). The committed JSON is the equivalence baseline;
 * regenerate it only when the reference behaviour intentionally changes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGeometryTolerancePolicy } from "@/features/mold-generation/geometry/geometryTolerance";
import { buildCavityGenerationInput } from "@/features/mold-generation/cavity-generation/cavityGeneration.input";
import { evaluateCavityGeneration } from "@/features/mold-generation/cavity-generation/cavityGeneration.evaluate";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import {
  createWholeMoldBody,
  generateMoldBodies,
  type MoldBodyData,
} from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import { createReferenceMoldFrameBounds } from "@/features/mold-generation/reference-mold-definition/referenceMoldBlock.geometry";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";
import type { PartBoundingBoxFaceId } from "@/features/mold-generation/split-face/splitFace.contracts";
import {
  createCuttingPlane,
  cuttingPlanesToCutPlaneData,
} from "@/features/mold-generation/split-face/splitFace.geometry";
import { calculateModelGroundingTransform } from "@/features/viewport/runtime/modelGrounding";
import { deriveAdaptiveGridConfig } from "@/features/viewport/runtime/adaptiveGrid";
import { calculateFitDistance } from "@/features/viewport/runtime/viewPose";

type Vec = readonly [number, number, number];
type Bounds = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

// The generator script runs a staged copy of this file from inside the
// frontend tree (Vitest refuses test files outside its root) and passes the
// real destination through CRAFT_REFERENCE_OUTPUT.
const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.CRAFT_REFERENCE_OUTPUT ?? resolve(here, "../fixtures/reference/mold-reference.json");

// --- part builders: float32 triangle soups, as an STL import produces -------

function soup(triangles: readonly (readonly [Vec, Vec, Vec])[]): number[] {
  const positions: number[] = [];
  for (const triangle of triangles) for (const vertex of triangle) for (const value of vertex) positions.push(Math.fround(value));
  return positions;
}

function boxSoup(min: Vec, max: Vec): number[] {
  const v: Vec[] = [
    [min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]],
    [max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]], [max[0], min[1], max[2]],
  ];
  const faces = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 1, 3, 2, 6, 3, 6, 5, 0, 3, 5, 0, 5, 4, 1, 7, 6, 1, 6, 2];
  const triangles: [Vec, Vec, Vec][] = [];
  for (let i = 0; i < faces.length; i += 3) triangles.push([v[faces[i]!]!, v[faces[i + 1]!]!, v[faces[i + 2]!]!]);
  return soup(triangles);
}

function sphereSoup(center: Vec, radius: number, segments: number, rings: number): number[] {
  const point = (ring: number, segment: number): Vec => {
    const phi = (Math.PI * ring) / rings;
    const theta = (2 * Math.PI * (segment % segments)) / segments;
    return [
      center[0] + radius * Math.sin(phi) * Math.cos(theta),
      center[1] + radius * Math.sin(phi) * Math.sin(theta),
      center[2] + radius * Math.cos(phi),
    ];
  };
  const triangles: [Vec, Vec, Vec][] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    triangles.push([point(0, 0), point(1, segment), point(1, segment + 1)]);
    for (let ring = 1; ring < rings - 1; ring += 1) {
      const a = point(ring, segment), b = point(ring, segment + 1);
      const c = point(ring + 1, segment), d = point(ring + 1, segment + 1);
      triangles.push([a, c, d], [a, d, b]);
    }
    triangles.push([point(rings, 0), point(rings - 1, segment + 1), point(rings - 1, segment)]);
  }
  return soup(triangles);
}

/** Triangular prism: a non-box, non-symmetric convex part. */
function wedgeSoup(): number[] {
  const a0: Vec = [-10, -8, 0], b0: Vec = [10, -8, 0], c0: Vec = [0, 8, 0];
  const a1: Vec = [-10, -8, 12], b1: Vec = [10, -8, 12], c1: Vec = [0, 8, 12];
  return soup([
    [a0, c0, b0], [a1, b1, c1],
    [a0, b0, b1], [a0, b1, a1],
    [b0, c0, c1], [b0, c1, b1],
    [c0, a0, a1], [c0, a1, c1],
  ]);
}

/** Drops the last `count` triangles to create open-mesh defects. */
const withoutLastTriangles = (positions: readonly number[], count: number) => positions.slice(0, positions.length - count * 9);

function twoCubesSoup(): number[] {
  return [...boxSoup([-30, -10, 0], [-10, 10, 20]), ...boxSoup([10, -10, 0], [30, 10, 20])];
}

const parts: Record<string, number[]> = {
  twoCubes: twoCubesSoup(),
  cube20: boxSoup([-10, -10, 0], [10, 10, 20]),
  block30x20x10: boxSoup([-15, -10, 0], [15, 10, 10]),
  sphereR10: sphereSoup([0, 0, 10], 10, 24, 12),
  wedge: wedgeSoup(),
  cubeMissingTriangle: withoutLastTriangles(boxSoup([-10, -10, 0], [10, 10, 20]), 1),
  cubeMissingFace: withoutLastTriangles(boxSoup([-10, -10, 0], [10, 10, 20]), 2),
};

interface PlaneSpec { face: PartBoundingBoxFaceId; normalizedPosition: number | null }
interface CaseSpec { name: string; part: string; moldClearanceMm: number; cavityClearanceMm?: number; planes: PlaneSpec[] }

const cases: CaseSpec[] = [
  { name: "cube whole block", part: "cube20", moldClearanceMm: 10, planes: [] },
  { name: "cube mid-height split", part: "cube20", moldClearanceMm: 10, planes: [{ face: "top", normalizedPosition: 0.5 }] },
  { name: "cube default top plane", part: "cube20", moldClearanceMm: 10, planes: [{ face: "top", normalizedPosition: null }] },
  { name: "cube two-axis split, large clearance", part: "cube20", moldClearanceMm: 25, planes: [{ face: "top", normalizedPosition: 0.5 }, { face: "right", normalizedPosition: 0.5 }] },
  { name: "flat block front split", part: "block30x20x10", moldClearanceMm: 5, planes: [{ face: "front", normalizedPosition: 0.3 }] },
  { name: "sphere equator split", part: "sphereR10", moldClearanceMm: 10, planes: [{ face: "top", normalizedPosition: 0.5 }] },
  { name: "sphere off-equator split", part: "sphereR10", moldClearanceMm: 10, planes: [{ face: "top", normalizedPosition: 0.37 }] },
  { name: "sphere whole block", part: "sphereR10", moldClearanceMm: 8, planes: [] },
  { name: "wedge two-axis split", part: "wedge", moldClearanceMm: 10, planes: [{ face: "top", normalizedPosition: 0.5 }, { face: "left", normalizedPosition: 0.25 }] },
  { name: "wedge thin shell, default bottom + back", part: "wedge", moldClearanceMm: 3, planes: [{ face: "bottom", normalizedPosition: null }, { face: "back", normalizedPosition: 0.6 }] },
  { name: "cube with one missing triangle is repaired", part: "cubeMissingTriangle", moldClearanceMm: 10, planes: [{ face: "top", normalizedPosition: 0.5 }] },
  { name: "cube direct offset 2mm, mid split", part: "cube20", moldClearanceMm: 10, cavityClearanceMm: 2, planes: [{ face: "top", normalizedPosition: 0.5 }] },
  { name: "cube direct offset 0.5mm, whole block", part: "cube20", moldClearanceMm: 10, cavityClearanceMm: 0.5, planes: [] },
  { name: "sphere direct offset 1mm, equator split", part: "sphereR10", moldClearanceMm: 10, cavityClearanceMm: 1, planes: [{ face: "top", normalizedPosition: 0.5 }] },
  { name: "wedge direct offset 1.5mm, two-axis split", part: "wedge", moldClearanceMm: 10, cavityClearanceMm: 1.5, planes: [{ face: "top", normalizedPosition: 0.5 }, { face: "left", normalizedPosition: 0.25 }] },
  { name: "two cubes distance-field offset 1mm", part: "twoCubes", moldClearanceMm: 20, cavityClearanceMm: 1, planes: [] },
  { name: "two cubes distance-field offset 1mm, split between", part: "twoCubes", moldClearanceMm: 20, cavityClearanceMm: 1, planes: [{ face: "right", normalizedPosition: 0.5 }] },
  { name: "offset reaching the block wall is rejected", part: "cube20", moldClearanceMm: 3, cavityClearanceMm: 3, planes: [] },
  { name: "cube with a missing face is rejected", part: "cubeMissingFace", moldClearanceMm: 10, planes: [] },
];

function boundsOf(positions: readonly number[]): Bounds {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]!); min.y = Math.min(min.y, positions[i + 1]!); min.z = Math.min(min.z, positions[i + 2]!);
    max.x = Math.max(max.x, positions[i]!); max.y = Math.max(max.y, positions[i + 1]!); max.z = Math.max(max.z, positions[i + 2]!);
  }
  return { min, max };
}

const describeBody = (body: MoldBodyData) => ({
  id: body.id,
  name: body.name,
  bounds: body.bounds,
  volumeMm3: body.volumeMm3,
  triangleCount: body.triangleCount,
  vertexCount: body.mesh.positions.length / 3,
});

async function runCase(spec: CaseSpec) {
  const positions = parts[spec.part]!;
  const groundedBounds = boundsOf(positions);
  const frame = createReferenceMoldFrameBounds(groundedBounds, spec.moldClearanceMm)!;
  const modelId = `1:${spec.part}.stl:${positions.length}`;
  const definitionId = `reference-mold:${modelId}`;

  const cuttingPlanes = spec.planes.map((plane) =>
    createCuttingPlane(
      plane.face,
      plane.normalizedPosition === null ? undefined : { normalizedPosition: plane.normalizedPosition, provenance: "manual" },
    ),
  );
  const cutPlanes = cuttingPlanesToCutPlaneData(frame.selectionBoxBounds, cuttingPlanes);

  const base: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId,
    modelId,
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: frame.selectionBoxBounds,
    referenceMoldBlock: { clearanceMm: spec.moldClearanceMm, bounds: frame.referenceMoldBlockBounds },
    moldFrame: {
      frameId: `mold-frame:${modelId}`,
      version: 1,
      units: "millimeters",
      upAxis: "Z",
      partOffset: frame.partOffset,
      semanticFaces: {
        front: { axis: "y", direction: 1 }, back: { axis: "y", direction: -1 },
        left: { axis: "x", direction: -1 }, right: { axis: "x", direction: 1 },
        top: { axis: "z", direction: 1 }, bottom: { axis: "z", direction: -1 },
      },
    },
    usedFaces: cutPlanes.map((plane) => plane.sourceFace),
  };
  const moldBodies = cutPlanes.length > 0
    ? generateMoldBodies(base, cutPlanes)
    : [createWholeMoldBody(base, { id: `${definitionId}:whole`, name: "Mold" })];
  const definition: ReferenceMoldDefinition = { ...base, moldBodies };

  const sourcePartMesh: CanonicalPartGeometry = {
    modelId,
    geometryVersion: `part_mesh:${spec.part}`,
    units: "millimeters",
    upAxis: "Z",
    positions,
    indices: Array.from({ length: positions.length / 3 }, (_, index) => index),
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    localBounds: groundedBounds,
    winding: "source",
    validationStatus: "captured",
    sourceSignature: `part_mesh:${spec.part}:identity`,
  };

  const expected: Record<string, unknown> = {
    groundedBounds,
    partOffset: frame.partOffset,
    selectionBoxBounds: frame.selectionBoxBounds,
    referenceMoldBlockBounds: frame.referenceMoldBlockBounds,
    tolerancePolicy: buildGeometryTolerancePolicy(frame.referenceMoldBlockBounds, spec.cavityClearanceMm ?? 0),
    cutPlanes: cutPlanes.map((plane) => ({ axis: plane.axis, coordinate: plane.coordinate, sourceFace: plane.sourceFace, order: plane.order })),
    sourceBodies: moldBodies.map(describeBody),
  };

  try {
    const input = buildCavityGenerationInput({
      sourcePartMesh,
      definition,
      cuttingPlanes,
      cavityClearanceMm: spec.cavityClearanceMm ?? 0,
      qualityMode: "standard",
      generationVersion: 1,
    });
    const { result, validationWarnings } = await evaluateCavityGeneration(input);
    expected.outcome = "ok";
    expected.selectedEngine = result.diagnostics?.selectedEngine;
    expected.engineReasonCodes = result.diagnostics?.engineReasonCodes;
    expected.usedFallback = result.diagnostics?.usedFallback;
    expected.attemptStatuses = result.diagnostics?.attempts.map((a) => `${a.engine}:${a.status}`);
    expected.tool = {
      bounds: result.cavityTool.bounds,
      volumeMm3: result.cavityTool.volumeMm3,
      triangleCount: result.cavityTool.triangleCount,
      vertexCount: result.cavityTool.mesh.positions.length / 3,
      implementationMethod: result.cavityTool.implementationMethod,
      connectedComponentCount: result.cavityTool.connectedComponentCount,
    };
    expected.bodies = result.bodies.map((body) => ({
      ...describeBody(body),
      parentBodyId: body.parentBodyId,
      cavityAffected: body.cavityAffected,
      reasonCodes: body.cavityValidation.reasonCodes,
      minimumWallMm: body.cavityValidation.minimumWallMm,
      cavitySurfaceTriangleCount: (body.mesh.faceRuns ?? [])
        .filter((run) => run.role === "cavity-surface")
        .reduce((sum, run) => sum + run.triangleCount, 0),
    }));
    expected.subtraction = result.diagnostics?.subtraction;
    expected.warningCodes = result.warnings.map((warning) => warning.reasonCode);
    expected.validationWarningCodes = validationWarnings.map((warning) => warning.reasonCode);
  } catch (error) {
    expected.outcome = "error";
    expected.error = {
      code: (error as { code?: string }).code ?? null,
      stage: (error as { stage?: string }).stage ?? null,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return { name: spec.name, input: { part: spec.part, moldClearanceMm: spec.moldClearanceMm, cavityClearanceMm: spec.cavityClearanceMm ?? 0, planes: spec.planes }, expected };
}

it("writes the native-migration reference fixtures", async () => {
  const moldCases = [];
  for (const spec of cases) moldCases.push(await runCase(spec));

  const groundingInputs: Bounds[] = [
    { min: { x: 10, y: 20, z: 5 }, max: { x: 30, y: 60, z: 25 } },
    { min: { x: -3.5, y: -1.25, z: -7 }, max: { x: 12.5, y: 8.75, z: -2 } },
  ];
  const gridInputs: (Bounds | null)[] = [
    null,
    { min: { x: -50, y: -20, z: 0 }, max: { x: 50, y: 20, z: 30 } },
    { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    { min: { x: -330, y: -120, z: 0 }, max: { x: 330, y: 120, z: 75 } },
  ];
  const fitInputs = [
    { radius: 10, verticalFovDegrees: 45, aspect: 2 },
    { radius: 10, verticalFovDegrees: 45, aspect: 0.5 },
    { radius: 173.2, verticalFovDegrees: 45, aspect: 1.6 },
  ];

  const document = {
    schema: "craft.native-reference-fixtures/1",
    generator: "native/tests/reference/craftReference.test.ts",
    reference: "mold/frontend TypeScript pipeline + manifold-3d (WASM)",
    units: "millimeters",
    upAxis: "Z",
    parts,
    moldCases,
    grounding: groundingInputs.map((bounds) => ({ bounds, expected: calculateModelGroundingTransform(bounds) })),
    adaptiveGrid: gridInputs.map((bounds) => ({ bounds, expected: deriveAdaptiveGridConfig(bounds) })),
    fitDistance: fitInputs.map((input) => ({ input, expected: calculateFitDistance(input) })),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document)}\n`, "utf8");
  expect(moldCases.length).toBe(cases.length);
}, 120_000);
