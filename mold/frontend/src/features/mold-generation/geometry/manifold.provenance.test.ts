import { describe, expect, it } from "vitest";
import ManifoldModule from "manifold-3d";
import type { OriginalTaggedManifold } from "./manifold";

/**
 * `payloadFromManifold` (see manifold.ts) tags exported mesh triangle runs by role using each
 * solid's `asOriginal().originalID()` value recorded before a Boolean operation. This regression
 * test proves that contract actually survives real add/subtract Boolean operations -- both
 * `RegistrationGenerationService` and `SprueGenerationService` depend on it to tag registration-key
 * and sprue-funnel surfaces correctly in the final exported mesh.
 */
describe("Manifold CSG triangle provenance across add and subtract operations", () => {
  it("preserves each solid's originalID as a distinct, attributable triangle run through add and subtract", async () => {
    const module = await ManifoldModule();
    module.setup();

    const base = module.Manifold.cube([20, 20, 10], true).asOriginal() as OriginalTaggedManifold;
    const baseID = base.originalID();

    const key = module.Manifold.cube([4, 4, 4], true).translate([0, 0, 7]).asOriginal() as OriginalTaggedManifold;
    const keyID = key.originalID();

    const sprueTool = module.Manifold.cylinder(15, 3, 3, 16, true).translate([5, 5, 0]).asOriginal() as OriginalTaggedManifold;
    const sprueID = sprueTool.originalID();
    expect(new Set([baseID, keyID, sprueID]).size).toBe(3);

    const withKey = base.add(key);
    const finalSolid = withKey.subtract(sprueTool);
    expect(finalSolid.status()).toBe("NoError");

    const finalMesh = finalSolid.getMesh();
    const runIndices = Array.from(finalMesh.runIndex);
    const runOriginalIDs = Array.from(finalMesh.runOriginalID);
    const runFlags = Array.from(finalMesh.runFlags);

    const triangleRoleCounts: Record<string, number> = {
      "outer-mold": 0,
      "registration-feature": 0,
      "sprue-funnel-surface": 0,
    };

    for (let r = 0; r < finalMesh.numRun; r += 1) {
      const startTri = runIndices[r]! / 3;
      const endTri = runIndices[r + 1]! / 3;
      const count = endTri - startTri;
      const origID = runOriginalIDs[r];
      const isBackside = (runFlags[r]! & 1) !== 0;

      let role = "outer-mold";
      if (origID === keyID) {
        role = "registration-feature";
      } else if (origID === sprueID || isBackside) {
        role = "sprue-funnel-surface";
      }

      triangleRoleCounts[role] = (triangleRoleCounts[role] ?? 0) + count;
    }

    expect(triangleRoleCounts["registration-feature"]).toBeGreaterThan(0);
    expect(triangleRoleCounts["sprue-funnel-surface"]).toBeGreaterThan(0);
    expect(triangleRoleCounts["outer-mold"]).toBeGreaterThan(0);
  });
});
