import {
  createSegmentationExecutionRunner,
  SegmentationExecutionWorkerError,
  type SegmentationExecutionWorkerFactory,
} from "./segmentationExecution.workerClient";
import type { SegmentationExecutionRequest } from "./segmentationExecution.contracts";

function workerFixture() {
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  } as ReturnType<SegmentationExecutionWorkerFactory>;
  return worker;
}

const request = {
  id: "execution",
} as SegmentationExecutionRequest;

describe("segmentation execution worker client", () => {
  it("filters request IDs and cleans up after success", async () => {
    const worker = workerFixture();
    const run = createSegmentationExecutionRunner(() => worker, 1_000);
    const promise = run(request);
    worker.onmessage?.({ data: { type: "success", requestId: "older", result: {} } } as never);
    expect(worker.terminate).not.toHaveBeenCalled();
    const result = { status: "executed" };
    worker.onmessage?.({ data: { type: "success", requestId: request.id, result } } as never);
    await expect(promise).resolves.toBe(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it("cancels the active request and terminates its worker", async () => {
    const worker = workerFixture();
    const run = createSegmentationExecutionRunner(() => worker, 1_000);
    const promise = run(request);
    run.cancel("cancelled by test");
    await expect(promise).rejects.toMatchObject({
      code: "execution_cancelled",
      message: "cancelled by test",
    } satisfies Partial<SegmentationExecutionWorkerError>);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "cancel",
      requestId: request.id,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("times out and cleans up an unresponsive worker", async () => {
    vi.useFakeTimers();
    const worker = workerFixture();
    const run = createSegmentationExecutionRunner(() => worker, 25);
    const promise = run(request);
    const rejection = expect(promise).rejects.toMatchObject({
      code: "worker_timeout",
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    vi.useRealTimers();
  });
});
