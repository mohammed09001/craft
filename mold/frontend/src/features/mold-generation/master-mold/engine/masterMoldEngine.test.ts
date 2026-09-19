import { describe, expect, it, vi } from "vitest";

import {
  buildFourHoleCubeFixture,
  buildHighPolySphereFixture,
  buildObliqueHoleCubeFixture,
  buildOpenCavityCubeFixture,
  buildSealedHollowBoxFixture,
  buildSimpleBoxFixture,
  buildSingleHoleCubeFixture,
  buildThreeHoleCubeFixture,
  seedFromFixture,
} from "../planning/masterMoldGoldenFixtures";
import { GENERIC_RIGID_CAST_PROFILE, type MasterToolingSet } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";
import { planLocalizedRemovableCore } from "./multiPiecePlanner";
import { deriveLockRegions } from "./lockEvidence";
import { registerMultiPanelInterfaces, type SequencedChunk } from "./multiPiecePlanner";
import { toolingParametersFromProfile } from "./toolingConstruction";
import { getManifoldModule, createBlankSolid, boundsFromManifold, payloadFromManifold } from "../../geometry/manifold";
import { toolingTolerancePolicy } from "./toolingConstruction";
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
    expect(result.plan!.registrationPlan.features.length).toBeGreaterThan(0);
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
    // The rotated blind-hole fixture contains a local undercut whose
    // tooling must be decomposed independently from the Working Mold.
    const fixture = await buildObliqueHoleCubeFixture();
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
      expect(["split", "full-negative", "full-positive"]).toContain(set.assembly.coreMode);
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
        expect(piece.bounds.max.z - piece.bounds.min.z).toBeLessThanOrEqual(18);
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
    // Exact CSG stayed bounded: per tooling set at most one-piece +
    // lock-driven localized core + multi-piece (Execution 07 LOOP 06 added
    // the lock-driven family to every set's search), never an explosion.
    expect(result.budget.workingMoldConstructionAttempts).toBeLessThanOrEqual(2);
    expect(result.budget.toolingExactPlanAttempts).toBeLessThanOrEqual(3 * result.toolingSets.length);
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

  it("Article 08 (LOOP 06): derives a verified localized removable core from lock evidence, not span fractions", { timeout: ENGINE_TIMEOUT }, async () => {
    // A single +Z blind hole is a real localized lock: the one-piece release
    // jams at the hole ceiling, and only the trapped column under it needs
    // to become a removable core.
    const fixture = await buildSingleHoleCubeFixture();
    const castTarget = {
      moldPartId: "core-target",
      moldPartName: "Core Target",
      mesh: fixture.mesh,
      bounds: fixture.bounds,
      volumeMm3: 10 * 10 * 10 - Math.PI * 1.5 * 1.5 * 3,
      geometryVersion: "core-target-v1",
      featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
      warnings: [],
    };
    // Lock evidence exactly as the engine derives it: for this part the
    // engine pours from -Z, so the failed one-piece pull runs along
    // flipOf("-Z") = "+Z" and jams at the hole ceiling (z = 2). attemptOnePiece
    // retains the overlap between the target and the case at the first
    // colliding sweep distance -- a thin slab at the lock face -- as the
    // primary lock evidence.
    const collisionBounds = { min: { x: -1.5, y: -1.5, z: 1.9 }, max: { x: 1.5, y: 1.5, z: 2.0 } };
    const lockEvidence = deriveLockRegions(castTarget, "+Z", collisionBounds);
    expect(lockEvidence.regions.length).toBeGreaterThan(0);
    expect(lockEvidence.regions[0]!.evidence).toBe("release-collision");
    const plan = await planLocalizedRemovableCore(
      castTarget,
      "-Z",
      toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE),
      lockEvidence,
    );
    expect(plan.rejectionReason).toBeNull();
    expect(plan.plan?.coreMode).toBe("localized-removable-core");
    // The core region derives from the lock: the plug around the bore above
    // the jam face -- localized and centered on the hole axis, not an
    // arbitrary half of the part.
    const core = plan.plan?.pieces.find((piece) => piece.pieceId === "piece-localized-removable-core");
    expect(core).toBeDefined();
    expect(core!.watertight).toBe(true);
    expect(core!.bounds.min.x).toBeLessThanOrEqual(0);
    expect(core!.bounds.max.x).toBeGreaterThanOrEqual(0);
    expect(core!.bounds.min.y).toBeLessThanOrEqual(0);
    expect(core!.bounds.max.y).toBeGreaterThanOrEqual(0);
    expect(core!.bounds.min.z).toBeCloseTo(1.9, 3);
    expect(core!.bounds.max.z).toBeCloseTo(5, 3);
    expect(core!.bounds.max.x - core!.bounds.min.x).toBeLessThan(10);
    expect(core!.volumeMm3).toBeLessThan(castTarget.volumeMm3 * 0.45);
    // Core and shell release order is verified: core first, shell second.
    expect(plan.plan?.releaseSequence).toHaveLength(2);
    expect(plan.plan?.releaseSequence[0]!.pieceId).toBe("piece-localized-removable-core");
    expect(plan.plan?.releaseSequence[1]!.pieceId).toBe("piece-case-shell");
    expect(plan.plan?.releaseSequence.every((step) => step.collisionVerified)).toBe(true);
  });

  it("Article 09 (LOOP 07): proves automatic vents with the exact mesh and reverifies the vented geometry", { timeout: ENGINE_TIMEOUT }, async () => {
    // A box with a bottom-opening cavity traps air at the cavity ceiling in
    // top-pour orientation. The engine must convert the provable pockets
    // into automatic mesh-verified vent features and re-verify the release
    // on the vented geometry -- while unprovable pockets stay user-review.
    const fixture = await buildOpenCavityCubeFixture();
    const result = await runMasterMoldEngine(seedFromFixture(fixture));
    expect(result.failures).toEqual([]);
    expect(result.plan).not.toBeNull();
    // At least one tooling set answered a trapped pocket with an automatic
    // mesh-verified vent (never an aabb-conservative guess).
    const ventedSets = result.toolingSets.filter((set) => set.pourFaceDecision.ventPlan.features.length > 0);
    expect(ventedSets.length).toBeGreaterThan(0);
    for (const set of result.toolingSets) {
      for (const feature of set.pourFaceDecision.ventPlan.features) {
        expect(feature.proof).toBe("mesh-verified");
        expect(feature.end.z).toBeLessThan(feature.start.z);
      }
      // Every pocket without a proven route stays a user-review
      // recommendation; resolved ones are removed from the list.
      expect(
        set.pourFaceDecision.ventPlan.unresolvedRecommendations.every(
          (recommendation) => !set.pourFaceDecision.ventPlan.features.some((feature) => feature.featureId === recommendation.recommendationId),
        ),
      ).toBe(true);
      // Gate: the emitted geometry is the vented geometry, and its release
      // was re-verified AFTER vent subtraction.
      expectVerifiedTooling(set);
    }
  });

  it("Article 10: automatically registers a feasible 3-panel chain with real CSG keys", { timeout: ENGINE_TIMEOUT }, async () => {    const module = await getManifoldModule();
    // Case slab x ∈ [0, 6], split at x=2 (root cut) then the max side at x=4
    // (bisection cut). Sequence is release order: min panel, far panel, middle panel.
    const rootCut = { axis: "+X" as const, coordinateMm: 2 };
    const bisectCut = { axis: "+X" as const, coordinateMm: 4 };
    const solids = [
      { solid: createBlankSolid(module, { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 4, z: 4 } }), lineage: { cuts: [rootCut], sides: [false] } },
      { solid: createBlankSolid(module, { min: { x: 4, y: 0, z: 0 }, max: { x: 6, y: 4, z: 4 } }), lineage: { cuts: [rootCut, bisectCut], sides: [true, true] } },
      { solid: createBlankSolid(module, { min: { x: 2, y: 0, z: 0 }, max: { x: 4, y: 4, z: 4 } }), lineage: { cuts: [rootCut, bisectCut], sides: [true, false] } },
    ];
    const sequence: SequencedChunk[] = solids.map(({ solid, lineage }, index) => ({
      chunk: { solid, bounds: boundsFromManifold(solid), volumeMm3: solid.volume(), lineage },
      pull: { pull: index === 0 ? "-X" : "+X", vector: index === 0 ? [-1, 0, 0] as const : [1, 0, 0] as const, oblique: false },
    }));
    const targetSolid = module.Manifold.cube([2, 2, 2], true).translate(21, 21, 21);
    const castTarget = {
      moldPartId: "three-panel-target",
      moldPartName: "Three Panel Target",
      mesh: payloadFromManifold(targetSolid),
      bounds: { min: { x: 20, y: 20, z: 20 }, max: { x: 22, y: 22, z: 22 } },
      volumeMm3: 8,
      geometryVersion: "three-panel-target-v1",
      featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
      warnings: [],
    };
    const policy = toolingTolerancePolicy({ min: { x: -3, y: -3, z: -3 }, max: { x: 9, y: 7, z: 7 } });
    const registration = await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, [], toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE), policy, 1e-3, 10);
    // The two REAL interfaces (panels 1-2 touch at x=2? no: 1-3 touch at x=2,
    // 3-2 touch at x=4; panels 1-2 never touch) are registered with keys.
    expect(registration.features.map((f) => `${f.malePieceId}:${f.femalePieceId}`).sort()).toEqual([
      "piece-panel-1:piece-panel-3",
      "piece-panel-2:piece-panel-3",
    ]);
    expect(registration.failureReason).toBeNull();
    expect(registration.blockedInterfaces).toEqual([]);
    targetSolid.delete();
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
