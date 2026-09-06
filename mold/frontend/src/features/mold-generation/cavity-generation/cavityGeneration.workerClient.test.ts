import type {
  CavityGenerationInput,
  CavityGenerationResult,
} from "./cavityGeneration.contracts";
import {
  canonicalCube,
  identity,
} from "./cavityGeneration.testFixtures";
import type {
  CavityWorkerRequest,
  CavityWorkerResponse,
} from "./cavityGeneration.worker.contracts";
import {
  createCavityWorkerRunner,
  type CavityWorkerFactory,
} from "./cavityGeneration.workerClient";
import { buildCavityGeometryTolerancePolicy } from "./cavityGeometryTolerance.policy";

function createFakeWorker() {
  return {
    onmessage: null as
      | ((event: MessageEvent<CavityWorkerResponse>) => void)
      | null,
    onerror: null as
      | ((event: ErrorEvent) => void)
      | null,
    onmessageerror: null as
      | ((event: MessageEvent<unknown>) => void)
      | null,
    postMessage: vi.fn<(message: CavityWorkerRequest) => void>(),
    terminate: vi.fn(),
  };
}

function createInput(): CavityGenerationInput {
  const k1Bounds = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 1, y: 1, z: 1 },
  };

  return {
    schemaVersion: 1,
    operationId: "operation-1",
    generationVersion: 3,
    sourcePartMesh: canonicalCube("model-1", k1Bounds),
    coordinateFrame: {
      frameId: "frame-1",
      version: 1,
      units: "millimeters",
      upAxis: "Z",
      origin: { x: 0, y: 0, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 },
      zAxis: { x: 0, y: 0, z: 1 },
      worldFromMold: identity,
      moldFromWorld: identity,
    },
    partBoundingBox: k1Bounds,
    referenceMoldBlockBounds: {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 2, y: 2, z: 2 },
    },
    referenceMoldBlockClearanceMm: 1,
    cuttingPlanes: [],
    moldBodies: [],
    cavityClearanceMm: 0.2,
    geometryToleranceMm: 1e-6,
    tolerancePolicy:buildCavityGeometryTolerancePolicy(k1Bounds,0.2),
    minimumWallMm: 1,
    qualityMode: "standard",
    upstreamInputSignature: "input-1",
  };
}

function createResult(
  input: CavityGenerationInput,
): CavityGenerationResult {
  return {
    operationId: input.operationId,
    generationVersion: input.generationVersion,
    sourceSignature: input.upstreamInputSignature,
    implementation: "manifold-3d-wasm",
    elapsedMs: 10,
    cavityTool: {
      mesh: {
        positions: [],
        indices: [],
      },
      bounds: input.partBoundingBox,
      volumeMm3: 1,
      triangleCount: 0,
      connectedComponentCount: 1,
      watertight: true,
      manifold: true,
      warnings: [],
      clearanceMm: input.cavityClearanceMm,
      implementationMethod: "manifold-minkowski-sphere",
      qualityMode: input.qualityMode,
    },
    bodies: [],
    warnings: [],
    blockers: [],
  };
}

function createHarness() {
  const worker = createFakeWorker();
  const factory: CavityWorkerFactory = () => worker;

  return {
    worker,
    run: createCavityWorkerRunner(factory),
  };
}

function emitResponse(
  worker: ReturnType<typeof createFakeWorker>,
  response: CavityWorkerResponse,
) {
  worker.onmessage?.(
    new MessageEvent<CavityWorkerResponse>("message", {
      data: response,
    }),
  );
}

it("posts a serializable request and resolves a successful response", async () => {
  const input = createInput();
  const result = createResult(input);
  const { run, worker } = createHarness();

  const pending = run(input);

  expect(worker.postMessage).toHaveBeenCalledWith({
    type:"generate",
    requestId: "operation-1:3",
    input,
  });

  emitResponse(worker, {
    type:"success",
    requestId: "operation-1:3",
    result,
    validationWarnings: [],
  });

  await expect(pending).resolves.toEqual({
    result,
    validationWarnings: [],
  });

  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it("rejects Worker failures and terminates the Worker", async () => {
  const input = createInput();
  const { run, worker } = createHarness();

  const pending = run(input);

  emitResponse(worker, {
    type:"failure",
    requestId: "operation-1:3",
    failure:{code:"cavity_boolean_failed",stage:"boolean",message:"Boolean subtraction failed."},
  });

  await expect(pending).rejects.toThrow(
    "Boolean subtraction failed.",
  );

  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it("ignores responses belonging to a different request", async () => {
  const input = createInput();
  const result = createResult(input);
  const { run, worker } = createHarness();

  const pending = run(input);

  emitResponse(worker, {
    type:"success",
    requestId: "another-request",
    result,
    validationWarnings: [],
  });

  expect(worker.terminate).not.toHaveBeenCalled();

  emitResponse(worker, {
    type:"success",
    requestId: "operation-1:3",
    result,
    validationWarnings: [],
  });

  await expect(pending).resolves.toEqual({
    result,
    validationWarnings: [],
  });

  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it("reports progress only for the active request",async()=>{
  const input=createInput();const result=createResult(input);const {run,worker}=createHarness();const onProgress=vi.fn();const pending=run(input,{onProgress});
  emitResponse(worker,{type:"progress",requestId:"stale",stage:"auditing",progress:0.2});
  emitResponse(worker,{type:"progress",requestId:"operation-1:3",stage:"building-offset",progress:0.3});
  emitResponse(worker,{type:"success",requestId:"operation-1:3",result,validationWarnings:[]});
  await pending;expect(onProgress).toHaveBeenCalledOnce();expect(onProgress).toHaveBeenCalledWith("building-offset",0.3);
});

it("uses the configured timeout in the structured failure and terminates once",async()=>{
  const input=createInput();const worker=createFakeWorker();const run=createCavityWorkerRunner(()=>worker,5);
  await expect(run(input)).rejects.toMatchObject({code:"cavity_timeout",stage:"timeout",message:expect.stringContaining("5 ms")});
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it("cancels and terminates the previous Worker when a newer generation starts",async()=>{
  const input=createInput();const first=createFakeWorker();const second=createFakeWorker();const workers=[first,second];const run=createCavityWorkerRunner(()=>workers.shift()!);const firstPending=run(input);const secondInput={...input,operationId:"operation-2",generationVersion:4};const secondPending=run(secondInput);const result=createResult(secondInput);
  await expect(firstPending).rejects.toMatchObject({code:"cavity_cancelled",stage:"cancelled"});
  expect(first.postMessage).toHaveBeenCalledWith({type:"cancel",requestId:"operation-1:3"});expect(first.terminate).toHaveBeenCalledTimes(1);
  emitResponse(second,{type:"success",requestId:"operation-2:4",result,validationWarnings:[]});await expect(secondPending).resolves.toMatchObject({result});expect(second.terminate).toHaveBeenCalledTimes(1);
});
