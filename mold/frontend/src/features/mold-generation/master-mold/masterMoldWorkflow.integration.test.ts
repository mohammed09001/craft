import { describe, expect, it, beforeEach } from "vitest";

import { canonicalCube } from "../cavity-generation/cavityGeneration.testFixtures";
import { designSprueProfile, type SpruePreviewPlacement } from "../sprue-generation";
import type { PartBoundingBoxFaceId } from "../split-face/splitFace.contracts";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { useMasterMoldStore } from "./masterMold.store";
import type { MasterMoldFinalBodyInput } from "./masterMold.store";

/**
 * Article 01/05/06/10: real-integration evidence that Master Mold generates
 * a `current` result from the SAME production final-mold-target pipeline
 * (`createCavity` + Sprue + Registration) Create Cavity itself commits --
 * not a synthetic bare box fed straight into the Boolean generator. No
 * mocking of Manifold, three-mesh-bvh, or the cavity/sprue/registration
 * evaluation: this exercises the real WASM Boolean engine end to end, the
 * same way masterMoldGeometry.generator.test.ts and
 * moldWorkflow.integration.test.ts already prove their own seams for real.
 *
 * Replaces the previous acceptance gap where the only browser-level evidence
 * (masterMoldGenerationProbe.ts) skipped final-mold-target synthesis
 * entirely and ran the Master Mold Boolean generator directly against a bare
 * 10x6x4mm box with no cavity, Sprue, or Registration involved.
 */
const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const canonicalPartGeometry = canonicalCube("master-mold-workflow", k1);

const validPlacement = (x = 5): SpruePreviewPlacement => ({
  status: "valid",
  topPoint: { x, y: 5, z: 30 },
  inwardDirection: { x: 0, y: 0, z: -1 },
  stemLengthMm: 10,
  cavityPoint: { x, y: 5, z: 20 },
  profileDesign: designSprueProfile(null),
  coordinateSpace: "mold-local",
});

async function committedCavity(face: PartBoundingBoxFaceId = "front") {
  const state = useSplitFaceStore.getState();
  state.setCanonicalPartGeometrySignature(canonicalPartGeometry.sourceSignature);
  state.enterSelection();
  state.toggleFace(face);
  expect(await useSplitFaceStore.getState().createMoldParts("master-mold-workflow", k1)).toBe(true);
  expect(await useSplitFaceStore.getState().createCavity(canonicalPartGeometry)).toBe(true);
}

function finalMoldBodyInputsFromCommittedResult(): readonly MasterMoldFinalBodyInput[] {
  const committed = useSplitFaceStore.getState().lastCommittedResult;
  if (committed === null) throw new Error("No committed final-mold result to build Master Mold targets from.");
  return committed.bodies.map((body) => ({
    id: body.id,
    name: body.name,
    mesh: body.mesh,
    bounds: body.bounds,
    volumeMm3: body.volumeMm3,
  }));
}

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
  useMasterMoldStore.getState().reset();
});

describe("Master Mold real final-mold-target integration", () => {
  it("Case A: generates a current Master Mold from real committed cavity geometry, not blocked", async () => {
    await committedCavity();
    const document = useSplitFaceStore.getState().document;

    const ok = await useMasterMoldStore
      .getState()
      .generate(finalMoldBodyInputsFromCommittedResult(), { revision: document.revision, fingerprint: document.fingerprint });

    expect(ok).toBe(true);
    const state = useMasterMoldStore.getState();
    expect(state.status).toBe("current");
    expect(state.bodies.length).toBeGreaterThan(0);
    for (const body of state.bodies) {
      expect(body.status, body.failureMessage ?? "unexpected non-current body").toBe("current");
      expect(body.mesh).not.toBeNull();
      expect(body.watertight).toBe(true);
      expect(body.manifold).toBe(true);
    }
  });

  it("Case B: a valid Sprue added after Master Mold already exists regenerates to current with changed geometry", async () => {
    // Cut on "top" (a Z-axis split) so the block's own natural demold axis
    // is Z, matching this fixture's vertically-fed (topPoint/-Z-inward)
    // Sprue -- a genuinely "manufacturable orientation" per Article 05 Case
    // B. See the sibling "front"-cut case below: the identical Sprue fused
    // onto a Y-split block is real Case D (intentionally impossible), not a
    // regression -- confirmed by checking the block's own pre-Sprue
    // direction analysis never had Z as a candidate either.
    await committedCavity("top");
    const document = useSplitFaceStore.getState().document;
    await useMasterMoldStore
      .getState()
      .generate(finalMoldBodyInputsFromCommittedResult(), { revision: document.revision, fingerprint: document.fingerprint });

    const baseline = useMasterMoldStore.getState().bodies;
    expect(baseline.every((body) => body.status === "current")).toBe(true);
    const baselineVolume = baseline.reduce((sum, body) => sum + (body.volumeMm3 ?? 0), 0);

    expect(await useSplitFaceStore.getState().createSprue(validPlacement())).toBe(true);
    await vi.waitFor(() => expect(useSplitFaceStore.getState().sprues).toHaveLength(1));
    // A Sprue changes the committed cavity/registration bodies, but Master
    // Mold's own upstream `moldDocument` identity only advances once a new
    // commit happens -- createSprue already recommits (Article 09's
    // MasterMoldAction effect relies on document.revision/fingerprint).
    const documentAfterSprue = useSplitFaceStore.getState().document;
    expect(documentAfterSprue.revision).toBeGreaterThan(document.revision);

    const regenerated = await useMasterMoldStore
      .getState()
      .generate(finalMoldBodyInputsFromCommittedResult(), {
        revision: documentAfterSprue.revision,
        fingerprint: documentAfterSprue.fingerprint,
      });

    expect(regenerated).toBe(true);
    const after = useMasterMoldStore.getState();
    expect(after.status, after.bodies.map((b) => b.failureMessage).join("; ")).toBe("current");
    const afterVolume = after.bodies.reduce((sum, body) => sum + (body.volumeMm3 ?? 0), 0);
    // The Sprue is real geometry fused into the final-mold target, so the
    // Master Mold stock enclosing it must measurably change (Article 05:
    // "Master geometry changes"), not merely re-report the old volume.
    expect(afterVolume).not.toBeCloseTo(baselineVolume, 3);
  });

  it("Case D: a vertically-fed Sprue fused onto a sideways-only-demoldable block is a real, structured infeasibility -- not a false negative", async () => {
    await committedCavity("front");
    const document = useSplitFaceStore.getState().document;
    await useMasterMoldStore
      .getState()
      .generate(finalMoldBodyInputsFromCommittedResult(), { revision: document.revision, fingerprint: document.fingerprint });
    const partId = useMasterMoldStore.getState().bodies[0]!.source.finalMoldPartId;
    // Ground truth: even before the Sprue exists, Z was never a feasible
    // pull direction for this "front"-cut half -- only Y. A Z-oriented
    // Sprue fused onto it is therefore genuinely untoolable as one piece,
    // regardless of Master Mold's own analyzer.
    const preSprueCandidates = useMasterMoldStore.getState().bodies.find((b) => b.source.finalMoldPartId === partId)!.directionAnalysis.candidates;
    expect(preSprueCandidates.find((c) => c.direction === "+Z" || c.direction === "-Z")?.valid).toBe(false);

    expect(await useSplitFaceStore.getState().createSprue(validPlacement())).toBe(true);
    await vi.waitFor(() => expect(useSplitFaceStore.getState().sprues).toHaveLength(1));
    const documentAfterSprue = useSplitFaceStore.getState().document;

    await useMasterMoldStore.getState().generate(finalMoldBodyInputsFromCommittedResult(), {
      revision: documentAfterSprue.revision,
      fingerprint: documentAfterSprue.fingerprint,
    });

    const result = useMasterMoldStore.getState().bodies.find((b) => b.source.finalMoldPartId === partId)!;
    expect(result.status).toBe("blocked");
    expect(result.failureReason).toBe("no_valid_open_direction");
    // A structured, distinct failure reason (Article 08) -- not a generic
    // error, and not silently reported as `current`/faked success (rule 4).
  });

  it("Case (Article 06): Registration is baked into the final-mold target Master Mold consumes, not the pre-registration body", async () => {
    await committedCavity();
    const committed = useSplitFaceStore.getState().lastCommittedResult!;
    expect(committed.keyed).toBe(true);
    expect(committed.stages.registration.status).toBe("generated");
    expect(committed.stages.registration.bodies).not.toBeNull();
    // Master Mold's targets are built directly from `lastCommittedResult.bodies`
    // (finalMoldBodyInputsFromCommittedResult), which selectActiveMoldBodies
    // and Create Cavity's own viewport already source from the SAME keyed,
    // registered result -- so proving `committed.keyed` is true here is
    // proof the geometry Master Mold consumes already has Registration in it.
    const document = useSplitFaceStore.getState().document;
    const ok = await useMasterMoldStore
      .getState()
      .generate(finalMoldBodyInputsFromCommittedResult(), { revision: document.revision, fingerprint: document.fingerprint });
    expect(ok).toBe(true);
    expect(useMasterMoldStore.getState().status).toBe("current");
  });
});
