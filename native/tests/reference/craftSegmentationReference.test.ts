/**
 * Segmentation reference fixture generator for the native migration.
 *
 * Like craftReference.test.ts this is NOT a frontend test: it runs the real
 * reference implementation (source snapshot from the real stores, planner,
 * extension merge, execution preflight, the Manifold plane executor and the
 * committed registration with the automatic sizing policy) on fixed inputs and
 * records inputs and outputs in native/tests/fixtures/reference/segmentation-reference.json.
 * native/tests/tst_segmentation_equivalence.cpp replays the inputs natively.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import {
  baselineSegmentationAlgorithm,
  createSegmentationExecutionRequest,
  createSegmentationRequest,
  deriveAxisOwnership,
  mergeExtensionBoundary,
  planSegmentation,
  suggestExtensionAxisPosition,
  type FitAxis,
  type SegmentationPlan,
  type SegmentationSourceSnapshot,
} from "@/features/mold-generation/segmentation";
import { readCurrentSegmentationSourceSnapshot } from "@/features/mold-generation/segmentation/application/segmentationSourceSnapshot";
import {
  buildSegmentationPlanPreviewBodies,
  generateCommittedSegmentationRegistration,
} from "@/features/mold-generation/segmentation/application/segmentationPreview";
import { executePlaneSegmentation } from "@/features/mold-generation/segmentation/execution/segmentationPlaneExecutor";
import { buildCavityGenerationInput } from "@/features/mold-generation/cavity-generation/cavityGeneration.input";
import { evaluateCavityGeneration } from "@/features/mold-generation/cavity-generation/cavityGeneration.evaluate";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import {
  buildRegistrationDependencySnapshot,
  generateDerivedRegistration,
  registrationSizingPolicyFor,
} from "@/features/mold-generation/registration";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.CRAFT_SEGMENTATION_OUTPUT ?? resolve(here, "../fixtures/reference/segmentation-reference.json");

interface RegionSpec {
  id: string;
  hardness: "hard" | "advisory";
  clearanceMm: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}
interface ExtensionSpec { axis: FitAxis; coordinateMm?: number }
interface CaseSpec {
  name: string;
  partBounds: { min: [number, number, number]; max: [number, number, number] };
  clearanceMm: number;
  printerVolume: [number, number, number];
  regions?: RegionSpec[];
  extension?: ExtensionSpec;
  execute?: boolean;
  /** After execution, run the real cavity generation + keyed registration on a cube part filling partBounds. */
  cavityCube?: boolean;
}

const PART = { min: [-20, -15, 0], max: [20, 15, 12] } as CaseSpec["partBounds"];

const cases: CaseSpec[] = [
  { name: "part fits the printer: segmentation not required", partBounds: PART, clearanceMm: 10, printerVolume: [300, 300, 300] },
  { name: "x only, two sections", partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], execute: true },
  { name: "x only, three sections", partBounds: PART, clearanceMm: 10, printerVolume: [100, 300, 300], execute: true },
  { name: "x and y, 2 x 2 grid", partBounds: PART, clearanceMm: 10, printerVolume: [150, 150, 300], execute: true },
  { name: "all three axes, 2 x 2 x 2 grid", partBounds: PART, clearanceMm: 10, printerVolume: [130, 130, 120], execute: true },
  { name: "larger requested clearance is used above the 100 mm floor", partBounds: PART, clearanceMm: 120, printerVolume: [200, 300, 300], execute: true },
  {
    name: "segmented mold: cavity subtraction and lineage-keyed registration",
    partBounds: { min: [-10, -10, 0], max: [10, 10, 20] }, clearanceMm: 10, printerVolume: [150, 300, 300], execute: true, cavityCube: true,
  },
  { name: "invalid printer volume", partBounds: PART, clearanceMm: 10, printerVolume: [0, 100, 100] },
  { name: "printer smaller than any feasible grid is still planned", partBounds: PART, clearanceMm: 10, printerVolume: [239, 229, 211] },
  {
    name: "hard protected region on the planned boundary blocks the plan",
    partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300],
    regions: [{ id: "committed-cavity", hardness: "hard", clearanceMm: 0, bounds: { min: [-5, -50, 0], max: [5, 50, 100] } }],
  },
  {
    name: "advisory protected region only warns",
    partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], execute: true,
    regions: [{ id: "committed-sprue:sprue:1", hardness: "advisory", clearanceMm: 0.5, bounds: { min: [-5, -50, 0], max: [5, 50, 100] } }],
  },
  { name: "extension on a free axis (suggested position)", partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], extension: { axis: "y" }, execute: true },
  { name: "extension on a free axis (manual position)", partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], extension: { axis: "z", coordinateMm: 60 }, execute: true },
  { name: "extension coordinate outside the body", partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], extension: { axis: "y", coordinateMm: 500 } },
  {
    name: "extension suggestion avoids a hard region",
    partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], extension: { axis: "y" },
    regions: [{ id: "committed-cavity", hardness: "hard", clearanceMm: 0, bounds: { min: [-100, -20, 0], max: [-90, 20, 100] } }],
  },
  { name: "extension on a required axis is ignored", partBounds: PART, clearanceMm: 10, printerVolume: [150, 300, 300], extension: { axis: "x", coordinateMm: 10 } },
];

const point = (p: readonly number[]) => ({ x: p[0]!, y: p[1]!, z: p[2]! });
const bounds = (b: CaseSpec["partBounds"]) => ({ min: point(b.min), max: point(b.max) });

const describeBody = (body: {
  id: string; name?: string; geometryVersion?: string; volumeMm3: number; bounds: unknown; triangleCount: number;
  mesh: { positions: readonly number[]; faceRuns?: readonly { role: string; triangleCount: number }[] };
}) => ({
  id: body.id,
  name: body.name ?? null,
  geometryVersion: body.geometryVersion ?? null,
  volumeMm3: body.volumeMm3,
  bounds: body.bounds,
  triangleCount: body.triangleCount,
  vertexCount: body.mesh.positions.length / 3,
  keyTriangleCount: (body.mesh.faceRuns ?? []).filter((run) => run.role === "registration-key").reduce((s, r) => s + r.triangleCount, 0),
});

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Closed box as a float32 triangle soup (same vertex order as the mold fixtures). */
function boxSoup(min: readonly number[], max: readonly number[]): number[] {
  const v = [
    [min[0]!, min[1]!, min[2]!], [min[0]!, min[1]!, max[2]!], [min[0]!, max[1]!, max[2]!], [min[0]!, max[1]!, min[2]!],
    [max[0]!, min[1]!, min[2]!], [max[0]!, max[1]!, min[2]!], [max[0]!, max[1]!, max[2]!], [max[0]!, min[1]!, max[2]!],
  ];
  const faces = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 1, 3, 2, 6, 3, 6, 5, 0, 3, 5, 0, 5, 4, 1, 7, 6, 1, 6, 2];
  const positions: number[] = [];
  for (const index of faces) for (const value of v[index]!) positions.push(Math.fround(value));
  return positions;
}

async function runCase(spec: CaseSpec) {
  useModelBoundsStore.setState({ groundedWorldBounds: bounds(spec.partBounds) } as never);
  useSplitFaceStore.setState({ clearanceMm: spec.clearanceMm } as never);
  const snapshotResult = readCurrentSegmentationSourceSnapshot();
  if (snapshotResult.status !== "ready") throw new Error(`source not ready for ${spec.name}: ${snapshotResult.status}`);
  let source: SegmentationSourceSnapshot = snapshotResult.snapshot;
  const definition = snapshotResult.definition;
  if (spec.regions !== undefined) {
    source = {
      ...source,
      protectedRegions: spec.regions.map((region) => ({
        id: region.id, kind: "cavity-surface", source: "cavity" as const, provenanceId: region.id,
        bodyIds: [source.bodies[0]!.id], bounds: bounds(region.bounds), hardness: region.hardness, clearanceMm: region.clearanceMm,
      })),
    };
  }
  const printerVolume = point(spec.printerVolume);
  const request = createSegmentationRequest({ source, printerVolume });
  const planning = planSegmentation({ request, source, algorithm: baselineSegmentationAlgorithm });

  const record: Record<string, unknown> = {
    name: spec.name,
    input: { ...spec },
    source: {
      identity: source.identity,
      aggregateBounds: source.aggregateBounds,
      bodies: source.bodies.map(describeBody),
      protectedRegionCount: source.protectedRegions.length,
      warningCodes: source.warnings.map((w) => w.reasonCode),
      definition: {
        definitionId: definition.definitionId, clearanceMm: definition.referenceMoldBlock.clearanceMm,
        selectionBoxBounds: definition.selectionBoxBounds, referenceMoldBlockBounds: definition.referenceMoldBlock.bounds,
        partOffset: definition.moldFrame?.partOffset,
      },
    },
    request,
    planning: {
      status: planning.status,
      stage: "stage" in planning ? planning.stage : null,
      reasonCode: "reasonCode" in planning ? planning.reasonCode : null,
      issues: "issues" in planning ? planning.issues.map((i) => ({ severity: i.severity, reasonCode: i.reasonCode, message: i.message, details: i.details ?? null })) : [],
      validation: planning.status === "not-required" ? json(planning.validation) : null,
    },
  };

  let plan: SegmentationPlan | null = planning.status === "planned" ? planning.plan : null;
  if (plan !== null) {
    record.plan = json(plan);
    const ownership = deriveAxisOwnership(plan.requiredAxes, []);
    record.axisOwnership = ownership;
    if (spec.extension !== undefined) {
      const suggested = suggestExtensionAxisPosition(source, spec.extension.axis);
      const coordinate = spec.extension.coordinateMm ?? suggested;
      const merged = mergeExtensionBoundary(plan, spec.extension.axis, coordinate, source.protectedRegions);
      record.extension = { suggestedMm: suggested, coordinateMm: coordinate, mergedPlan: json(merged), merged: merged !== plan };
      plan = merged;
    }
    // The store never builds preview geometry (or accepts) an invalid plan.
    if (plan.validation.status === "planning-valid") {
      record.preview = buildSegmentationPlanPreviewBodies({ plan, definition }).map(describeBody);
    }
  }

  if (plan !== null && spec.execute === true && plan.validation.status === "planning-valid") {
    const preflight = createSegmentationExecutionRequest({ plan, source, printerVolume });
    if (!preflight.ok) {
      record.execution = { preflight: "failed", status: preflight.result.status, reasonCode: "reasonCode" in preflight.result ? preflight.result.reasonCode : null, issues: preflight.result.issues.map((i) => i.message) };
    } else {
      const result = await executePlaneSegmentation(preflight.request);
      record.execution = {
        preflight: "ok",
        requestId: preflight.request.id,
        planeSequenceSignature: preflight.request.planeSequenceSignature,
        policy: preflight.request.policy,
        planes: preflight.request.planes.map((p) => ({ boundaryId: p.boundaryId, axis: p.axis, coordinateMm: p.coordinateMm })),
        status: result.status,
        reasonCode: "reasonCode" in result ? result.reasonCode : null,
        issues: result.issues.map((i) => i.message),
        diagnosticMessage: result.diagnostics[0]?.message ?? null,
        bodies: result.status === "executed"
          ? result.bodies.map((b) => ({ ...describeBody(b), provenance: b.provenance }))
          : [],
        validation: result.status === "executed" ? json({
          sourceVolumeMm3: result.validation.sourceVolumeMm3, outputVolumeMm3: result.validation.outputVolumeMm3,
          volumeDeltaMm3: result.validation.volumeDeltaMm3, overlapVolumeMm3: result.validation.overlapVolumeMm3,
          cuts: result.validation.cuts.map((c) => ({
            cutIndex: c.cutIndex, axis: c.axis, boundaryId: c.boundaryId, inputBodyId: c.inputBodyId,
            inputVolumeMm3: c.inputVolumeMm3, outputVolumeMm3: c.outputVolumeMm3, volumeDeltaMm3: c.volumeDeltaMm3, overlapVolumeMm3: c.overlapVolumeMm3,
          })),
        }) : null,
      };
      if (result.status === "executed") {
        const state = await generateCommittedSegmentationRegistration({ plan, source, definition, bodies: result.bodies });
        const report = state.report!;
        if (spec.cavityCube === true) {
          const positions = boxSoup(spec.partBounds.min, spec.partBounds.max);
          const modelId = definition.modelId;
          const part: CanonicalPartGeometry = {
            modelId, geometryVersion: "part_mesh:segmented-cube", units: "millimeters", upAxis: "Z", positions,
            indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            localBounds: bounds(spec.partBounds), winding: "source", validationStatus: "captured", sourceSignature: "part_mesh:segmented-cube:identity",
          };
          // Same promotion as the split-face store's buildSegmentationDerivedDefinition().
          const derivedDefinition: ReferenceMoldDefinition = {
            ...definition,
            definitionId: `${definition.definitionId}:segmentation:test`,
            moldBodies: result.bodies,
            moldBodiesPartitionReferenceBlock: false,
            segmentationLineage: true,
          };
          const cavityInput = buildCavityGenerationInput({
            sourcePartMesh: part, definition: derivedDefinition, cuttingPlanes: [], cavityClearanceMm: 0, qualityMode: "standard", generationVersion: 1,
          });
          const { result: cavity } = await evaluateCavityGeneration(cavityInput);
          const sizing = registrationSizingPolicyFor(derivedDefinition);
          const derivedSnapshot = buildRegistrationDependencySnapshot({
            bodies: cavity.bodies, definition: derivedDefinition, cuttingPlanes: [], cavityTool: cavity.cavityTool,
            cavityRevision: cavity.sourceSignature, sprues: [], manufacturingProfile: null,
            ...(sizing.registrationSizingPolicy === undefined ? {} : { sizingPolicy: sizing.registrationSizingPolicy }),
          });
          const keyed = await generateDerivedRegistration(derivedSnapshot);
          record.segmentedMold = {
            groundedPart: spec.partBounds,
            cavity: {
              toolVolumeMm3: cavity.cavityTool.volumeMm3,
              bodies: cavity.bodies.map((b) => ({ ...describeBody(b), parentBodyId: b.parentBodyId, cavityAffected: b.cavityAffected })),
              subtraction: cavity.diagnostics?.subtraction ?? null,
            },
            registration: {
              status: keyed.status,
              reasonCode: keyed.report!.reasonCode,
              message: keyed.report!.message,
              policyId: keyed.report!.tolerancePolicy.policyId,
              interfaceIds: keyed.report!.interfaces.map((i) => i.id),
              featureIds: keyed.report!.features.map((f) => f.id),
              bodies: (keyed.bodies ?? []).map(describeBody),
            },
          };
        }
        record.registration = {
          status: state.status,
          reasonCode: report.reasonCode,
          message: report.message,
          interfaceIds: report.interfaces.map((i) => i.id),
          features: report.features.map((f) => ({ id: f.id, side: f.side, widthMm: f.geometry.widthMm, depthMm: f.geometry.depthMm, lengthMm: f.geometry.lengthMm, startPoint: f.startPoint, endPoint: f.endPoint })),
          attempts: report.attempts,
          policyId: report.tolerancePolicy.policyId,
          maximumFeatureRadiusMm: report.tolerancePolicy.maximumFeatureRadiusMm,
          bodies: (state.bodies ?? []).map(describeBody),
        };
      }
    }
  }
  return record;
}

it("writes the segmentation reference fixtures", async () => {
  const results = [];
  for (const spec of cases) results.push(await runCase(spec));
  const document = {
    schema: "craft.native-segmentation-reference/1",
    generator: "native/tests/reference/craftSegmentationReference.test.ts",
    reference: "mold/frontend segmentation domain + manifold-3d plane executor",
    cases: results,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document)}\n`, "utf8");
  expect(results.length).toBe(cases.length);
}, 300_000);
