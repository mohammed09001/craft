import { createSplitFaceStoreCreator, type SplitFaceState, type SplitFaceStoreDeps } from "./splitFace.store";
import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import type { CavityGenerationInput } from "../cavity-generation/cavityGeneration.contracts";
import { generateCavityBodies } from "../cavity-generation/cavityBody.generator";
import { createCavityTool } from "../cavity-generation/manifold.engine";
import { validateAndPreparePartSolid } from "../cavity-generation/partSolid.validator";
import { designSprueProfile } from "../sprue-generation";
import type { SprueDefinition } from "../sprue-generation/sprueGeneration.contracts";
import type { DerivedMoldEvaluationInput, DerivedMoldEvaluationResult } from "../workflow/derivedMoldEvaluation.contracts";
import { cancelDerivedMoldEvaluation as cancelDerivedMoldEvaluationProduction, runDerivedMoldEvaluation as runDerivedMoldEvaluationProduction } from "../workflow";
import { createStore, type StoreApi } from "zustand/vanilla";

// Structural performance proof (Execution 09 §40-41). Every assertion is a
// deterministic count -- the strong regression contract -- not wall clock,
// which the report captures as an isolated measurement.

const runDerivedMoldEvaluation = vi.fn(runDerivedMoldEvaluationProduction);
const cancelDerivedMoldEvaluation = vi.fn(cancelDerivedMoldEvaluationProduction);
const runCavityGenerationInWorker = Object.assign(vi.fn(async (input: CavityGenerationInput) => {
  const validation = validateAndPreparePartSolid(input);
  if (!validation.ok || validation.prepared === null) throw new Error(validation.blockers[0]?.message ?? "Uploaded model is not a subtractable solid.");
  const tool = await createCavityTool(validation.prepared, input.cavityClearanceMm, input.qualityMode, input.geometryToleranceMm);
  return { result: await generateCavityBodies(input, tool), validationWarnings: validation.warnings };
}), { cancel: vi.fn() }) as SplitFaceStoreDeps["runCavityGenerationInWorker"];
const cancelActiveCavityGeneration = vi.fn();

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
let useSplitFaceStore: StoreApi<SplitFaceState>;
const profileDesign = designSprueProfile(null);
const placement = (x = 5) => ({ status: "valid" as const, topPoint: { x, y: 5, z: 30 }, cavityPoint: { x, y: 5, z: 20 }, inwardDirection: { x: 0, y: 0, z: -1 }, stemLengthMm: 10, profileDesign, coordinateSpace: "mold-local" as const });

async function prepareSprueState() {
  const canonicalPartGeometry = canonicalCube("m", k1);
  const s = useSplitFaceStore.getState();
  s.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  s.enterSelection();
  s.toggleFace("front");
  expect(await useSplitFaceStore.getState().createMoldParts("m", k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
}

async function prepareResolvedSprue(x = 5): Promise<SprueDefinition> {
  await prepareSprueState();
  expect(await useSplitFaceStore.getState().createSprue(placement(x))).toBe(true);
  await vi.waitFor(() => expect(useSplitFaceStore.getState().sprues.length).toBeGreaterThan(0));
  const [resolved] = useSplitFaceStore.getState().sprues;
  expect(resolved).toBeDefined();
  return resolved!;
}

const derivedOk = (input: DerivedMoldEvaluationInput): DerivedMoldEvaluationResult => ({
  requestId: input.requestId,
  sourceRevision: input.sourceRevision,
  sourceFingerprint: input.sourceFingerprint,
  sprueBodies: [],
  sprueDefinitions: input.sprueDefinitions.map((definition) => ({ ...definition, validation: { status: "resolved" as const, reasonCode: null, message: null } })),
  resolvedSprues: input.sprueDefinitions.map((definition) => ({
    operationId: definition.operationId,
    targetBodyIds: [],
    position: definition.anchor.position,
    inwardDirection: definition.inwardDirection,
    profile: definition.profileDesign.profile,
    depthMm: 10,
    circularSegments: 32,
    coordinateSpace: "mold-local" as const,
    moldFrameId: "m:z-up",
    tolerancePolicy: { linearToleranceMm: 0.01, areaToleranceMm2: 0.01, volumeToleranceMm3: 0.01, meaningfulVolumeMm3: 0.01, surfaceToleranceMm: 0.01, outsideMarginMm: 0, beyondMarginMm: 0 },
  })),
  registration: { status: "generated", revision: input.sourceFingerprint, bodies: [], report: null },
  warnings: [],
});

function controlledEvaluation() {
  const baseline = runDerivedMoldEvaluation.mock.calls.length;
  const pending: Array<{ input: DerivedMoldEvaluationInput; resolve: (result: DerivedMoldEvaluationResult) => void; reject: (error: unknown) => void }> = [];
  runDerivedMoldEvaluation.mockImplementation((input: DerivedMoldEvaluationInput) => new Promise<DerivedMoldEvaluationResult>((resolve, reject) => { pending.push({ input, resolve, reject }); }));
  return {
    pending,
    calls: () => runDerivedMoldEvaluation.mock.calls.slice(baseline).map((call) => call[0] as DerivedMoldEvaluationInput),
    resolve: () => { const next = pending.pop(); if (next) next.resolve(derivedOk(next.input)); },
    reject: (error: unknown) => { const next = pending.pop(); if (next) next.reject(error); },
  };
}

beforeEach(() => {
  useSplitFaceStore = createStore(createSplitFaceStoreCreator({ runDerivedMoldEvaluation, cancelDerivedMoldEvaluation, runCavityGenerationInWorker, cancelActiveCavityGeneration }));
});
afterEach(() => {
  vi.restoreAllMocks();
  runDerivedMoldEvaluation.mockClear();
  runDerivedMoldEvaluation.mockImplementation(runDerivedMoldEvaluationProduction);
  cancelDerivedMoldEvaluation.mockClear();
});

describe("Sprue performance structural bounds", () => {
  it("N rapid resize intents during one active evaluation run at most 2 evaluations and 1 history entry", async () => {
    const resolved = await prepareResolvedSprue();
    const historyLength = useSplitFaceStore.getState().undoStack.length;
    const control = controlledEvaluation();

    const action = useSplitFaceStore.getState().createSprue(placement(2));
    await vi.waitFor(() => expect(control.calls()).toHaveLength(1));
    const base = 2.5;
    for (let i = 0; i < 100; i += 1) {
      expect(await useSplitFaceStore.getState().resizeSprue(resolved.operationId, base + 0.05 * (i + 1))).toBe(true);
    }
    // The active request remains the only dispatch so far.
    expect(control.calls()).toHaveLength(1);

    control.resolve();
    await vi.waitFor(() => expect(control.calls()).toHaveLength(2));
    // At most 2 evaluations total: the active one + the final latest pending.
    expect(control.calls().length).toBeLessThanOrEqual(2);

    control.resolve();
    await vi.waitFor(() => expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
    expect(await action).toBe(true);
    // The 99 superseded intents created 0 history entries; the burst = 1.
    expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength + 1);
  });

  it("many clicks/resizes coalesce to exactly one latest pending snapshot (no intermediate commits)", async () => {
    const resolved = await prepareResolvedSprue();
    const historyLength = useSplitFaceStore.getState().undoStack.length;
    const control = controlledEvaluation();

    const actionA = useSplitFaceStore.getState().createSprue(placement(2));
    await vi.waitFor(() => expect(control.calls()).toHaveLength(1));
    const lastTarget = resolved.profile.mainDiameterMm + 0.05 * 100;
    for (let i = 0; i < 100; i += 1) {
      useSplitFaceStore.getState().resizeSprue(resolved.operationId, resolved.profile.mainDiameterMm + 0.05 * (i + 1));
    }
    // No additional dispatch began: all coalesced into the single pending slot.
    expect(control.calls()).toHaveLength(1);
    const lastRequested = useSplitFaceStore.getState().sprueDefinitions[0]!.profileDesign.profile.mainDiameterMm;
    expect(lastRequested).toBe(lastTarget);

    control.resolve();
    await vi.waitFor(() => expect(control.calls()).toHaveLength(2));
    // The single pending dispatch carries the final snapshot.
    expect(control.calls()[1]!.sprueDefinitions[0]!.profileDesign.profile.mainDiameterMm).toBe(lastTarget);

    control.resolve();
    await vi.waitFor(() => expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
    expect(await actionA).toBe(true);
    expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(lastTarget);
    expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength + 1);
  });

  it("3-sprues in flight still accept and complete with a single authoritative commit", async () => {
    const resolved = await prepareResolvedSprue();
    const historyLength = useSplitFaceStore.getState().undoStack.length;
    const control = controlledEvaluation();

    const a1 = useSplitFaceStore.getState().resizeSprue(resolved.operationId, resolved.profile.mainDiameterMm + 0.5);
    await vi.waitFor(() => expect(control.calls()).toHaveLength(1));
    const a2 = useSplitFaceStore.getState().resizeSprue(resolved.operationId, resolved.profile.mainDiameterMm + 1);
    const a3 = useSplitFaceStore.getState().resizeSprue(resolved.operationId, resolved.profile.mainDiameterMm + 1.5);
    expect(await a2).toBe(true);
    expect(await a3).toBe(true);

    control.resolve();
    await vi.waitFor(() => expect(control.calls()).toHaveLength(2));
    control.resolve();
    await vi.waitFor(() => expect(useSplitFaceStore.getState().sprueStatus).toBe("idle"));
    expect(await a1).toBe(true);
    expect(useSplitFaceStore.getState().sprues[0]!.profile.mainDiameterMm).toBe(resolved.profile.mainDiameterMm + 1.5);
    // The 2 superseded intents created 0 history entries.
    expect(useSplitFaceStore.getState().undoStack).toHaveLength(historyLength + 1);
  });
});
