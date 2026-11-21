/**
 * Segmentation source-snapshot reference fixture generator for the native migration (protected-region merge).
 *
 * NOT a frontend test: it drives the real `readCurrentSegmentationSourceSnapshot` (segmentationSourceSnapshot.ts) through the real
 * split-face and model-bounds stores, with committed final mold results of different shapes (cavity, sprues, registration features,
 * the same or a different block, stale, invalid), and records what the reference decides: the source status, the merged protected
 * regions (ids, kinds, bodies, bounds, clearances), the evidence, the warnings and the identity. The inputs are recorded with the
 * outputs, in native/tests/fixtures/reference/segmentation-source-reference.json. native/tests/tst_segmentation_source_equivalence.cpp
 * replays them natively.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import { readCurrentSegmentationSourceSnapshot } from "@/features/mold-generation/segmentation/application/segmentationSourceSnapshot";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.CRAFT_SEGMENTATION_SOURCE_OUTPUT ?? resolve(here, "../fixtures/reference/segmentation-source-reference.json");

type V3 = [number, number, number];
interface Box { min: V3; max: V3 }
const bounds = (b: Box) => ({ min: { x: b.min[0], y: b.min[1], z: b.min[2] }, max: { x: b.max[0], y: b.max[1], z: b.max[2] } });
const point = (p: V3) => ({ x: p[0], y: p[1], z: p[2] });

interface SprueSpec { operationId: string; targetBodyIds: string[]; position: V3; inwardDirection: V3; depthMm: number; mainDiameterMm: number; surfaceToleranceMm: number }
interface FeatureSpec { id: string; status: string; femaleBodyId: string; maleBodyId: string; widthMm: number; depthMm: number; clearanceMm: number; start: V3; end: V3 }
interface CommittedSpec {
  bodies: { id: string; bounds: Box; watertight?: boolean; empty?: boolean }[];
  cavity?: { sourceSignature: string; bounds: Box; clearanceMm: number };
  sprues?: SprueSpec[];
  features?: FeatureSpec[];
  /** The definition's block and selection box: "preliminary" copies the automatic frame's, "other" shifts the block, "otherSelection" shifts K1. */
  frame: "preliminary" | "other" | "otherSelection";
  stale?: "revision" | "fingerprint" | "evaluating" | "evaluationStale";
}
interface CaseSpec {
  name: string;
  partBounds: Box;
  clearanceMm: number;
  committed?: CommittedSpec;
}

const PART: Box = { min: [0, 0, 0], max: [250, 50, 50] };
const BODIES = [
  { id: "body-b", bounds: { min: [-100, -100, 0], max: [350, 150, 125] } as Box },
  { id: "body-a", bounds: { min: [-100, -100, 125], max: [350, 150, 250] } as Box },
];
const FULL: Omit<CommittedSpec, "frame"> = {
  bodies: BODIES,
  cavity: { sourceSignature: "cavity-sig-1", bounds: { min: [0, 0, 100], max: [250, 50, 150] }, clearanceMm: 0.4 },
  sprues: [
    { operationId: "sprue-2", targetBodyIds: ["body-b", "body-a"], position: [125, 25, 250], inwardDirection: [0, 0, -1], depthMm: 80, mainDiameterMm: 8, surfaceToleranceMm: 0.05 },
    { operationId: "sprue-1", targetBodyIds: ["body-a"], position: [40, 25, 250], inwardDirection: [0, 0, -1], depthMm: 60, mainDiameterMm: 6, surfaceToleranceMm: 0.1 },
  ],
  features: [
    { id: "reg-z", status: "generated", femaleBodyId: "body-b", maleBodyId: "body-a", widthMm: 6, depthMm: 3, clearanceMm: 0.2, start: [10, 10, 125], end: [10, 10, 131] },
    { id: "reg-a", status: "generated", femaleBodyId: "body-a", maleBodyId: "body-b", widthMm: 10, depthMm: 2, clearanceMm: 0.5, start: [200, 30, 125], end: [210, 30, 125] },
    { id: "reg-skipped", status: "failed", femaleBodyId: "body-a", maleBodyId: "body-b", widthMm: 6, depthMm: 3, clearanceMm: 0.2, start: [100, 10, 125], end: [100, 10, 131] },
  ],
};

const cases: CaseSpec[] = [
  { name: "no committed result: the automatic whole-block source", partBounds: PART, clearanceMm: 100 },
  { name: "cavity, two sprues and two registration features on the same block are merged (advisory)", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "preliminary" } },
  { name: "a cavity alone is merged", partBounds: PART, clearanceMm: 100, committed: { bodies: BODIES, cavity: FULL.cavity, frame: "preliminary" } },
  { name: "sprues alone are merged and ordered by id", partBounds: PART, clearanceMm: 100, committed: { bodies: BODIES, sprues: FULL.sprues, frame: "preliminary" } },
  { name: "only generated registration features count", partBounds: PART, clearanceMm: 100, committed: { bodies: BODIES, features: FULL.features, frame: "preliminary" } },
  { name: "a committed result with nothing to protect leaves the automatic source unchanged", partBounds: PART, clearanceMm: 100, committed: { bodies: BODIES, frame: "preliminary" } },
  { name: "regions on another block are not projected onto the automatic one", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "other" } },
  { name: "regions on another selection box are not projected either", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "otherSelection" } },
  { name: "a committed result from an older document revision blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "preliminary", stale: "revision" } },
  { name: "a committed result with another fingerprint blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "preliminary", stale: "fingerprint" } },
  { name: "a mold still being evaluated blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "preliminary", stale: "evaluating" } },
  { name: "a stale evaluation blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, frame: "preliminary", stale: "evaluationStale" } },
  { name: "a committed result without bodies blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, bodies: [], frame: "preliminary" } },
  { name: "a body that is not watertight blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, bodies: [{ ...BODIES[0]!, watertight: false }, BODIES[1]!], frame: "preliminary" } },
  { name: "a body without geometry blocks planning", partBounds: PART, clearanceMm: 100, committed: { ...FULL, bodies: [{ ...BODIES[0]!, empty: true }, BODIES[1]!], frame: "preliminary" } },
];

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function bodyData(spec: { id: string; bounds: Box; watertight?: boolean; empty?: boolean }) {
  return {
    id: spec.id, name: spec.id, visible: true, bounds: bounds(spec.bounds), triangleCount: 1, volumeMm3: 1000,
    watertight: spec.watertight ?? true,
    mesh: spec.empty === true ? { positions: [], indices: [] } : { positions: [0, 0, 0, 1, 0, 0, 0, 1, 1], indices: [0, 1, 2] },
  };
}

function committedState(spec: CommittedSpec, preliminary: { definitionId: string; block: ReturnType<typeof bounds>; selection: ReturnType<typeof bounds>; partOffset: unknown }) {
  const shift = (b: ReturnType<typeof bounds>, dx: number) => ({ min: { ...b.min, x: b.min.x + dx }, max: { ...b.max, x: b.max.x + dx } });
  const block = spec.frame === "other" ? shift(preliminary.block, 7) : preliminary.block;
  const selection = spec.frame === "otherSelection" ? shift(preliminary.selection, 3) : preliminary.selection;
  const bodies = spec.bodies.map(bodyData);
  const definition = {
    schemaVersion: 1, definitionId: "committed-definition", modelId: "model-a",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: selection,
    referenceMoldBlock: { clearanceMm: 100, bounds: block },
    moldFrame: {
      frameId: "committed-frame", version: 1, units: "millimeters", upAxis: "Z", partOffset: preliminary.partOffset,
      semanticFaces: {
        front: { axis: "y", direction: 1 }, back: { axis: "y", direction: -1 }, left: { axis: "x", direction: -1 },
        right: { axis: "x", direction: 1 }, top: { axis: "z", direction: 1 }, bottom: { axis: "z", direction: -1 },
      },
    },
    usedFaces: ["front"], moldBodies: bodies,
  };
  const revision = 4;
  const fingerprint = "fingerprint-4";
  const result = {
    sourceRevision: spec.stale === "revision" ? 3 : revision,
    sourceFingerprint: spec.stale === "fingerprint" ? "fingerprint-other" : fingerprint,
    requestId: "mold-eval:4",
    bodies, keyed: false,
    stages: {
      baseBodies: bodies,
      cavityResult: spec.cavity === undefined ? null : { sourceSignature: spec.cavity.sourceSignature, cavityTool: { bounds: bounds(spec.cavity.bounds), clearanceMm: spec.cavity.clearanceMm } },
      sprueBodies: [],
      resolvedSprues: (spec.sprues ?? []).map((s) => ({
        operationId: s.operationId, targetBodyIds: s.targetBodyIds, position: point(s.position), inwardDirection: point(s.inwardDirection),
        depthMm: s.depthMm, profile: { mainDiameterMm: s.mainDiameterMm }, tolerancePolicy: { surfaceToleranceMm: s.surfaceToleranceMm },
      })),
      registration: spec.features === undefined
        ? { status: "unavailable", revision: "", bodies: [], report: null }
        : {
            status: "generated", revision: "r", bodies: [],
            report: {
              features: spec.features.map((f) => ({
                id: f.id, status: f.status, femaleBodyId: f.femaleBodyId, maleBodyId: f.maleBodyId,
                geometry: { widthMm: f.widthMm, depthMm: f.depthMm }, clearanceMm: f.clearanceMm, startPoint: point(f.start), endPoint: point(f.end),
              })),
            },
          },
    },
    warnings: [],
  };
  return {
    document: { schemaVersion: 1, revision, fingerprint, definition, cuttingPlanes: [], cavityEnabled: true, cavityClearanceMm: 0, sprues: [], registrationPolicyId: "default", manufacturingProfile: null },
    definition,
    evaluation: {
      phase: spec.stale === "evaluating" ? "evaluating" : spec.stale === "evaluationStale" ? "stale" : "complete",
      requestId: "mold-eval:4", sourceRevision: revision, sourceFingerprint: fingerprint, stage: "validation", progress: 1, failure: null,
    },
    lastCommittedResult: result,
  };
}

function describeRegion(r: unknown) { return json(r); }

function runCase(spec: CaseSpec, preliminary: Parameters<typeof committedState>[1]) {
  useSplitFaceStore.getState().clearForModelReplacement();
  useModelBoundsStore.setState({ groundedWorldBounds: { ...bounds(spec.partBounds), size: { x: spec.partBounds.max[0] - spec.partBounds.min[0], y: spec.partBounds.max[1] - spec.partBounds.min[1], z: spec.partBounds.max[2] - spec.partBounds.min[2] } } } as never);
  useSplitFaceStore.setState({ clearanceMm: spec.clearanceMm } as never);
  if (spec.committed !== undefined) useSplitFaceStore.setState(committedState(spec.committed, preliminary) as never);
  const result = readCurrentSegmentationSourceSnapshot();
  const record: Record<string, unknown> = { name: spec.name, input: json(spec), status: result.status };
  if (result.status !== "ready") {
    record.reasonCode = result.reasonCode;
    record.issues = result.issues.map((i) => ({ severity: i.severity, reasonCode: i.reasonCode, message: i.message }));
    return record;
  }
  const { snapshot, definition } = result;
  record.identity = snapshot.identity;
  record.aggregateBounds = snapshot.aggregateBounds;
  record.bodies = snapshot.bodies.map((b) => ({ id: b.id, bounds: b.bounds, triangleCount: b.triangleCount, volumeMm3: b.volumeMm3 }));
  record.protectedRegions = snapshot.protectedRegions.map(describeRegion);
  record.protectedRegionEvidence = snapshot.protectedRegionEvidence;
  record.warnings = snapshot.warnings.map((w) => ({ severity: w.severity, reasonCode: w.reasonCode, message: w.message }));
  record.definition = {
    definitionId: definition.definitionId, modelId: definition.modelId, clearanceMm: definition.referenceMoldBlock.clearanceMm,
    selectionBoxBounds: definition.selectionBoxBounds, referenceMoldBlockBounds: definition.referenceMoldBlock.bounds, partOffset: definition.moldFrame?.partOffset,
  };
  return record;
}

it("writes the segmentation source-snapshot reference fixtures", () => {
  // The automatic frame the committed definitions are built on (or deliberately moved off).
  useSplitFaceStore.getState().clearForModelReplacement();
  useModelBoundsStore.setState({ groundedWorldBounds: { ...bounds(PART), size: { x: 250, y: 50, z: 50 } } } as never);
  useSplitFaceStore.setState({ clearanceMm: 100 } as never);
  const base = readCurrentSegmentationSourceSnapshot();
  if (base.status !== "ready") throw new Error("the automatic source is not ready");
  const preliminary = {
    definitionId: base.definition.definitionId,
    block: json(base.definition.referenceMoldBlock.bounds),
    selection: json(base.definition.selectionBoxBounds),
    partOffset: json(base.definition.moldFrame?.partOffset),
  };
  const results = cases.map((spec) => runCase(spec, preliminary));
  const document = {
    schema: "craft.native-segmentation-source-reference/1",
    generator: "native/tests/reference/craftSegmentationSourceReference.test.ts",
    reference: "mold/frontend readCurrentSegmentationSourceSnapshot with the real split-face and model-bounds stores",
    cases: results,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document)}\n`, "utf8");
  expect(results.length).toBe(cases.length);
});
