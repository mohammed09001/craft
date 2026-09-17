import { describe, expect, it, vi } from "vitest";

import type { MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";
import type { MasterMoldWorkerRequest, MasterMoldWorkerResponse } from "./masterMoldGeneration.worker.contracts";
import { buildWorkerSeedPayload, createMasterMoldWorkerRunner, type MasterMoldWorkerFactory } from "./masterMoldGeneration.workerClient";
import { GENERIC_RIGID_CAST_PROFILE } from "./engine/contracts";
import { DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES } from "./seed/masterMoldSeed";

function createFakeWorker() {
  return {
    onmessage: null as ((event: MessageEvent<MasterMoldWorkerResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent<unknown>) => void) | null,
    postMessage: vi.fn<(message: MasterMoldWorkerRequest, transfer?: Transferable[]) => void>(),
    terminate: vi.fn(),
  };
}

function createRequest(overrides: Partial<MasterMoldRequest> = {}): MasterMoldRequest {
  return {
    operationId: "operation-1",
    generationVersion: 3,
    seed: {
      schemaVersion: 1,
      seedId: "seed-1",
      sourceModelId: "m",
      sourceGeometryVersion: "geo-1",
      sourceMesh: {
        modelId: "m",
        positions: [1, 2, 3, 4, 5, 6],
        indices: [0, 1, 0],
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
        geometryVersion: "geo-1",
      },
      sourceTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      sourceBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      printerBuildVolume: { x: 10, y: 10, z: 10 },
      processProfile: GENERIC_RIGID_CAST_PROFILE,
      userPreferences: DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES,
      sourceProjectRevision: "rev-1",
    },
    priorSets: [],
    ...overrides,
  };
}

function createResult(request: MasterMoldRequest): MasterMoldResult {
  return {
    operationId: request.operationId,
    generationVersion: request.generationVersion,
    elapsedMs: 10,
    sets: [],
    plan: null,
    workingMoldPieceCount: 0,
    warningCount: 0,
    budget: { candidateDirectionCount: 0, planningPatchCount: 0, workingMoldPlanCandidateCount: 0, workingMoldConstructionAttempts: 0, pourFaceAnalysisAttempts: 0, ventAnalysisAttempts: 0, toolingOnePieceAttempts: 0, toolingMultiPieceAttempts: 0, toolingExactPlanAttempts: 0, releaseVerificationAttempts: 0, limitsExceeded: [] },
    seedId: request.seed.seedId,
  };
}

function createHarness() {
  const worker = createFakeWorker();
  const factory: MasterMoldWorkerFactory = () => worker;
  return { worker, run: createMasterMoldWorkerRunner(factory) };
}

function emitResponse(worker: ReturnType<typeof createFakeWorker>, response: MasterMoldWorkerResponse) {
  worker.onmessage?.(new MessageEvent<MasterMoldWorkerResponse>("message", { data: response }));
}

describe("createMasterMoldWorkerRunner (Execution 06 Article 13)", () => {
  it("posts a compact seed payload with typed-array transfer ownership", async () => {
    const request = createRequest();
    const result = createResult(request);
    const { run, worker } = createHarness();

    const pending = run(request);

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    const [message, transfer] = worker.postMessage.mock.calls[0]!;
    expect(message.type).toBe("generate");
    if (message.type !== "generate") return;
    expect(message.requestId).toBe("operation-1:3");
    expect(message.seed.positions).toBeInstanceOf(Float32Array);
    expect(message.seed.indices).toBeInstanceOf(Uint32Array);
    expect(transfer).toContain(message.seed.positions.buffer);
    expect(transfer).toContain(message.seed.indices.buffer);
    // Nothing from the Split Face / Cavity domains rides along.
    const serialized = JSON.stringify(message, (_key, value) => (value instanceof Float32Array || value instanceof Uint32Array ? "typed" : value));
    expect(serialized).not.toContain("cuttingPlanes");
    expect(serialized).not.toContain("committedMoldParts");
    expect(serialized).not.toContain("moldDefinition");

    emitResponse(worker, { type: "success", requestId: "operation-1:3", result });
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("buildWorkerSeedPayload copies typed arrays without retaining the source arrays", () => {
    const request = createRequest();
    const { payload, transfer } = buildWorkerSeedPayload(request);
    expect(payload.positions).toBeInstanceOf(Float32Array);
    expect(Array.from(payload.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(payload.bounds).toEqual(request.seed.sourceBounds);
    expect(transfer).toHaveLength(2);
  });

  it("rejects Worker failures and terminates the Worker", async () => {
    const request = createRequest();
    const { run, worker } = createHarness();

    const pending = run(request);
    emitResponse(worker, { type: "failure", requestId: "operation-1:3", failure: { code: "boolean_failed", message: "Boolean subtraction failed." } });

    await expect(pending).rejects.toThrow("Boolean subtraction failed.");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("reports named-stage progress only for the active request", async () => {
    const request = createRequest();
    const result = createResult(request);
    const { run, worker } = createHarness();
    const onStage = vi.fn();

    const pending = run(request, { onStage });
    emitResponse(worker, {
      type: "progress",
      requestId: "stale",
      stage: { stage: "analyzing_geometry", stageIndex: 0, stageCount: 7, detail: null, elapsedMs: 1 },
    });
    emitResponse(worker, {
      type: "progress",
      requestId: "operation-1:3",
      stage: { stage: "building_accessibility", stageIndex: 1, stageCount: 7, detail: "16 patches", elapsedMs: 5 },
    });
    emitResponse(worker, { type: "success", requestId: "operation-1:3", result });

    await pending;
    expect(onStage).toHaveBeenCalledOnce();
    expect(onStage).toHaveBeenCalledWith(expect.objectContaining({ stage: "building_accessibility", stageCount: 7 }));
  });

  it("uses the configured timeout in the structured failure and terminates once", async () => {
    const request = createRequest();
    const worker = createFakeWorker();
    const run = createMasterMoldWorkerRunner(() => worker, 5);

    await expect(run(request)).rejects.toMatchObject({ code: "master_mold_timeout", message: expect.stringContaining("5 ms") });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("cancels and terminates the previous Worker when a newer generation starts", async () => {
    const request = createRequest();
    const first = createFakeWorker();
    const second = createFakeWorker();
    const workers = [first, second];
    const run = createMasterMoldWorkerRunner(() => workers.shift()!);

    const firstPending = run(request);
    const secondRequest = createRequest({ operationId: "operation-2", generationVersion: 4 });
    const secondPending = run(secondRequest);
    const result = createResult(secondRequest);

    await expect(firstPending).rejects.toMatchObject({ code: "cancelled" });
    const cancelCall = first.postMessage.mock.calls.find(([message]) => message.type === "cancel");
    expect(cancelCall).toBeDefined();
    if (cancelCall?.[0].type === "cancel") {
      expect(cancelCall[0].requestId).toBe("operation-1:3");
    }
    expect(first.terminate).toHaveBeenCalledTimes(1);

    emitResponse(second, { type: "success", requestId: "operation-2:4", result });
    await expect(secondPending).resolves.toEqual(result);
    expect(second.terminate).toHaveBeenCalledTimes(1);
  });
});
