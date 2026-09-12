import { Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import { createMasterMoldBody3dRuntime } from "../runtime/masterMoldBody3dRuntime";
import type { MoldBodyData } from "../../mold-generation/reference-mold-definition/orthogonalMold";

const bodyA: MoldBodyData = {
  id: "master-a",
  name: "Master Mold A",
  visible: true,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
  triangleCount: 2,
  volumeMm3: 1000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 10, 0, 10],
    indices: [0, 1, 2, 3, 4, 5],
  },
};

const bodyB: MoldBodyData = { ...bodyA, id: "master-b", name: "Master Mold B" };

describe("masterMoldBody3dRuntime", () => {
  it("renders every current Master Mold body as a visible mesh", () => {
    const runtime = createMasterMoldBody3dRuntime(vi.fn());

    runtime.setBodies([bodyA, bodyB]);

    const meshA = runtime.object.getObjectByName("Master Mold A") as Mesh;
    const meshB = runtime.object.getObjectByName("Master Mold B") as Mesh;
    expect(meshA).toBeDefined();
    expect(meshB).toBeDefined();
    expect(meshA.visible).toBe(true);
    expect(meshB.visible).toBe(true);

    runtime.dispose();
  });

  it("skips rebuilding identical bodies but rebuilds on a real change", () => {
    const invalidate = vi.fn();
    const runtime = createMasterMoldBody3dRuntime(invalidate);

    runtime.setBodies([bodyA]);
    const firstMesh = runtime.object.getObjectByName("Master Mold A");
    invalidate.mockClear();

    runtime.setBodies([bodyA]);
    expect(runtime.object.getObjectByName("Master Mold A")).toBe(firstMesh);
    expect(invalidate).not.toHaveBeenCalled();

    runtime.setBodies([bodyA, bodyB]);
    expect(invalidate).toHaveBeenCalled();
    expect(runtime.object.getObjectByName("Master Mold B")).toBeDefined();

    runtime.dispose();
  });

  it("switches between solid and glass materials", () => {
    const runtime = createMasterMoldBody3dRuntime(vi.fn());
    runtime.setBodies([bodyA]);

    expect((runtime.object.getObjectByName("Master Mold A") as Mesh).material).toBeInstanceOf(MeshStandardMaterial);

    runtime.setAppearanceMode("glass");
    expect((runtime.object.getObjectByName("Master Mold A") as Mesh).material).toBeInstanceOf(MeshPhysicalMaterial);

    runtime.setAppearanceMode("solid");
    expect((runtime.object.getObjectByName("Master Mold A") as Mesh).material).toBeInstanceOf(MeshStandardMaterial);

    runtime.dispose();
  });

  it("clears every child and leaves no orphans on empty bodies, and on dispose", () => {
    const runtime = createMasterMoldBody3dRuntime(vi.fn());
    runtime.setBodies([bodyA, bodyB]);
    expect(runtime.object.children.length).toBeGreaterThan(0);

    runtime.setBodies([]);
    expect(runtime.object.children.length).toBe(0);

    runtime.setBodies([bodyA]);
    expect(runtime.object.getObjectByName("Master Mold A")).toBeDefined();

    runtime.dispose();
    expect(runtime.object.children.length).toBe(0);
    expect(runtime.object.parent).toBeNull();
  });

  it("stays isolated from a reference mold block group added to the same scene", () => {
    const runtime = createMasterMoldBody3dRuntime(vi.fn());
    const referenceMoldGroup = new Group();
    referenceMoldGroup.name = "ReferenceMoldBlockGroup";

    runtime.setBodies([bodyA]);

    expect(runtime.object.name).toBe("MasterMoldBodyGroup");
    expect(referenceMoldGroup.children.length).toBe(0);

    runtime.dispose();
  });
});
