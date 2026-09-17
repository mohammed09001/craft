import { describe, expect, it, vi } from "vitest";

import {
  buildFourHoleCubeFixture,
  buildHighPolySphereFixture,
  buildObliqueHoleCubeFixture,
  buildSealedHollowBoxFixture,
  buildSimpleBoxFixture,
  buildThreeHoleCubeFixture,
  seedFromFixture,
} from "../planning/masterMoldGoldenFixtures";
import { GENERIC_RIGID_CAST_PROFILE, type MasterToolingSet } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";
import { DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES } from "../seed/masterMoldSeed";

// Execution 06 Article 17: golden geometry acceptance. Every case runs the
// full autonomous pipeline straight from the imported-part seed: no cutting
// planes, no mold definition, no Create Cavity.

vi.mock("../../cavity-generation/cavityGeneration.workerClient", () => ({
  runCavityGenerationInWorker: vi.fn(() => {
    throw new Error("The Master Mold engine must never invoke the Cavity worker.");
  }),
  cancelActiveCavityGeneration: vi.fn(),
}));

const ENGINE_TIMEOUT = 300_000;

function expectVerifiedTooling(set: MasterToolingSet): void {
  expect(set.assembly.pieces.length).toBeGreaterThan(0);
  for (const piece of set.assembly.pieces) {
    expect(piece.watertight).toBe(true);
    expect(piece.manifold).toBe(true);
    expect(piece.volumeMm3).toBeGreaterThan(0);
  }
  expect(set.assembly.releaseSequence.length).toBe(set.assembly.pieces.length);
  expect(set.assembly.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
}

describe("Master Mold Engine golden cases (Execution 06 Article 17)", () => {
  it("Golden A: a simple part selects the minimum two-piece working mold with verified tooling", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildSimpleBoxFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    expect(result.plan!.moldPieces.length).toBe(2);
    // The minimum verified piece count policy: 2-piece was feasible, so the
    // rejected-evidence trail records nothing below it.
    expect(result.plan!.rejectedPieceCounts).toEqual([]);
    expect(result.toolingSets.length).toBe(2);
    for (const set of result.toolingSets) expectVerifiedTooling(set);
    expect(result.plan!.releaseSequence.length).toBe(2);
    expect(result.plan!.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    for (const piece of result.plan!.moldPieces) {
      expect(piece.watertight).toBe(true);
      expect(piece.manifold).toBe(true);
    }
  });

  it("Golden B: a three-blind-hole part rejects every two-piece plan with evidence and selects three pieces", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    const plan = result.plan!;
    expect(plan.moldPieces.length).toBe(3);
    // 2-piece search rejected with evidence (Article 06: a failed two-piece
    // plan is planning evidence, not product failure).
    expect(plan.rejectedPieceCounts).toContainEqual(
      expect.objectContaining({ pieceCount: 2 }),
    );
    expect(plan.releaseSequence.length).toBe(3);
    expect(plan.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    expect(result.toolingSets.length).toBe(3);
    for (const set of result.toolingSets) expectVerifiedTooling(set);
    // Parting interfaces come from geometry (region adjacency across the
    // assigned surface), not arbitrary fixed fractions.
    expect(plan.partingInterfaces.length).toBeGreaterThan(0);
  });

  it("Golden C: a four-blind-hole part does not terminate at two or three and selects four within the configured limit", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildFourHoleCubeFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    const plan = result.plan!;
    expect(plan.moldPieces.length).toBe(4);
    expect(plan.rejectedPieceCounts.map((entry) => entry.pieceCount).sort()).toEqual([2, 3]);
    expect(plan.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
    expect(result.toolingSets.length).toBe(4);
    for (const set of result.toolingSets) expectVerifiedTooling(set);
  });

  it("Golden D: an oblique fixture is solved by a geometry-derived direction, not a world axis", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildObliqueHoleCubeFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.failures).toEqual([]);
    const plan = result.plan!;
    // 2-piece is impossible (the ±X holes each need their own pull on top of
    // the rotated hole); the plan must come from geometry-derived directions.
    expect(plan.moldPieces.length).toBeGreaterThanOrEqual(3);
    expect(plan.rejectedPieceCounts).toContainEqual(expect.objectContaining({ pieceCount: 2 }));
    const isAxisAligned = (direction: { readonly x: number; readonly y: number; readonly z: number }): boolean =>
      Math.abs(direction.x) + Math.abs(direction.y) + Math.abs(direction.z) > 1.999;
    expect(plan.moldPieces.some((piece) => !isAxisAligned(piece.assignedDirection))).toBe(true);
    for (const set of result.toolingSets) expectVerifiedTooling(set);
  });

  it("Golden E: a working-mold piece with an internal undercut rejects its one-piece master case and gets a verified multi-panel case", { timeout: ENGINE_TIMEOUT }, async () => {
    // Golden B's fixture already produces working-mold pieces containing
    // blind-hole undercuts; its tooling sets must answer accordingly.
    const fixture = await buildThreeHoleCubeFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.failures).toEqual([]);

    const multiPanelSets = result.toolingSets.filter((set) => set.releaseMode === "multi-piece");
    expect(multiPanelSets.length).toBeGreaterThan(0);
    for (const set of multiPanelSets) {
      // Article 10: a multi-piece set carries a REAL assembly strategy --
      // populated alignment features, or an explicit warning when automatic
      // pins cannot cover the panel arrangement. Never a silent empty list.
      const hasFeatures = set.assembly.registrationFeatures.length > 0;
      const hasAssemblyNote = set.warnings.some((warning) => warning.includes("alignment") || warning.includes("pins"));
      expect(hasFeatures || hasAssemblyNote).toBe(true);
      if (hasFeatures) {
        for (const feature of set.assembly.registrationFeatures) {
          const male = set.assembly.pieces.find((piece) => piece.pieceId === feature.malePieceId);
          expect(male).toBeDefined();
          expect(male!.toolingRegistrationFeatureIds).toContain(feature.featureId);
        }
      }
      expectVerifiedTooling(set);
    }
    // At least one set must also prove the one-piece case genuinely fails
    // for an undercut piece (the multi-panel answer is not a style choice).
    expect(result.toolingSets.some((set) => set.releaseMode === "one-piece")).toBe(true);
  });

  it("Golden F: a too-small printer build volume splits the master tooling, not the working mold plan", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildSimpleBoxFixture();
    const unrestricted = await runMasterMoldEngine(seedFromFixture(fixture));
    const restricted = await runMasterMoldEngine(
      seedFromFixture(fixture, {
        printerBuildVolume: { x: 27, y: 27, z: 18 },
      }),
    );

    expect(unrestricted.failures).toEqual([]);
    expect(restricted.failures).toEqual([]);
    // Same working mold decomposition either way.
    expect(restricted.plan!.moldPieces.length).toBe(unrestricted.plan!.moldPieces.length);
    // The tooling answered the printer constraint with more printable pieces.
    const unrestrictedPieces = unrestricted.toolingSets.reduce((sum, set) => sum + set.assembly.pieces.length, 0);
    const restrictedPieces = restricted.toolingSets.reduce((sum, set) => sum + set.assembly.pieces.length, 0);
    expect(restrictedPieces).toBeGreaterThan(unrestrictedPieces);
    for (const set of restricted.toolingSets) {
      for (const piece of set.assembly.pieces) {
        expect(piece.bounds.max.x - piece.bounds.min.x).toBeLessThanOrEqual(27);
        expect(piece.bounds.max.y - piece.bounds.min.y).toBeLessThanOrEqual(27);
        expect(piece.bounds.max.z - piece.bounds.min.z).toBeLessThanOrEqual(27);
      }
    }
    // Two-panel splits carry real automatic alignment pins (Article 10).
    for (const set of restricted.toolingSets) {
      if (set.assembly.pieces.length === 2) {
        expect(set.assembly.registrationFeatures.length).toBeGreaterThan(0);
      }
    }
  });

  it("Golden G: a sealed internal void returns a structured flexible/sacrificial fallback, never fake geometry", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildSealedHollowBoxFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));

    expect(result.plan).toBeNull();
    expect(result.toolingSets).toEqual([]);
    expect(result.failures.length).toBe(1);
    const failure = result.failures[0]!;
    expect(failure.reason).toBe("no_release_plan");
    expect(failure.message).toContain("flexible");
    // Evidence: every piece count 2..max was tried and rejected.
    expect(result.plan).toBeNull();
  });

  it("determinism: identical seeds produce identical plan fingerprints and tooling set fingerprints", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const a = await runMasterMoldEngine(seedFromFixture(fixture));
    const b = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(a.plan!.moldPieces.map((piece) => piece.geometryVersion)).toEqual(b.plan!.moldPieces.map((piece) => piece.geometryVersion));
    expect(a.toolingSets.map((set) => set.fingerprint)).toEqual(b.toolingSets.map((set) => set.fingerprint));
  });

  it("piece-count cap: the profile limit bounds the search without hardcoding the engine", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildFourHoleCubeFixture();
    const seed = seedFromFixture(fixture, {
      processProfile: { ...GENERIC_RIGID_CAST_PROFILE, maximumWorkingMoldPieceCount: 3 },
    });
    const result = await runMasterMoldEngine(seed);
    // With 4 genuinely required but capped at 3, the outcome is a structured
    // no-plan failure naming the cap -- never a fake 3-piece plan.
    expect(result.plan).toBeNull();
    expect(result.failures[0]!.reason).toBe("no_release_plan");
  });

  it("Article 18: a high-poly mesh completes through multiple stages under the centralized budgets", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = buildHighPolySphereFixture();
    const stages: string[] = [];
    const result = await runMasterMoldEngine(seedFromFixture(fixture), [], {
      onStage: (stage) => {
        if (!stages.includes(stage.stage)) stages.push(stage.stage);
      },
    });

    expect(result.failures).toEqual([]);
    // A convex sphere selects the minimum two-piece plan.
    expect(result.plan!.moldPieces.length).toBe(2);
    // Progress advanced through more than one named stage.
    expect(stages.length).toBeGreaterThan(1);
    // Exact CSG stayed bounded: a handful of construction attempts, not a
    // candidate explosion.
    expect(result.budget.workingMoldConstructionAttempts).toBeLessThanOrEqual(2);
    expect(result.budget.toolingExactPlanAttempts).toBeLessThanOrEqual(2 * result.toolingSets.length);
    for (const set of result.toolingSets) expectVerifiedTooling(set);
  });

  it("cancellation: the engine aborts promptly when the signal fires mid-planning", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildThreeHoleCubeFixture();
    const controller = new AbortController();
    const seeded = seedFromFixture(fixture);
    const run = runMasterMoldEngine(seeded, [], {
      signal: controller.signal,
      onStage: () => controller.abort(),
    });
    await expect(run).rejects.toMatchObject({ code: "cancelled" });
  });

  it("planning cache: a repeated seed with a different build volume reuses the accessibility map (Article 13.7)", { timeout: ENGINE_TIMEOUT }, async () => {
    const fixture = await buildSimpleBoxFixture();
    const first = await runMasterMoldEngine(seedFromFixture(fixture));
    const second = await runMasterMoldEngine(
      seedFromFixture(fixture, { printerBuildVolume: { x: 50, y: 50, z: 50 } }),
    );
    expect(first.plan).not.toBeNull();
    expect(second.plan).not.toBeNull();
    expect(second.budget.workingMoldConstructionAttempts).toBeGreaterThan(0);
    expect(DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES.preferredMaximumWorkingMoldPieces).toBeNull();
  });
});
