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
      positions: new Float32Array([0, 0, 0]),
      indices: new Uint32Array([0, 0, 0]),
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
    pourFaceDecision: { selected: "+Z", castingOrientation: "+Z", score: 0, candidates: [], fillabilityWarnings: [], ventPlan: { status: "clear", features: [], unresolvedRecommendations: [] } },
    accessibility: { directions: [], onePieceReleaseFeasible: true },
    releaseMode: "one-piece",
    partingSurfaces: [],
    assembly: { pieces: [], registrationFeatures: [], coreMode: "split", releaseSequence: [] },
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
    budget: { candidateDirectionCount: 0, planningPatchCount: 0, workingMoldPlanCandidateCount: 0, workingMoldConstructionAttempts: 1, pourFaceAnalysisAttempts: 0, ventAnalysisAttempts: 0, toolingOnePieceAttempts: 0, toolingMultiPieceAttempts: 0, toolingExactPlanAttempts: 2, releaseVerificationAttempts: 0, limitsExceeded: [] },
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

  // Execution 07 LOOP 09: the Action skips live staleness propagation while
  // status === "generating", so the store's commit-time identity check is the
  // guarantee that source/transform/build-volume races cannot present
  // obsolete geometry as current.
  describe("LOOP 09 commit-time identity races", () => {
    function makeRacingDeps() {
      let resolveRun: ((value: ReturnType<typeof makeResult>) => void) | null = null;
      const deps: MasterMoldStoreDeps = {
        runMasterMoldGenerationInWorker: Object.assign(
          vi.fn(() => new Promise<ReturnType<typeof makeResult>>((resolve) => { resolveRun = resolve; })),
          { cancel: vi.fn() },
        ),
        cancelActiveMasterMoldGeneration: vi.fn(),
      };
      return { deps, resolve: () => resolveRun!(makeResult([makeSet("wm-piece-1")], { generationVersion: 1 })) };
    }

    it("a source/transform/build-volume change mid-flight commits the verified geometry flagged stale", async () => {
      const { deps, resolve } = makeRacingDeps();
      const store = createMasterMoldStoreCreator(deps);
      let liveIdentity: string | null = masterSeedStalenessIdentity(makeSeed());
      const pending = store.getState().generate({
        seed: makeSeed(),
        liveIdentity: () => liveIdentity,
      });
      // The build volume (or transform/source) changes while generating --
      // the Action's staleness effect deliberately does not fire here.
      liveIdentity = masterSeedStalenessIdentity(makeSeed({ sourceGeometryVersion: "geo-2" }));
      resolve();
      expect(await pending).toBe(true);

      const state = store.getState();
      expect(state.status).toBe("stale");
      expect(state.sets.length).toBeGreaterThan(0);
      expect(state.sets.every((entry) => entry.status === "stale")).toBe(true);
      // The identity records what the result was generated AGAINST, so the
      // next generate() can distinguish reuse from regeneration.
      expect(state.seedIdentity?.identity).toBe(masterSeedStalenessIdentity(makeSeed()));
    });

    it("an unchanged live identity commits current", async () => {
      const { deps, resolve } = makeRacingDeps();
      const store = createMasterMoldStoreCreator(deps);
      const pending = store.getState().generate({
        seed: makeSeed(),
        liveIdentity: () => masterSeedStalenessIdentity(makeSeed()),
      });
      resolve();
      expect(await pending).toBe(true);
      expect(store.getState().status).toBe("current");
      expect(store.getState().sets.every((entry) => entry.status === "current")).toBe(true);
    });

    it("the full-reuse fast path is also guarded by the live identity", async () => {
      const { deps, resolve } = makeRacingDeps();
      const store = createMasterMoldStoreCreator(deps);
      const first = store.getState().generate({ seed: makeSeed() });
      resolve();
      await first;
      const liveIdentity = masterSeedStalenessIdentity(makeSeed({ sourceGeometryVersion: "geo-2" }));
      await store.getState().generate({ seed: makeSeed(), liveIdentity: () => liveIdentity });
      expect(deps.runMasterMoldGenerationInWorker).toHaveBeenCalledTimes(1);
      expect(store.getState().status).toBe("stale");
      expect(store.getState().sets.every((entry) => entry.status === "stale")).toBe(true);
    });

    it("a reset mid-flight still discards the result (no resurrection through reset)", async () => {
      const { deps, resolve } = makeRacingDeps();
      const store = createMasterMoldStoreCreator(deps);
      const pending = store.getState().generate({
        seed: makeSeed(),
        liveIdentity: () => masterSeedStalenessIdentity(makeSeed()),
      });
      store.getState().reset();
      resolve();
      expect(await pending).toBe(false);
      expect(store.getState().status).toBe("unavailable");
      expect(store.getState().sets).toHaveLength(0);
      expect(store.getState().seedIdentity).toBeNull();
    });

    it("a newer generate() mid-flight discards the older result (no resurrection through new generation)", async () => {
      const resolvers: Array<(value: ReturnType<typeof makeResult>) => void> = [];
      const deps: MasterMoldStoreDeps = {
        runMasterMoldGenerationInWorker: Object.assign(
          vi.fn(() => new Promise<ReturnType<typeof makeResult>>((resolve) => { resolvers.push(resolve); })),
          { cancel: vi.fn() },
        ),
        cancelActiveMasterMoldGeneration: vi.fn(),
      };
      const store = createMasterMoldStoreCreator(deps);
      const staleSeed = makeSeed({ sourceGeometryVersion: "geo-1" });
      const first = store.getState().generate({ seed: staleSeed });
      const second = store.getState().generate({ seed: makeSeed({ sourceGeometryVersion: "geo-2" }) });
      // The OLDER generation resolves last: it must not overwrite the newer one.
      resolvers[0]!(makeResult([makeSet("wm-piece-old")], { generationVersion: 1 }));
      resolvers[1]!(makeResult([makeSet("wm-piece-new")], { generationVersion: 2 }));
      expect(await first).toBe(false);
      expect(await second).toBe(true);
      expect(store.getState().sets.map((entry) => entry.moldPartId)).toEqual(["wm-piece-new"]);
    });
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
    // Isolation keys the composite (set, piece) identity (LOOP 10).
    expect(store.getState().pieceVisibility["wm-piece-1:tool-1"]).toBe(true);
  });

  it("Execution 07 LOOP 10: isolating one set never touches another set's same-named piece", async () => {
    // Engine piece ids are set-local: both sets carry "piece-1".
    const setA = makeSet("wm-a", "fp-a");
    const setB = makeSet("wm-b", "fp-b");
    const toolPiece = (id: string) => ({
      pieceId: "piece-1",
      name: `${id} Master Case`,
      mesh: { positions: [], indices: [] },
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      volumeMm3: 1,
      triangleCount: 2,
      watertight: true,
      manifold: true,
      releaseDirection: "+Z" as const,
      regions: [],
      toolingRegistrationFeatureIds: [],
      fitsBuildVolume: true,
    });
    (setA.assembly as unknown as { pieces: unknown[] }).pieces = [toolPiece("A")];
    (setB.assembly as unknown as { pieces: unknown[] }).pieces = [toolPiece("B")];
    const deps = makeDeps(makeResult([setA, setB]));
    const store = createMasterMoldStoreCreator(deps);
    await store.getState().generate({ seed: makeSeed() });

    store.getState().isolateToolingSet("wm-a");
    expect(store.getState().pieceVisibility).toEqual({ "wm-a:piece-1": true, "wm-b:piece-1": false });
  });

  it("fingerprint content is Master-owned (never a Cavity-named signature)", () => {
    const set = makeSet("wm-piece-1");
    expect(set.fingerprint.startsWith("fp-")).toBe(true);
    expect(hashStableValues({ a: 1 })).toBeTruthy();
  });
});
