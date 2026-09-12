import { describe, expect, it, vi } from "vitest";

import type { MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";
import type { MasterMoldWorkerRequest, MasterMoldWorkerResponse } from "./masterMoldGeneration.worker.contracts";
import { createMasterMoldWorkerRunner, type MasterMoldWorkerFactory } from "./masterMoldGeneration.workerClient";

function createFakeWorker() {
  return {
    onmessage: null as ((event: MessageEvent<MasterMoldWorkerResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent<unknown>) => void) | null,
    postMessage: vi.fn<(message: MasterMoldWorkerRequest) => void>(),
    terminate: vi.fn(),
  };
}

function createRequest(overrides: Partial<MasterMoldRequest> = {}): MasterMoldRequest {
  return {
    operationId: "operation-1",
    generationVersion: 3,
    parameters: { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 },
    targets: [],
    ...overrides,
  };
}

function createResult(request: MasterMoldRequest): MasterMoldResult {
  return { operationId: request.operationId, generationVersion: request.generationVersion, elapsedMs: 10, bodies: [] };
}

function createHarness() {
  const worker = createFakeWorker();
  const factory: MasterMoldWorkerFactory = () => worker;
  return { worker, run: createMasterMoldWorkerRunner(factory) };
}

function emitResponse(worker: ReturnType<typeof createFakeWorker>, response: MasterMoldWorkerResponse) {
  worker.onmessage?.(new MessageEvent<MasterMoldWorkerResponse>("message", { data: response }));
}

describe("createMasterMoldWorkerRunner", () => {
  it("posts a serializable request and resolves a successful response", async () => {
    const request = createRequest();
    const result = createResult(request);
    const { run, worker } = createHarness();

    const pending = run(request);

    expect(worker.postMessage).toHaveBeenCalledWith({ type: "generate", requestId: "operation-1:3", request });

    emitResponse(worker, { type: "success", requestId: "operation-1:3", result });

    await expect(pending).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects Worker failures and terminates the Worker", async () => {
    const request = createRequest();
    const { run, worker } = createHarness();

    const pending = run(request);
    emitResponse(worker, { type: "failure", requestId: "operation-1:3", failure: { code: "boolean_failed", message: "Boolean subtraction failed." } });

    await expect(pending).rejects.toThrow("Boolean subtraction failed.");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("ignores responses belonging to a different request", async () => {
    const request = createRequest();
    const result = createResult(request);
    const { run, worker } = createHarness();

    const pending = run(request);
    emitResponse(worker, { type: "success", requestId: "another-request", result });
    expect(worker.terminate).not.toHaveBeenCalled();

    emitResponse(worker, { type: "success", requestId: "operation-1:3", result });
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("reports progress only for the active request", async () => {
    const request = createRequest();
    const result = createResult(request);
    const { run, worker } = createHarness();
    const onProgress = vi.fn();

    const pending = run(request, { onProgress });
    emitResponse(worker, { type: "progress", requestId: "stale", completed: 1, total: 2 });
    emitResponse(worker, { type: "progress", requestId: "operation-1:3", completed: 1, total: 3 });
    emitResponse(worker, { type: "success", requestId: "operation-1:3", result });

    await pending;
    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(1, 3);
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
    expect(first.postMessage).toHaveBeenCalledWith({ type: "cancel", requestId: "operation-1:3" });
    expect(first.terminate).toHaveBeenCalledTimes(1);

    emitResponse(second, { type: "success", requestId: "operation-2:4", result });
    await expect(secondPending).resolves.toEqual(result);
    expect(second.terminate).toHaveBeenCalledTimes(1);
  });
});
