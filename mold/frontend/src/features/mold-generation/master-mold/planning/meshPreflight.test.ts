import { describe, expect, it } from "vitest";

import { runMeshPreflight } from "./meshPreflight";
import { buildHighPolySphereFixture, buildSimpleBoxFixture } from "./masterMoldGoldenFixtures";

/** Eight corners of an axis-aligned unit-ish box, side length 4, centered at origin. */
const BOX_VERTICES = [
  [-2, -2, -2], [2, -2, -2], [2, 2, -2], [-2, 2, -2], // bottom 0-3
  [-2, -2, 2], [2, -2, 2], [2, 2, 2], [-2, 2, 2], // top 4-7
];

/** A correctly wound, watertight box (two triangles per face, outward winding), hand-authored (no Manifold kernel). */
function closedBoxMesh(): { positions: number[]; indices: number[] } {
  const positions = BOX_VERTICES.flat();
  const indices = [
    0, 2, 1, 0, 3, 2, // bottom (-Z), outward normal -Z
    4, 5, 6, 4, 6, 7, // top (+Z), outward normal +Z
    0, 5, 4, 0, 1, 5, // -Y face
    1, 6, 5, 1, 2, 6, // +X face
    2, 7, 6, 2, 3, 7, // +Y face
    3, 4, 7, 3, 0, 4, // -X face
  ];
  return { positions, indices };
}

describe("Mesh preflight (Execution 08 LOOP 03)", () => {
  it("passes a real watertight/manifold solid with a correct positive volume", async () => {
    const fixture = await buildSimpleBoxFixture(10);
    const result = runMeshPreflight(fixture.mesh);
    expect(result.status).toBe("valid");
    expect(result.issues).toEqual([]);
    expect(result.componentCount).toBe(1);
    expect(result.volumeMm3).toBeCloseTo(1000, 0);
    expect(result.selfIntersectionChecked).toBe(true);
  });

  it("passes a dense high-poly solid", () => {
    const fixture = buildHighPolySphereFixture(48, 96, 15);
    const result = runMeshPreflight(fixture.mesh);
    expect(result.status).toBe("valid");
    expect(result.volumeMm3).toBeGreaterThan(0);
  });

  it("passes a hand-authored watertight box built without the kernel", () => {
    const mesh = closedBoxMesh();
    const result = runMeshPreflight(mesh);
    expect(result.status).toBe("valid");
    expect(result.volumeMm3).toBeCloseTo(64, 6);
  });

  it("classifies an open (non-watertight) mesh as invalid-for-master-mold", () => {
    const mesh = closedBoxMesh();
    // Drop the top face (last two triangles, 6 indices) -- the box is now open.
    const openIndices = mesh.indices.slice(0, mesh.indices.length - 6);
    const result = runMeshPreflight({ positions: mesh.positions, indices: openIndices });
    expect(result.status).toBe("invalid-for-master-mold");
    expect(result.issues.some((issue) => issue.code === "open_boundary_edge")).toBe(true);
  });

  it("classifies a non-manifold edge (a fin sharing an existing edge) as invalid-for-master-mold", () => {
    const mesh = closedBoxMesh();
    // A third triangle glued onto the existing 0-2 diagonal edge of the
    // bottom face (a "fin"): that edge now has three users instead of two.
    const positions = [...mesh.positions, 0, -2, 4];
    const finVertex = positions.length / 3 - 1;
    const indices = [...mesh.indices, 0, 2, finVertex];
    const result = runMeshPreflight({ positions, indices });
    expect(result.status).toBe("invalid-for-master-mold");
    expect(result.issues.some((issue) => issue.code === "non_manifold_edge")).toBe(true);
  });

  it("classifies inconsistent winding (a flipped face) as invalid-for-master-mold", () => {
    const mesh = closedBoxMesh();
    const indices = [...mesh.indices];
    // Flip the winding of the bottom face's first triangle (0,2,1 -> 0,1,2):
    // its shared edges now repeat the same directed edge as their neighbor.
    indices[1] = 1;
    indices[2] = 2;
    const result = runMeshPreflight({ positions: mesh.positions, indices });
    expect(result.status).toBe("invalid-for-master-mold");
    expect(result.issues.some((issue) => issue.code === "inconsistent_winding")).toBe(true);
  });

  it("classifies a duplicated face as a reported issue", () => {
    const mesh = closedBoxMesh();
    const indices = [...mesh.indices, 0, 2, 1]; // repeats the bottom face's first triangle exactly.
    const result = runMeshPreflight({ positions: mesh.positions, indices });
    expect(result.issues.some((issue) => issue.code === "duplicate_face" && issue.count > 0)).toBe(true);
  });

  it("classifies two disconnected watertight solids as repairable-warning, not invalid", () => {
    const boxA = closedBoxMesh();
    const boxB = closedBoxMesh();
    const offsetPositions = boxB.positions.map((value, index) => (index % 3 === 0 ? value + 20 : value));
    const vertexOffset = boxA.positions.length / 3;
    const positions = [...boxA.positions, ...offsetPositions];
    const indices = [...boxA.indices, ...boxB.indices.map((value) => value + vertexOffset)];
    const result = runMeshPreflight({ positions, indices });
    expect(result.componentCount).toBe(2);
    expect(result.status).toBe("repairable-warning");
    expect(result.issues.every((issue) => issue.severity !== "error")).toBe(true);
    expect(result.volumeMm3).toBeCloseTo(128, 6);
  });

  it("detects self-intersecting geometry from two interpenetrating solids", () => {
    const boxA = closedBoxMesh();
    const boxB = closedBoxMesh();
    // Shift boxB by 2mm along X (box half-width is 2mm): the two 4mm boxes
    // now overlap by 2mm instead of sitting apart or exactly coincident.
    const shiftedPositions = boxB.positions.map((value, index) => (index % 3 === 0 ? value + 2 : value));
    const vertexOffset = boxA.positions.length / 3;
    const positions = [...boxA.positions, ...shiftedPositions];
    const indices = [...boxA.indices, ...boxB.indices.map((value) => value + vertexOffset)];
    const result = runMeshPreflight({ positions, indices });
    expect(result.selfIntersectionChecked).toBe(true);
    expect(result.issues.some((issue) => issue.code === "self_intersection")).toBe(true);
    expect(result.status).toBe("invalid-for-master-mold");
  });

  it("reports the self-intersection pass as skipped above the bounded triangle budget", async () => {
    const fixture = await buildSimpleBoxFixture(10);
    const result = runMeshPreflight(fixture.mesh, { maxSelfIntersectionTriangleCount: 1 });
    expect(result.selfIntersectionChecked).toBe(false);
    // Everything else still ran.
    expect(result.status).toBe("valid");
  });

  it("rejects empty/malformed geometry outright", () => {
    const result = runMeshPreflight({ positions: [], indices: [] });
    expect(result.status).toBe("invalid-for-master-mold");
  });
});
