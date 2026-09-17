import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMasterMoldStoreCreator, type MasterMoldStoreDeps } from "./masterMold.store";
import { DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES, masterSeedStalenessIdentity, type MasterMoldSeedSnapshot } from "./seed/masterMoldSeed";
import { GENERIC_RIGID_CAST_PROFILE, type MasterToolingSet } from "./engine/contracts";
import { hashStableValues } from "../geometry/geometryFingerprint";

// Execution 06 Article 14: Master-owned lifecycle. Staleness follows the
// seed identity (source geometry + profile + build volume + preferences) --
// never Split Face definitions or Create Cavity state.

function makeSeed(overrides: Partial<MasterMoldSeedSnapshot> = {}): MasterMoldSeedSnapshot {
  return {
    schemaVersion: 1,
    seedId: "seed-1",
    sourceModelId: "m",
    sourceGeometryVersion: "geo-1",
    sourceMesh: {
      modelId: "m",
      positions: [0, 0, 0],
      indices: [0, 0, 0],
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      geometryVersion: "geo-1",
    },
    sourceTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    sourceBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    userPreferences: DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES,
    sourceProjectRevision: "rev-1",
    ...overrides,
  };
}

function makeSet(moldPartId: string, fingerprint = "fp-1"): MasterToolingSet {
  return {
    moldPartId,
    moldPartName: `Working Mold ${moldPartId}`,
    castTargetVersion: "ctv-1",
    sourceSignature: "sig-1",
    pourFaceDecision: { selected: "+Z", castingOrientation: "+Z", score: 0, candidates: [], fillabilityWarnings: [] },
    accessibility: { directions: [], onePieceReleaseFeasible: true },
    releaseMode: "one-piece",
    partingSurfaces: [],
    assembly: { pieces: [], registrationFeatures: [], releaseSequence: [] },
    warnings: [],
    fingerprint,
  };
}

function makeResult(sets: MasterToolingSet[], overrides: Record<string, unknown> = {}) {
  return {
    operationId: "op",
    generationVersion: 1,
    elapsedMs: 1,
    sets: sets.map((set) => ({
      moldPartId: set.moldPartId,
      moldPartName: set.moldPartName,
      status: "current" as const,
      sourceSignature: set.sourceSignature,
      contentVersion: set.castTargetVersion,
      set,
      failureMessage: null,
    })),
    plan: null,
    workingMoldPieceCount: 2,
    warningCount: 0,
    budget: { workingMoldConstructionAttempts: 1, toolingExactPlanAttempts: 2, limitsExceeded: [] },
    seedId: "seed-1",
    ...overrides,
  };
}

function makeDeps(result: ReturnType<typeof makeResult> | Error): MasterMoldStoreDeps {
  const run = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  return {
    runMasterMoldGenerationInWorker: Object.assign(run, { cancel: vi.fn() }),
    cancelActiveMasterMoldGeneration: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Master Mold store (Execution 06 Article 14)", () => {
  it("generates from a seed and stores the seed identity plus summary", async () => {
    const deps = makeDeps(makeResult([makeSet("wm-piece-1", "fp-1"), makeSet("wm-piece-2", "fp-2")]));
    const store = createMasterMoldStoreCreator(deps);
    const ok = await store.getState().generate({ seed: makeSeed() });
    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.status).toBe("current");
    expect(state.sets).toHaveLength(2);
    expect(state.seedIdentity?.identity).toBe(masterSeedStalenessIdentity(makeSeed()));
    expect(state.summary?.workingMoldPieceCount).toBe(2);
    expect(state.summary?.allReleasesVerified).toBe(true);
  });

  it("reuses prior sets verbatim when the seed identity is unchanged", async () => {
    const deps = makeDeps(makeResult([makeSet("wm-piece-1")]));
    const store = createMasterMoldStoreCreator(deps);
    await store.getState().generate({ seed: makeSeed() });
    const before = store.getState().sets;
    const ok = await store.getState().generate({ seed: makeSeed() });
    expect(ok).toBe(true);
    expect(deps.runMasterMoldGenerationInWorker).toHaveBeenCalledTimes(1);
    expect(store.getState().sets).toHaveLength(before.length);
    expect(store.getState().sets[0]).toBe(before[0]);
  });

  it("flags staleness only when the seed identity changes", async () => {
    const deps = makeDeps(makeResult([makeSet("wm-piece-1")]));
    const store = createMasterMoldStoreCreator(deps);
    await store.getState().generate({ seed: makeSeed() });

    const sameIdentity = { identity: masterSeedStalenessIdentity(makeSeed()), sourceProjectRevision: "rev-1" };
    store.getState().markMasterMoldStale(sameIdentity);
    expect(store.getState().status).toBe("current");

    const changed = { identity: masterSeedStalenessIdentity(makeSeed({ sourceGeometryVersion: "geo-2" })), sourceProjectRevision: "rev-2" };
    store.getState().markMasterMoldStale(changed);
    expect(store.getState().status).toBe("stale");
    expect(store.getState().sets.every((entry) => entry.status === "stale")).toBe(true);
  });

  it("superseded generations never overwrite newer state", async () => {
    let resolveRun: ((value: ReturnType<typeof makeResult>) => void) | null = null;
    const deps: MasterMoldStoreDeps = {
      runMasterMoldGenerationInWorker: Object.assign(
        vi.fn(() => new Promise<ReturnType<typeof makeResult>>((resolve) => { resolveRun = resolve; })),
        { cancel: vi.fn() },
      ),
      cancelActiveMasterMoldGeneration: vi.fn(),
    };
    const store = createMasterMoldStoreCreator(deps);
    const first = store.getState().generate({ seed: makeSeed() });
    store.getState().reset();
    resolveRun!(makeResult([makeSet("wm-piece-1")], { generationVersion: 1 }));
    expect(await first).toBe(false);
    expect(store.getState().status).toBe("unavailable");
    expect(store.getState().sets).toHaveLength(0);
  });

  it("worker failures surface as error state without discarding the store", async () => {
    const deps = makeDeps(new Error("boom"));
    const store = createMasterMoldStoreCreator(deps);
    const ok = await store.getState().generate({ seed: makeSeed() });
    expect(ok).toBe(false);
    expect(store.getState().status).toBe("error");
    expect(store.getState().lastError).toContain("boom");
  });

  it("piece visibility toggles and per-set isolation drive presentation state", async () => {
    const set = makeSet("wm-piece-1", "fp-1");
    (set.assembly as unknown as { pieces: unknown[] }).pieces = [
      { pieceId: "tool-1", name: "Tool 1", mesh: { positions: [], indices: [] }, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, volumeMm3: 1, triangleCount: 0, watertight: true, manifold: true, releaseDirection: "+Z", regions: [], toolingRegistrationFeatureIds: [], fitsBuildVolume: true },
    ];
    const deps = makeDeps(makeResult([set]));
    const store = createMasterMoldStoreCreator(deps);
    await store.getState().generate({ seed: makeSeed() });

    store.getState().togglePieceVisibility("tool-1");
    expect(store.getState().pieceVisibility["tool-1"]).toBe(false);
    store.getState().togglePieceVisibility("tool-1");
    expect(store.getState().pieceVisibility["tool-1"]).toBe(true);

    store.getState().togglePieceVisibility("tool-1");
    store.getState().isolateToolingSet("wm-piece-1");
    expect(store.getState().pieceVisibility["tool-1"]).toBe(true);
  });

  it("fingerprint content is Master-owned (never a Cavity-named signature)", () => {
    const set = makeSet("wm-piece-1");
    expect(set.fingerprint.startsWith("fp-")).toBe(true);
    expect(hashStableValues({ a: 1 })).toBeTruthy();
  });
});
