import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMasterMoldStoreCreator, type MasterMoldGenerateRequest, type MasterMoldStoreDeps } from "./masterMold.store";
import type { MasterCommittedMoldPart, MasterMoldProjectSnapshot, MasterToolingSet } from "./engine/contracts";
import { castTargetInputVersion } from "./engine/castTarget";
import type { MasterMoldRequest, MasterMoldResult, MasterToolingSetState } from "./masterMold.contracts";

function stockPart(id: string, geometryVersion: string): MasterCommittedMoldPart {
  return {
    id,
    name: `Mold ${id}`,
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 4 } },
    volumeMm3: 240,
    geometryVersion,
  };
}

function snapshotWith(parts: readonly MasterCommittedMoldPart[]): MasterMoldProjectSnapshot {
  return {
    schemaVersion: 1,
    snapshotId: `snap:${parts.map((p) => p.geometryVersion).join("|")}`,
    sourceModelGeometryIdentity: "model:1",
    sourcePartMesh: {
      modelId: "m",
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      geometryVersion: "part:1",
      sourceSignature: "sig:1",
    },
    committedMoldParts: parts,
    moldPartOffset: { x: 0, y: 0, z: 0 },
    moldDefinitionId: "def-1",
    moldDefinition: {
      schemaVersion: 1,
      definitionId: "def-1",
      modelId: "m",
      coordinateSystem: { units: "millimeters", upAxis: "Z" },
      selectionBoxBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      referenceMoldBlock: { clearanceMm: 10, bounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 20, y: 20, z: 20 } } },
      usedFaces: [],
    },
    cuttingPlanes: [],
    referenceMoldBlockBounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 20, y: 20, z: 20 } },
    sprueIntents: [],
    registrationPolicy: null,
    printerBuildVolume: null,
    processProfile: {
      profileId: "genericRigidCast",
      flexibleCastTarget: false,
      reusableToolingPreferred: true,
      shrinkCompensationMmPerMm: null,
      minimumToolingWallMm: 1,
      releaseClearanceMm: null,
      maximumToolingPieceCount: 4,
      ventRequirementPolicy: "user-managed",
    },
    projectRevision: 1,
    projectFingerprint: "fp-1",
  };
}

/** Minimal valid engine tooling set echoing the part's input signature (what the real engine produces for reused/verified parts). */
function fakeSetFor(request: MasterMoldRequest, part: MasterCommittedMoldPart): MasterToolingSet {
  const sourceSignature = castTargetInputVersion(request.snapshot, part);
  const prior = request.priorSets.find((candidate) => candidate.moldPartId === part.id);
  if (prior !== undefined && prior.sourceSignature === sourceSignature) return prior;
  return {
    moldPartId: part.id,
    moldPartName: part.name,
    castTargetVersion: `ct:${part.geometryVersion}`,
    sourceSignature,
    pourFaceDecision: { selected: "+Z", castingOrientation: "+Z", score: 1, candidates: [], fillabilityWarnings: [] },
    accessibility: { directions: [], onePieceReleaseFeasible: true },
    releaseMode: "one-piece",
    partingSurfaces: [],
    assembly: { pieces: [], registrationFeatures: [], releaseSequence: [] },
    warnings: [],
    fingerprint: `set:${part.geometryVersion}`,
  };
}

function createStateEntry(set: MasterToolingSet): MasterToolingSetState {
  return {
    moldPartId: set.moldPartId,
    moldPartName: set.moldPartName,
    status: "current",
    sourceSignature: set.sourceSignature,
    contentVersion: set.castTargetVersion,
    set,
    failureMessage: null,
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

describe("masterMold.store (Execution 05 Articles 12/13)", () => {
  let snapshotAB: MasterMoldProjectSnapshot;
  let snapshotA: MasterMoldProjectSnapshot;

  beforeEach(() => {
    snapshotAB = snapshotWith([stockPart("a", "stock:a:1"), stockPart("b", "stock:b:1")]);
    snapshotA = snapshotWith([stockPart("a", "stock:a:1")]);
  });

  function generateRequest(snapshot: MasterMoldProjectSnapshot): MasterMoldGenerateRequest {
    return { snapshot };
  }

  it("generates every committed part on the first call", async () => {
    const { deps, run } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    const ok = await store.getState().generate(generateRequest(snapshotAB));

    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].snapshot.committedMoldParts).toHaveLength(2);
    expect(store.getState().status).toBe("current");
    expect(store.getState().sets.map((entry) => entry.moldPartId)).toEqual(["a", "b"]);
  });

  it("reuses every set and skips the Worker entirely when nothing changed (Article 13)", async () => {
    const { deps, run } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB));
    const firstSets = store.getState().sets;
    run.mockClear();

    const ok = await store.getState().generate(generateRequest(snapshotAB));

    expect(ok).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(store.getState().sets).toEqual(firstSets);
  });

  it("sends the prior sets to the Worker and keeps the unchanged sibling's identity on a partial change", async () => {
    const { deps, run } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB));
    const reusedBBefore = store.getState().sets.find((entry) => entry.moldPartId === "b");
    run.mockClear();

    const changed = snapshotWith([stockPart("a", "stock:a:2"), stockPart("b", "stock:b:1")]);
    await store.getState().generate(generateRequest(changed));

    expect(run).toHaveBeenCalledTimes(1);
    const sent = run.mock.calls[0]![0] as MasterMoldRequest;
    expect(sent.snapshot.committedMoldParts).toHaveLength(2);
    // Both prior sets travel to the engine; the engine reuses the unchanged one.
    expect(sent.priorSets).toHaveLength(2);
    expect(sent.priorSets.map((set) => set.moldPartId).sort()).toEqual(["a", "b"]);

    const sets = store.getState().sets;
    expect(sets.find((entry) => entry.moldPartId === "b")).toBe(reusedBBefore);
  });

  it("keeps a valid sibling when one part is blocked", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) =>
        part.id === "a"
          ? { moldPartId: "a", moldPartName: part.name, status: "blocked" as const, sourceSignature: "", contentVersion: "", set: null, failureMessage: "no reusable tooling plan." }
          : createStateEntry(fakeSetFor(request, part)),
      ),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB));

    expect(store.getState().status).toBe("blocked");
    const sets = store.getState().sets;
    expect(sets.find((entry) => entry.moldPartId === "a")?.status).toBe("blocked");
    expect(sets.find((entry) => entry.moldPartId === "b")?.status).toBe("current");
  });

  it("drops a set whose part no longer exists in the committed stock", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB));
    await store.getState().generate(generateRequest(snapshotA));

    expect(store.getState().sets.map((entry) => entry.moldPartId)).toEqual(["a"]);
  });

  it("preserves prior sets and reports an error when the Worker call itself fails", async () => {
    let call = 0;
    const { deps } = createDeps(async (request) => {
      call += 1;
      if (call === 1) {
        return { operationId: request.operationId, generationVersion: request.generationVersion, elapsedMs: 1, sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))) };
      }
      throw new Error("Master Mold Worker execution failed.");
    });
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotA));
    const before = store.getState().sets;

    const changed = snapshotWith([stockPart("a", "stock:a:2")]);
    const ok = await store.getState().generate(generateRequest(changed));

    expect(ok).toBe(false);
    expect(store.getState().status).toBe("error");
    expect(store.getState().lastError).toBe("Master Mold Worker execution failed.");
    expect(store.getState().sets).toEqual(before);
  });

  it("reportGenerationFailure makes a snapshot-assembly failure an observable store state, not merely local UI text", async () => {
    const { deps } = createDeps(async () => {
      throw new Error("should not be called");
    });
    const store = createMasterMoldStoreCreator(deps);

    store.getState().reportGenerationFailure("Master Mold could not generate tooling from the project snapshot.");

    expect(store.getState().status).toBe("error");
    expect(store.getState().lastError).toBe("Master Mold could not generate tooling from the project snapshot.");
  });

  it("marks current sets stale when the document identity changes, without discarding their geometry", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB), { revision: 1, fingerprint: "doc-1" });
    expect(store.getState().status).toBe("current");

    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });

    expect(store.getState().status).toBe("stale");
    expect(store.getState().sets.every((entry) => entry.status === "stale")).toBe(true);
    expect(store.getState().sets.every((entry) => entry.set !== null)).toBe(true);
  });

  it("does not mark stale when the document identity is unchanged", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotA), { revision: 1, fingerprint: "doc-1" });
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

  it("revives reused stale sets back to current once generate() re-validates them against the live snapshot (Article 13)", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB), { revision: 1, fingerprint: "doc-1" });
    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });
    expect(store.getState().status).toBe("stale");

    // Same inputs for both parts -- the fast path revives them without the Worker.
    const ok = await store.getState().generate(generateRequest(snapshotAB), { revision: 2, fingerprint: "doc-2" });

    expect(ok).toBe(true);
    expect(store.getState().status).toBe("current");
    expect(store.getState().sets.every((entry) => entry.status === "current")).toBe(true);
  });

  it("invalidates only the named parts, leaving unaffected siblings current (Article 13)", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB), { revision: 1, fingerprint: "doc-1" });
    store.getState().invalidateMasterMoldParts(["a"]);

    expect(store.getState().status).toBe("stale");
    expect(store.getState().sets.find((entry) => entry.moldPartId === "a")?.status).toBe("stale");
    expect(store.getState().sets.find((entry) => entry.moldPartId === "b")?.status).toBe("current");
  });

  it("reset() clears the tracked document identity so a later markMasterMoldStale is a no-op", async () => {
    const { deps } = createDeps(async (request) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotA), { revision: 1, fingerprint: "doc-1" });
    store.getState().reset();

    expect(store.getState().sourceDocumentIdentity).toBeNull();
    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });
    expect(store.getState().status).toBe("unavailable");
  });

  it("never lets a superseded generate() call overwrite a newer one", async () => {
    let resolveFirst!: (result: MasterMoldResult) => void;
    const { deps, run } = createDeps(() => new Promise<MasterMoldResult>((resolve) => { resolveFirst = resolve; }));
    const store = createMasterMoldStoreCreator(deps);

    const firstPending = store.getState().generate(generateRequest(snapshotA));
    run.mockImplementationOnce(async (request: MasterMoldRequest) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const secondSnapshot = snapshotWith([stockPart("b", "stock:b:1")]);
    const secondPending = store.getState().generate(generateRequest(secondSnapshot));

    resolveFirst({ operationId: "stale", generationVersion: 1, elapsedMs: 1, sets: [createStateEntry(fakeSetFor({ operationId: "stale", generationVersion: 1, snapshot: snapshotA, priorSets: [] }, snapshotA.committedMoldParts[0]!))] });

    expect(await firstPending).toBe(false);
    await secondPending;

    expect(store.getState().sets.map((entry) => entry.moldPartId)).toEqual(["b"]);
  });

  it("a document-identity change mid-flight is never overwritten back to current once the in-flight generate() settles (Article 12)", async () => {
    let resolveSecond!: (result: MasterMoldResult) => void;
    const { deps, run } = createDeps(() => new Promise<MasterMoldResult>((resolve) => { resolveSecond = resolve; }));
    run.mockImplementationOnce(async (request: MasterMoldRequest) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotA), { revision: 1, fingerprint: "doc-1" });
    expect(store.getState().status).toBe("current");

    const changed = snapshotWith([stockPart("a", "stock:a:2")]);
    const pending = store.getState().generate(generateRequest(changed), { revision: 1, fingerprint: "doc-1" });
    expect(store.getState().status).toBe("generating");

    store.getState().markMasterMoldStale({ revision: 2, fingerprint: "doc-2" });
    expect(store.getState().status).toBe("stale");

    resolveSecond({
      operationId: "stale",
      generationVersion: 2,
      elapsedMs: 1,
      sets: [createStateEntry(fakeSetFor({ operationId: "stale", generationVersion: 2, snapshot: changed, priorSets: [] }, changed.committedMoldParts[0]!))],
    });
    expect(await pending).toBe(false);

    expect(store.getState().status).toBe("stale");
  });

  it("a per-part invalidation mid-flight is never overwritten back to current once the in-flight generate() settles (Article 13)", async () => {
    let resolveSecond!: (result: MasterMoldResult) => void;
    const { deps, run } = createDeps(() => new Promise<MasterMoldResult>((resolve) => { resolveSecond = resolve; }));
    run.mockImplementationOnce(async (request: MasterMoldRequest) => ({
      operationId: request.operationId,
      generationVersion: request.generationVersion,
      elapsedMs: 1,
      sets: request.snapshot.committedMoldParts.map((part) => createStateEntry(fakeSetFor(request, part))),
    }));
    const store = createMasterMoldStoreCreator(deps);

    await store.getState().generate(generateRequest(snapshotAB), { revision: 1, fingerprint: "doc-1" });
    expect(store.getState().status).toBe("current");

    const changed = snapshotWith([stockPart("a", "stock:a:1"), stockPart("b", "stock:b:2")]);
    const pending = store.getState().generate(generateRequest(changed), { revision: 1, fingerprint: "doc-1" });
    expect(store.getState().status).toBe("generating");

    store.getState().invalidateMasterMoldParts(["a"]);
    expect(store.getState().sets.find((entry) => entry.moldPartId === "a")?.status).toBe("stale");

    resolveSecond({
      operationId: "stale",
      generationVersion: 2,
      elapsedMs: 1,
      sets: [
        createStateEntry(fakeSetFor({ operationId: "stale", generationVersion: 2, snapshot: changed, priorSets: [] }, changed.committedMoldParts[0]!)),
        createStateEntry(fakeSetFor({ operationId: "stale", generationVersion: 2, snapshot: changed, priorSets: [] }, changed.committedMoldParts[1]!)),
      ],
    });
    expect(await pending).toBe(false);

    expect(store.getState().sets.find((entry) => entry.moldPartId === "a")?.status).toBe("stale");
  });

  it("reset() during an in-flight generate() is not clobbered once the cancelled call's promise settles", async () => {
    let rejectPending!: (error: Error) => void;
    const { deps } = createDeps(() => new Promise<MasterMoldResult>((_resolve, reject) => { rejectPending = reject; }));
    const store = createMasterMoldStoreCreator(deps);

    const pending = store.getState().generate(generateRequest(snapshotA));
    expect(store.getState().status).toBe("generating");

    store.getState().reset();
    expect(store.getState().status).toBe("unavailable");
    expect(store.getState().sets).toEqual([]);

    rejectPending(Object.assign(new Error("Master Mold generation was cancelled."), { code: "cancelled" }));
    await pending;

    expect(store.getState().status).toBe("unavailable");
    expect(store.getState().sets).toEqual([]);
    expect(store.getState().lastError).toBeNull();
  });
});
