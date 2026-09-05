import type {
  DerivedMoldEvaluationInput,
  DerivedMoldEvaluationResult,
  DerivedMoldWorkerRequest,
  DerivedMoldWorkerResponse,
} from "./derivedMoldEvaluation.contracts";
import {
  createDerivedMoldEvaluationRunner,
  type DerivedMoldWorkerFactory,
} from "./derivedMoldEvaluation.workerClient";

function createFakeWorker() {
  return {
    onmessage: null as ((event: MessageEvent<DerivedMoldWorkerResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn<(message: DerivedMoldWorkerRequest) => void>(),
    terminate: vi.fn(),
  };
}

function createInput(requestId = "request-1"): DerivedMoldEvaluationInput {
  return {
    requestId, sourceRevision: 1, sourceFingerprint: "fingerprint-1",
    cavityResult: null,
    definition: { schemaVersion: 1, definitionId: "model:0:0", modelId: "model", coordinateSystem: { units: "millimeters", upAxis: "Z" }, selectionBoxBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, referenceMoldBlock: { clearanceMm: 1, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }, usedFaces: [], selectedFaceIds: [] },
    cuttingPlanes: [],
    sprueDefinitions: [],
  };
}

function createResult(requestId: string): DerivedMoldEvaluationResult {
  return {
    requestId, sourceRevision: 1, sourceFingerprint: "fingerprint-1",
    sprueBodies: [], sprueDefinitions: [], resolvedSprues: [],
    registration: { status: "unavailable", revision: null, bodies: null, report: null },
    warnings: [],
  };
}

function emitResponse(worker: ReturnType<typeof createFakeWorker>, response: DerivedMoldWorkerResponse) {
  worker.onmessage?.(new MessageEvent<DerivedMoldWorkerResponse>("message", { data: response }));
}

function createHarness() {
  const workers: ReturnType<typeof createFakeWorker>[] = [];
  const factory: DerivedMoldWorkerFactory = () => { const worker = createFakeWorker(); workers.push(worker); return worker; };
  return { workers, run: createDerivedMoldEvaluationRunner(factory) };
}

it("creates the Worker lazily and reuses the same instance across evaluations instead of respawning it", async () => {
  const { run, workers } = createHarness();
  const first = run(createInput("request-1"));
  expect(workers).toHaveLength(1);
  emitResponse(workers[0]!, { type: "success", requestId: "request-1", result: createResult("request-1") });
  await expect(first).resolves.toMatchObject({ requestId: "request-1" });

  const second = run(createInput("request-2"));
  expect(workers).toHaveLength(1);
  emitResponse(workers[0]!, { type: "success", requestId: "request-2", result: createResult("request-2") });
  await expect(second).resolves.toMatchObject({ requestId: "request-2" });
  expect(workers[0]!.terminate).not.toHaveBeenCalled();
});

it("cancels the previous evaluation via a message instead of terminating the shared Worker", async () => {
  const { run, workers } = createHarness();
  const first = run(createInput("request-1"));
  const second = run(createInput("request-2"));
  await expect(first).rejects.toMatchObject({ code: "evaluation_cancelled" });
  expect(workers).toHaveLength(1);
  expect(workers[0]!.postMessage).toHaveBeenCalledWith({ type: "cancel", requestId: "request-1" });
  expect(workers[0]!.terminate).not.toHaveBeenCalled();
  emitResponse(workers[0]!, { type: "success", requestId: "request-2", result: createResult("request-2") });
  await expect(second).resolves.toMatchObject({ requestId: "request-2" });
});

it("ignores a response belonging to a different (already superseded) request", async () => {
  const { run, workers } = createHarness();
  const pending = run(createInput("request-1"));
  emitResponse(workers[0]!, { type: "success", requestId: "stale-request", result: createResult("stale-request") });
  emitResponse(workers[0]!, { type: "success", requestId: "request-1", result: createResult("request-1") });
  await expect(pending).resolves.toMatchObject({ requestId: "request-1" });
});

it("reports progress only for the active request", async () => {
  const { run, workers } = createHarness();
  const onProgress = vi.fn();
  const pending = run(createInput("request-1"), onProgress);
  emitResponse(workers[0]!, { type: "progress", requestId: "stale", stage: "sprues", progress: 0.2 });
  emitResponse(workers[0]!, { type: "progress", requestId: "request-1", stage: "registration", progress: 0.6 });
  emitResponse(workers[0]!, { type: "success", requestId: "request-1", result: createResult("request-1") });
  await pending;
  expect(onProgress).toHaveBeenCalledOnce();
  expect(onProgress).toHaveBeenCalledWith("registration", 0.6);
});

it("rejects on Worker failure responses without terminating the shared Worker", async () => {
  const { run, workers } = createHarness();
  const pending = run(createInput("request-1"));
  emitResponse(workers[0]!, { type: "failure", requestId: "request-1", reasonCode: "derived_evaluation_failed", message: "Boolean failed." });
  await expect(pending).rejects.toThrow("Boolean failed.");
  expect(workers[0]!.terminate).not.toHaveBeenCalled();
});
