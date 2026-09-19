import { describe, expect, it } from "vitest";

import { buildSingleHoleCubeFixture, seedFromFixture } from "../planning/masterMoldGoldenFixtures";
import { GENERIC_RIGID_CAST_PROFILE, type MasterCastTarget } from "./contracts";
import { runMasterMoldEngine } from "./masterMoldEngine";
import { LOCK_EVIDENCE_LIMITS, deriveLockRegions } from "./lockEvidence";
import { planLocalizedRemovableCore } from "./multiPiecePlanner";
import { toolingParametersFromProfile } from "./toolingConstruction";
import { boundsFromManifold, createBlankSolid, getManifoldModule, payloadFromManifold } from "../../geometry/manifold";

/**
 * Execution 07 LOOP 06: lock-driven localized removable cores.
 *
 * Core candidate regions derive from lock evidence -- the exact release-
 * collision region of the failed one-piece sweep, plus sampled inaccessible
 * patch clusters (undercut patches facing against the pull and blocked along
 * it), each grown into a full pull column. Planning geometry (bounded surface
 * sampling over the BVH) localizes high-poly locks; exact CSG runs only on
 * the shortlisted regions. A dense mesh is never by itself a reason to skip
 * the search: the old `triangles <= 2000` gate is gone. Core and shell
 * release order is exactly verified.
 */

const SIDE = 10;

function singlePlusZHoleTarget(mesh?: MasterCastTarget["mesh"], bounds?: MasterCastTarget["bounds"], volumeMm3?: number, id = "loop06-single-hole"): MasterCastTarget {
  return {
    moldPartId: id,
    moldPartName: id,
    mesh: mesh!,
    bounds: bounds!,
    volumeMm3: volumeMm3 ?? SIDE * SIDE * SIDE - Math.PI * 1.5 * 1.5 * 3,
    geometryVersion: `${id}-v1`,
    featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
    warnings: [],
  };
}

async function singleHoleTarget(): Promise<MasterCastTarget> {
  const fixture = await buildSingleHoleCubeFixture();
  return singlePlusZHoleTarget(fixture.mesh, fixture.bounds);
}

describe("Lock evidence derivation (Execution 07 LOOP 06)", () => {
  it("localizes a blind-hole lock to the ceiling cluster, grown into a pull column", async () => {
    const castTarget = await singleHoleTarget();
    // Pull -Z (the case slides -Z): the hole ceiling (z = 2, facing +Z) is
    // undercut and blocked along the pull -- the actual lock.
    const evidence = deriveLockRegions(castTarget, "-Z", null);
    expect(evidence.sampledTriangleCount).toBeGreaterThan(0);
    expect(evidence.lockedSampleCount).toBeGreaterThan(0);
    // The ceiling cluster: seed at the lock face (z ≈ 2) containing the hole
    // axis; its grown column reaches the pull-side face (z = -5) while
    // staying transversally localized (nowhere near the full 10 mm span).
    const ceiling = evidence.regions.find(
      (region) => Math.abs(region.seedBounds.max.z - 2) < 1.5 && region.bounds.min.x <= 0 && region.bounds.max.x >= 0 && region.bounds.min.y <= 0 && region.bounds.max.y >= 0,
    );
    expect(ceiling).toBeDefined();
    expect(ceiling!.evidence).toBe("inaccessible-patch-cluster");
    expect(ceiling!.bounds.min.z).toBeCloseTo(castTarget.bounds.min.z, 6);
    expect(ceiling!.bounds.max.z).toBeCloseTo(2, 6);
    expect(ceiling!.bounds.max.x - ceiling!.bounds.min.x).toBeLessThan(SIDE);
    // The shortlist stays bounded.
    expect(evidence.regions.length).toBeLessThanOrEqual(LOCK_EVIDENCE_LIMITS.maxRegions);
  });

  it("prefers the exact release-collision region when the failed sweep reported one", async () => {
    const castTarget = await singleHoleTarget();
    // As attemptOnePiece reports it: the overlap between the target and the
    // case at the first colliding sweep distance -- a thin slab at the lock
    // face.
    const collisionBounds = { min: { x: -1.5, y: -1.5, z: 1.9 }, max: { x: 1.5, y: 1.5, z: 2.0 } };
    const evidence = deriveLockRegions(castTarget, "-Z", collisionBounds);
    expect(evidence.regions[0]!.evidence).toBe("release-collision");
    // Grown into the pull column along -Z: from the lock face down to the
    // pull-side face, transversally around the lock footprint.
    expect(evidence.regions[0]!.bounds.min.z).toBeCloseTo(castTarget.bounds.min.z, 6);
    expect(evidence.regions[0]!.bounds.max.z).toBeCloseTo(2.0, 6);
    expect(evidence.regions[0]!.bounds.min.x).toBeLessThanOrEqual(0);
    expect(evidence.regions[0]!.bounds.max.x).toBeGreaterThanOrEqual(0);
    expect(evidence.regions.length).toBeLessThanOrEqual(LOCK_EVIDENCE_LIMITS.maxRegions);
  });

  it("derives bounded evidence for a dense (high-poly) mesh without sampling the whole surface", { timeout: 300_000 }, async () => {
    // A dense blind-hole cube: far beyond the old 2000-triangle gate.
    const module = await getManifoldModule();
    const box = createBlankSolid(module, { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } });
    const bore = module.Manifold.cylinder(3, 1.5, 1.5, 640).translate(0, 0, 2);
    const hollow = box.subtract(bore);
    box.delete();
    bore.delete();
    try {
      const mesh = payloadFromManifold(hollow);
      const castTarget = singlePlusZHoleTarget(mesh, boundsFromManifold(hollow), hollow.volume(), "loop06-dense");
      // The mesh is genuinely high-poly: the old gate would have excluded it.
      expect(mesh.indices.length / 3).toBeGreaterThan(2000);
      const evidence = deriveLockRegions(castTarget, "-Z", null);
      // Sampling is bounded regardless of density, and still finds the lock.
      expect(evidence.sampledTriangleCount).toBeGreaterThan(0);
      expect(evidence.sampledTriangleCount).toBeLessThanOrEqual(LOCK_EVIDENCE_LIMITS.sampleCap);
      const ceiling = evidence.regions.find(
        (region) => Math.abs(region.seedBounds.max.z - 2) < 1.5 && region.bounds.min.x <= 0 && region.bounds.max.x >= 0 && region.bounds.min.y <= 0 && region.bounds.max.y >= 0,
      );
      expect(ceiling).toBeDefined();
      expect(ceiling!.bounds.min.z).toBeCloseTo(castTarget.bounds.min.z, 6);
      expect(evidence.regions.length).toBeLessThanOrEqual(LOCK_EVIDENCE_LIMITS.maxRegions);
    } finally {
      hollow.delete();
    }
  });
});

describe("Lock-driven localized cores (Execution 07 LOOP 06)", () => {
  it("verifies a localized core + shell plan from lock evidence, core removed before shell", { timeout: 300_000 }, async () => {
    const castTarget = await singleHoleTarget();
    const lockEvidence = deriveLockRegions(castTarget, "-Z", null);
    const plan = await planLocalizedRemovableCore(
      castTarget,
      "-Z",
      toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE),
      lockEvidence,
    );
    expect(plan.rejectionReason).toBeNull();
    expect(plan.plan!.coreMode).toBe("localized-removable-core");
    // The parting plane is the lock face itself (z = 2, the hole ceiling),
    // provenance-stamped as lock-derived.
    expect(plan.plan!.partingSurface.origin).toBe("lock-evidence");
    expect(plan.plan!.partingSurface.coordinateMm).toBeCloseTo(2, 3);
    // Release order is exact: core first, shell second, both verified.
    const sequence = plan.plan!.releaseSequence;
    expect(sequence).toHaveLength(2);
    expect(sequence[0]!.pieceId).toBe("piece-localized-removable-core");
    expect(sequence[1]!.pieceId).toBe("piece-case-shell");
    expect(sequence.every((step) => step.collisionVerified)).toBe(true);
    // The core is the trapped column under the lock: real, localized,
    // watertight, well under half the part.
    const core = plan.plan!.pieces[0]!;
    expect(core.pieceId).toBe("piece-localized-removable-core");
    expect(core.watertight).toBe(true);
    expect(core.volumeMm3).toBeLessThan(castTarget.volumeMm3 * 0.45);
    expect(core.bounds.min.z).toBeCloseTo(castTarget.bounds.min.z, 3);
    expect(core.bounds.max.z).toBeCloseTo(2, 3);
  });

  it("gate: a high-poly part with locks plans verified tooling, not a triangle-count exclusion", { timeout: 300_000 }, async () => {
    // A 3-bore cube whose ±X bores are high-segment (dense): beyond the old
    // 2000-triangle gate, with the same topology as the three-hole fixture
    // (a working-mold piece whose one-piece master case cannot release).
    const module = await getManifoldModule();
    let solid = createBlankSolid(module, { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } });
    const boreZ = module.Manifold.cylinder(3, 1.5, 1.5, 32).translate(0, 0, 2);
    const borePX = module.Manifold.cylinder(3, 1.5, 1.5, 640).rotate(0, 90, 0).translate(2, 0, 0);
    const boreNX = module.Manifold.cylinder(3, 1.5, 1.5, 640).rotate(0, 90, 0).translate(-5, 0, 0);
    const s1 = solid.subtract(boreZ);
    solid.delete();
    const s2 = s1.subtract(borePX);
    s1.delete();
    solid = s2.subtract(boreNX);
    s2.delete();
    boreZ.delete();
    borePX.delete();
    boreNX.delete();
    try {
      const mesh = payloadFromManifold(solid);
      expect(mesh.indices.length / 3).toBeGreaterThan(2000);
      const result = await runMasterMoldEngine(seedFromFixture({ mesh, bounds: boundsFromManifold(solid) }));
      expect(result.failures).toEqual([]);
      expect(result.plan).not.toBeNull();
      // The undercut pieces answered with multi-piece tooling, verified.
      expect(result.toolingSets.some((set) => set.releaseMode === "multi-piece")).toBe(true);
      for (const set of result.toolingSets) {
        expect(set.assembly.pieces.length).toBeGreaterThan(0);
        expect(set.assembly.releaseSequence.length).toBe(set.assembly.pieces.length);
        for (const piece of set.assembly.pieces) {
          expect(piece.watertight).toBe(true);
          expect(piece.manifold).toBe(true);
        }
      }
      // The lock-driven localized family ran for the dense part (per set:
      // one-piece +, for failed one-piece pieces, localized + multi): the
      // old gate would have skipped it solely by triangle count.
      expect(result.budget.toolingExactPlanAttempts).toBeGreaterThan(result.toolingSets.length);
    } finally {
      solid.delete();
    }
  });
});
