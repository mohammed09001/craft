import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMasterMoldStoreCreator, type MasterMoldFinalBodyInput, type MasterMoldStoreDeps } from "./masterMold.store";
import { cavityBodyGeometryVersion } from "../cavity-generation/cavityGeneration.signature";
import { buildMasterMoldSourceFingerprint } from "./masterMold.fingerprint";
import type { MasterMoldBodyResult, MasterMoldParameters, MasterMoldRequest, MasterMoldResult } from "./masterMold.contracts";

const PARAMETERS: MasterMoldParameters = { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 };

function bodyInput(id: string, sizeZ = 4): MasterMoldFinalBodyInput {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: sizeZ } };
  return { id, name: `Final Mold ${id}`, mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, bounds, volumeMm3: 10 * 6 * sizeZ };
}

function currentResultFor(input: MasterMoldFinalBodyInput): MasterMoldBodyResult {
  const finalMoldGeometryVersion = cavityBodyGeometryVersion({ id: input.id, mesh: input.mesh, bounds: input.bounds });
  return {
    source: { finalMoldPartId: input.id, finalMoldPartName: input.name, finalMoldGeometryVersion },
    status: "current",
    direction: "+Z",
    directionAnalysis: { candidates: [], selected: "+Z", feasible: true },
    mesh: input.mesh,
    bounds: input.bounds,
    volumeMm3: 100,
    triangleCount: 1,
    watertight: true,
    manifold: true,
    failureReason: null,
    failureMessage: null,
    fingerprint: buildMasterMoldSourceFingerprint(finalMoldGeometryVersion, PARAMETERS, null),
  };
}

function blockedResultFor(input: MasterMoldFinalBodyInput): MasterMoldBodyResult {
  const finalMoldGeometryVersion = cavityBodyGeometryVersion({ id: input.id, mesh: input.mesh, bounds: input.bounds });
  return {
    source: { finalMoldPartId: input.id, finalMoldPartName: input.name, finalMoldGeometryVersion },
    status: "blocked",
    direction: null,
    directionAnalysis: { candidates: [], selected: null, feasible: false },
    mesh: null,
    bounds: null,
    volumeMm3: null,
    triangleCount: null,
    watertight: false,
    manifold: false,
    failureReason: "no_valid_open_direction",
    failureMessage: "No feasible direction.",
    fingerprint: buildMasterMoldSourceFingerprint(finalMoldGeometryVersion, PARAMETERS, null),
  };
}

function createDeps(runImpl: (request: MasterMoldRequest) => Promise<MasterMoldResult>): { deps: MasterMoldStoreDeps; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(runImpl);
  const deps: MasterMoldStoreDeps = {
    runMasterMoldGenerationInWorker: run as unknown as MasterMoldStoreDeps["runMasterMoldGenerationInWorker"],
    cancelActiveMasterMoldGeneration: vi.fn(),
  };
  return { deps, run };
}

describe("masterMold.store", () => {
  let inputA: MasterMoldFinalBodyInput;
  let inputB: MasterMoldFinalBodyInput;

  beforeEach(() => {
    inputA = bodyInput("a", 4);
    inputB = bodyInput("b", 5);
  });

  it("generates every target on the first call", async () => {
    const { deps, run } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    const ok = await store.getState().generate([inputA, inputB]);

    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].targets).toHaveLength(2);
    expect(store.getState().status).toBe("current");
    expect(store.getState().bodies.map((b) => b.source.finalMoldPartId)).toEqual(["a", "b"]);
  });

  it("reuses every body and skips the Worker entirely when nothing changed", async () => {
    const { deps, run } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB]);
    const firstBodies = store.getState().bodies;
    run.mockClear();

    const ok = await store.getState().generate([inputA, inputB]);

    expect(ok).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(store.getState().bodies).toEqual(firstBodies);
  });

  it("regenerates only the changed sibling and reuses the unchanged one", async () => {
    const { deps, run } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB]);
    const reusedBBefore = store.getState().bodies.find((b) => b.source.finalMoldPartId === "b");
    run.mockClear();

    const changedA = bodyInput("a", 999); // different geometry -> different fingerprint
    await store.getState().generate([changedA, inputB]);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].targets).toHaveLength(1);
    expect(run.mock.calls[0]![0].targets[0].source.finalMoldPartId).toBe("a");

    const bodies = store.getState().bodies;
    expect(bodies.find((b) => b.source.finalMoldPartId === "b")).toBe(reusedBBefore);
  });

  it("keeps a valid sibling when one part is blocked", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) =>
        target.source.finalMoldPartId === "a"
          ? blockedResultFor(inputA)
          : currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 }),
      ),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB]);

    expect(store.getState().status).toBe("blocked");
    const bodies = store.getState().bodies;
    expect(bodies.find((b) => b.source.finalMoldPartId === "a")?.status).toBe("blocked");
    expect(bodies.find((b) => b.source.finalMoldPartId === "b")?.status).toBe("current");
  });

  it("drops a part that no longer exists in the committed final mold", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB]);
    await store.getState().generate([inputA]);

    expect(store.getState().bodies.map((b) => b.source.finalMoldPartId)).toEqual(["a"]);
  });

  it("preserves prior valid bodies and reports an error when the Worker call itself fails", async () => {
    let call = 0;
    const { deps } = createDeps(async (request) => {
      call += 1;
      if (call === 1) {
        return { operationId: request.operationId, generationVersion: request.generationVersion, elapsedMs: 1, bodies: request.targets.map((t) => currentResultFor({ id: t.source.finalMoldPartId, name: t.source.finalMoldPartName, mesh: t.mesh, bounds: t.bounds, volumeMm3: t.volumeMm3 })) };
      }
      throw new Error("Master Mold Worker execution failed.");
    });
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA]);
    const before = store.getState().bodies;

    const changedA = bodyInput("a", 999);
    const ok = await store.getState().generate([changedA]);

    expect(ok).toBe(false);
    expect(store.getState().status).toBe("error");
    expect(store.getState().lastError).toBe("Master Mold Worker execution failed.");
    expect(store.getState().bodies).toEqual(before);
  });

  it("marks current bodies stale when the document identity changes, without discarding their geometry", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB], { revision: 1, fingerprint: "doc-1" });
    expect(store.getState().status).toBe("current");

    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });

    expect(store.getState().status).toBe("stale");
    expect(store.getState().bodies.every((b) => b.status === "stale")).toBe(true);
    expect(store.getState().bodies.map((b) => b.mesh)).toEqual([inputA.mesh, inputB.mesh]);
  });

  it("does not mark stale when the document identity is unchanged", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA], { revision: 1, fingerprint: "doc-1" });
    store.getState().markMasterMoldStale({ revision: 1, fingerprint: "doc-1" });

    expect(store.getState().status).toBe("current");
  });

  it("is a no-op before any generation has ever happened", () => {
    const { deps } = createDeps(async () => {
      throw new Error("should not be called");
    });
    const store = createMasterMoldStoreCreator(deps);

    store.getState().markMasterMoldStale({ revision: 1, fingerprint: "doc-1" });

    expect(store.getState().status).toBe("unavailable");
  });

  it("revives a reused body from stale back to current once generate() re-validates it against the live document", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB], { revision: 1, fingerprint: "doc-1" });
    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });
    expect(store.getState().status).toBe("stale");

    // Same geometry for both parts -- both are reused (skip the Worker) but must shed the stale flag.
    const ok = await store.getState().generate([inputA, inputB], { revision: 2, fingerprint: "doc-2" });

    expect(ok).toBe(true);
    expect(store.getState().status).toBe("current");
    expect(store.getState().bodies.every((b) => b.status === "current")).toBe(true);
  });

  it("invalidates only the named parts, leaving unaffected siblings current", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA, inputB], { revision: 1, fingerprint: "doc-1" });
    store.getState().invalidateMasterMoldParts(["a"]);

    expect(store.getState().status).toBe("stale");
    expect(store.getState().bodies.find((b) => b.source.finalMoldPartId === "a")?.status).toBe("stale");
    expect(store.getState().bodies.find((b) => b.source.finalMoldPartId === "b")?.status).toBe("current");
  });

  it("reset() clears the tracked document identity so a later markMasterMoldStale is a no-op", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((target) => currentResultFor({ id: target.source.finalMoldPartId, name: target.source.finalMoldPartName, mesh: target.mesh, bounds: target.bounds, volumeMm3: target.volumeMm3 })),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate([inputA], { revision: 1, fingerprint: "doc-1" });
    store.getState().reset();

    expect(store.getState().sourceDocumentIdentity).toBeNull();
    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });
    expect(store.getState().status).toBe("unavailable");
  });

  it("never lets a superseded generate() call overwrite a newer one", async () => {
    let resolveFirst!: (result: MasterMoldResult) => void;
    const { deps, run } = createDeps(() => new Promise<MasterMoldResult>((resolve) => { resolveFirst = resolve; }));
    const store = createMasterMoldStoreCreator(deps);

    const firstPending = store.getState().generate([inputA]);
    run.mockImplementationOnce(async (request: MasterMoldRequest) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      bodies: request.targets.map((t) => currentResultFor({ id: t.source.finalMoldPartId, name: t.source.finalMoldPartName, mesh: t.mesh, bounds: t.bounds, volumeMm3: t.volumeMm3 })),
    }));
    const secondPending = store.getState().generate([inputB]);

    resolveFirst({ operationId: "stale", generationVersion: 1, elapsedMs: 1, bodies: [currentResultFor(inputA)] });

    expect(await firstPending).toBe(false);
    await secondPending;

    expect(store.getState().bodies.map((b) => b.source.finalMoldPartId)).toEqual(["b"]);
  });

  it("Article 09: reset() during an in-flight generate() is not clobbered once the cancelled call's promise settles", async () => {
    let rejectPending!: (error: Error) => void;
    const { deps } = createDeps(() => new Promise<MasterMoldResult>((_resolve, reject) => { rejectPending = reject; }));
    const store = createMasterMoldStoreCreator(deps);

    const pending = store.getState().generate([inputA]);
    expect(store.getState().status).toBe("generating");

    store.getState().reset();
    expect(store.getState().status).toBe("unavailable");
    expect(store.getState().bodies).toEqual([]);

    // The cancelled Worker call's promise settling later (rejection, as a
    // real cancellation would produce) must never resurrect the state
    // reset() already moved past -- generationVersion is the only gate
    // generate()'s catch handler checks, so reset() must invalidate it too.
    rejectPending(Object.assign(new Error("Master Mold generation was cancelled."), { code: "cancelled" }));
    await pending;

    expect(store.getState().status).toBe("unavailable");
    expect(store.getState().bodies).toEqual([]);
    expect(store.getState().lastError).toBeNull();
  });
});
