import { describe, expect, it } from "vitest";

import { GENERIC_RIGID_CAST_PROFILE } from "./contracts";
import { registerMultiPanelInterfaces, type ChunkCutPlane, type ChunkLineage, type SequencedChunk } from "./multiPiecePlanner";
import { toolingParametersFromProfile, toolingTolerancePolicy, type MasterToolingParameters } from "./toolingConstruction";
import { boundsFromManifold, createBlankSolid, getManifoldModule, payloadFromManifold } from "../../geometry/manifold";
import type { MasterCastTarget } from "./contracts";

/**
 * Execution 07 LOOP 05: manufacturable multi-panel registration.
 *
 * Interfaces come from split provenance (the exact bisection tree) proven by
 * cross-section contact measurement — not AABB touching. Key size derives
 * from the case wall and the proven patch extent (the old unexplained 0.1 mm
 * cap is gone). Keys avoid the cavity, pour corridor, and vent paths, and
 * every placement re-runs topology/connectivity plus exact release sweeps.
 * Gate: 3- and 4-panel fixtures get real registration or an explicit,
 * physically justified block reason.
 */

const PANEL = { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 4, z: 4 } };

/**
 * A realistic 4-panel chain: the case slab x ∈ [0, 12] cut at x=3 (root),
 * x=6, then x=9, released left-to-right (panels A/B/C pull −X in order,
 * panel D pulls +X last).
 */
async function fourPanelChain(): Promise<SequencedChunk[]> {
  const module = await getManifoldModule();
  const c1: ChunkCutPlane = { axis: "+X", coordinateMm: 3 };
  const c2: ChunkCutPlane = { axis: "+X", coordinateMm: 6 };
  const c3: ChunkCutPlane = { axis: "+X", coordinateMm: 9 };
  const lineageFor = (cuts: ChunkCutPlane[], sides: boolean[]): ChunkLineage => ({ cuts, sides });
  const spans = [
    { min: 0, max: 3, lineage: lineageFor([c1], [false]), pull: "-X" },
    { min: 3, max: 6, lineage: lineageFor([c1, c2], [true, false]), pull: "-X" },
    { min: 6, max: 9, lineage: lineageFor([c1, c2, c3], [true, true, false]), pull: "-X" },
    { min: 9, max: 12, lineage: lineageFor([c1, c2, c3], [true, true, true]), pull: "+X" },
  ] as const;
  return spans.map((span) => {
    const solid = createBlankSolid(module, {
      min: { x: span.min, y: PANEL.min.y, z: PANEL.min.z },
      max: { x: span.max, y: PANEL.max.y, z: PANEL.max.z },
    });
    return {
      chunk: { solid, bounds: boundsFromManifold(solid), volumeMm3: solid.volume(), lineage: span.lineage },
      pull: { pull: span.pull, vector: span.pull === "-X" ? ([-1, 0, 0] as const) : ([1, 0, 0] as const), oblique: false },
    };
  });
}

/** Deletes the panels' CURRENT solids (registration swaps and deletes old ones internally). */
function deletePanels(sequence: SequencedChunk[]): void {
  for (const entry of sequence) entry.chunk.solid.delete();
}

async function farCastTarget(): Promise<MasterCastTarget> {
  const module = await getManifoldModule();
  const cube = module.Manifold.cube([2, 2, 2], true).translate(50, 50, 50);
  const target: MasterCastTarget = {
    moldPartId: "loop05-target",
    moldPartName: "Loop 05 Target",
    mesh: payloadFromManifold(cube),
    bounds: boundsFromManifold(cube),
    volumeMm3: cube.volume(),
    geometryVersion: "loop05-target-v1",
    featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
    warnings: [],
  };
  cube.delete();
  return target;
}

async function setup(overrides?: Partial<MasterToolingParameters>) {
  const module = await getManifoldModule();
  const castTarget = await farCastTarget();
  const parameters = { ...toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE), ...overrides };
  const policy = toolingTolerancePolicy(PANEL);
  return { module, castTarget, parameters, policy };
}

describe("Manufacturable multi-panel registration (Execution 07 LOOP 05)", () => {
  it("registers real keys on every interface of a 4-panel chain", { timeout: 600_000 }, async () => {
    const { module, castTarget, parameters, policy } = await setup();
    const sequence = await fourPanelChain();
    const volumesBefore = sequence.map((entry) => entry.chunk.volumeMm3);
    const registration = await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, [], parameters, policy, 1e-3, 10);
    expect(registration.blockedInterfaces).toEqual([]);
    expect(registration.failureReason).toBeNull();
    expect(registration.features.map((f) => `${f.malePieceId}:${f.femalePieceId}`)).toEqual([
      "piece-panel-1:piece-panel-2",
      "piece-panel-2:piece-panel-3",
      "piece-panel-3:piece-panel-4",
    ]);
    // Real geometry changed on every interface: the outer male-only panel
    // gained a tenon, the outer female-only panel lost a socket, and the
    // middle panels (male on one side, female on the other) moved off their
    // original volumes.
    expect(sequence[0]!.chunk.volumeMm3).toBeGreaterThan(volumesBefore[0]!);
    expect(sequence[3]!.chunk.volumeMm3).toBeLessThan(volumesBefore[3]!);
    expect(sequence[1]!.chunk.volumeMm3).not.toBeCloseTo(volumesBefore[1]!, 3);
    expect(sequence[2]!.chunk.volumeMm3).not.toBeCloseTo(volumesBefore[2]!, 3);
    deletePanels(sequence);
  });

  it("derives key size from the case wall and patch, not a fixed 0.1 mm cap", { timeout: 600_000 }, async () => {
    const { module, castTarget, parameters, policy } = await setup();
    const sequence = await fourPanelChain();
    const maleVolumeBefore = sequence[0]!.chunk.volumeMm3;
    await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, [], parameters, policy, 1e-3, 10);
    // The key on panel 1 is a hemisphere of radius min(2.5, wall/2, patch/4)
    // = 1 mm, so the tenon adds ~(2/3)π ≈ 2.09 mm³. The old 0.1 mm cap
    // would have added ~0.002 mm³.
    const tenonVolume = sequence[0]!.chunk.volumeMm3 - maleVolumeBefore;
    expect(tenonVolume).toBeGreaterThan(1);
    deletePanels(sequence);
  });

  it("reports an explicit physical block reason when the wall cannot carry a printable key", { timeout: 60_000 }, async () => {
    const { module, castTarget, parameters, policy } = await setup({ caseWallThicknessMm: 1.2 });
    const sequence = await fourPanelChain();
    const registration = await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, [], parameters, policy, 1e-3, 10);
    expect(registration.features).toEqual([]);
    expect(registration.failureReason).toContain("printable minimum");
    expect(registration.failureReason).toContain("1.2");
    deletePanels(sequence);
  });

  it("places no phantom keys where AABBs touch but the panels' material does not", { timeout: 600_000 }, async () => {
    const module = await getManifoldModule();
    const castTarget = await farCastTarget();
    const parameters = toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE);
    const policy = toolingTolerancePolicy(PANEL);
    // Panel A is L-shaped (notch removed at its x=4/y>2 corner); panel B
    // only covers y ∈ [2, 4]. Their AABBs touch at x=4 with y overlap, but
    // A has no material at x=4, y>2 — the old AABB heuristic placed a key
    // in mid-air here.
    const solidA = createBlankSolid(module, { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 4, z: 4 } })
      .subtract(createBlankSolid(module, { min: { x: 2, y: 2, z: 0 }, max: { x: 4, y: 4, z: 4 } }));
    const solidB = createBlankSolid(module, { min: { x: 4, y: 2, z: 0 }, max: { x: 8, y: 4, z: 4 } });
    const cut: ChunkCutPlane = { axis: "+X", coordinateMm: 4 };
    const sequence: SequencedChunk[] = [
      { chunk: { solid: solidA, bounds: boundsFromManifold(solidA), volumeMm3: solidA.volume(), lineage: { cuts: [cut], sides: [false] } }, pull: { pull: "-X", vector: [-1, 0, 0], oblique: false } },
      { chunk: { solid: solidB, bounds: boundsFromManifold(solidB), volumeMm3: solidB.volume(), lineage: { cuts: [cut], sides: [true] } }, pull: { pull: "+X", vector: [1, 0, 0], oblique: false } },
    ];
    const registration = await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, [], parameters, policy, 1e-3, 10);
    // No proven contact at the nominated plane → not an interface at all:
    // nothing registered, nothing blocked, no fabricated reason.
    expect(registration.features).toEqual([]);
    expect(registration.blockedInterfaces).toEqual([]);
    expect(registration.failureReason).toBeNull();
    deletePanels(sequence);
  });

  it("refuses keys that would enter the functional cavity, with the physical reason", { timeout: 600_000 }, async () => {
    const module = await getManifoldModule();
    // The cast target fills the whole panel band, so every candidate key
    // position intersects the cavity.
    const cube = createBlankSolid(module, { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 4, z: 4 } });
    const castTarget: MasterCastTarget = {
      moldPartId: "cavity-target",
      moldPartName: "Cavity Target",
      mesh: payloadFromManifold(cube),
      bounds: boundsFromManifold(cube),
      volumeMm3: cube.volume(),
      geometryVersion: "cavity-target-v1",
      featureIntents: { sprueIntentVersion: null, registrationPolicyVersion: null },
      warnings: [],
    };
    cube.delete();
    const parameters = toolingParametersFromProfile(GENERIC_RIGID_CAST_PROFILE);
    const policy = toolingTolerancePolicy(PANEL);
    const sequence = await fourPanelChain();
    const registration = await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, [], parameters, policy, 1e-3, 10);
    expect(registration.features).toEqual([]);
    expect(registration.blockedInterfaces.length).toBe(3);
    expect(registration.failureReason).toContain("functional cavity");
    deletePanels(sequence);
  });

  it("refuses keys that would enter a vent path corridor, with the physical reason", { timeout: 600_000 }, async () => {
    const { module, castTarget, parameters, policy } = await setup();
    const sequence = await fourPanelChain();
    // A vent run straight down the middle of the x=3 interface patch: every
    // key position on panel 1's interface falls inside the vent corridor.
    // The other interfaces (x=6, x=9) are far from the vent and register.
    const vents = [{ featureId: "vent-1", kind: "vent" as const, start: { x: 3, y: 0, z: 2 }, end: { x: 3, y: 4, z: 2 }, radiusMm: 1 }];
    const registration = await registerMultiPanelInterfaces(module, castTarget, "+Z", sequence, vents, parameters, policy, 1e-3, 10);
    expect(registration.features.map((f) => `${f.malePieceId}:${f.femalePieceId}`)).toEqual([
      "piece-panel-2:piece-panel-3",
      "piece-panel-3:piece-panel-4",
    ]);
    expect(registration.blockedInterfaces).toEqual(["panel-1:panel-2"]);
    expect(registration.failureReason).toContain("vent path corridor");
    deletePanels(sequence);
  });
});
