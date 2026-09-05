import { describe, expect, it } from "vitest";
import ManifoldModule from "manifold-3d";

describe("Manifold CSG Provenance Experiment", () => {
  it("tests whether Manifold CSG preserves triangle provenance across add and subtract operations using asOriginal().originalID()", async () => {
    const module = await ManifoldModule();
    module.setup();

    // 1. Create Base Solid
    const baseRaw = module.Manifold.cube([20, 20, 10], true);
    const base = baseRaw.asOriginal();
    const baseID = (base as any).originalID();

    // 2. Create Additive Registration Key Solid
    const keyRaw = module.Manifold.cube([4, 4, 4], true).translate([0, 0, 7]);
    const key = keyRaw.asOriginal();
    const keyID = (key as any).originalID();

    // 3. Create Subtractive Sprue Tool Solid
    const sprueRaw = module.Manifold.cylinder(15, 3, 3, 16, true).translate([5, 5, 0]);
    const sprueTool = sprueRaw.asOriginal();
    const sprueID = (sprueTool as any).originalID();

    console.log(`Auto-assigned originalIDs: Base=${baseID}, Registration=${keyID}, Sprue=${sprueID}`);

    // 4. Perform Boolean Operations
    const withKey = base.add(key);
    const finalSolid = withKey.subtract(sprueTool);

    // 5. Inspect final mesh metadata
    const finalMesh = finalSolid.getMesh();
    const runIndices = Array.from(finalMesh.runIndex);
    const runOriginalIDs = Array.from(finalMesh.runOriginalID);
    const runFlags = Array.from(finalMesh.runFlags);

    console.log("=== DETAILED TRIANGLE RUN ANALYSIS ===");
    console.log("Total Triangles:", finalMesh.numTri);
    console.log("Total Runs:", finalMesh.numRun);
    console.log("runIndex:", runIndices);
    console.log("runOriginalIDs:", runOriginalIDs);
    console.log("runFlags:", runFlags);

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
      console.log(`Run ${r}: Triangles [${startTri}..${endTri}] (${count} tris), origID=${origID}, isBackside=${isBackside} -> Role: ${role}`);
    }

    console.log("Triangle Role Breakdown:", triangleRoleCounts);

    expect(triangleRoleCounts["registration-feature"]).toBeGreaterThan(0);
    expect(triangleRoleCounts["sprue-funnel-surface"]).toBeGreaterThan(0);
    expect(triangleRoleCounts["outer-mold"]).toBeGreaterThan(0);
    expect(finalSolid.status()).toBe("NoError");
  });
});
