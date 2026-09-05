import {
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createReferenceMoldBlock3dRuntime,
  resolveBodyRole,
} from "../runtime/referenceMoldBlock3dRuntime";
import type { ReferenceMoldDefinition } from "../../mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";
import type { MoldBodyData } from "../../mold-generation/reference-mold-definition/orthogonalMold";

const baseBody: MoldBodyData = {
  id: "body-1",
  name: "M1",
  visible: true,
  bounds: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 10, z: 10 },
  },
  centroid: { x: 5, y: 5, z: 5 },
  triangleCount: 12,
  volumeMm3: 1000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 10, 0, 10],
    indices: [0, 1, 2, 3, 4, 5],
  },
};

const definition: ReferenceMoldDefinition = {
  schemaVersion: 1,
  definitionId: "definition-1",
  modelId: "model-1",
  coordinateSystem: {
    units: "millimeters",
    upAxis: "Z",
  },
  selectionBoxBounds: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 10, z: 10 },
  },
  referenceMoldBlock: {
    clearanceMm: 10,
    bounds: {
      min: { x: -10, y: -10, z: -10 },
      max: { x: 20, y: 20, z: 20 },
    },
  },
  usedFaces: [],
  selectedFaceIds: [],
  moldBodies: [baseBody],
};

describe("reference mold appearance runtime", () => {
  it("switches mold bodies between solid and glass materials only", () => {
    const invalidate = vi.fn();
    const runtime = createReferenceMoldBlock3dRuntime(invalidate);
    const target = new Group();

    runtime.setTarget("model-1", target);
    runtime.setDefinition(definition);

    const moldBody = runtime.object.getObjectByName("M1") as Mesh;
    expect(moldBody).toBeDefined();
    expect(moldBody.material).toBeInstanceOf(MeshStandardMaterial);

    runtime.setAppearanceMode("glass");

    const glassBody = runtime.object.getObjectByName("M1") as Mesh;
    expect(glassBody.material).toBeInstanceOf(MeshPhysicalMaterial);
    expect((glassBody.material as MeshPhysicalMaterial).transmission).toBeGreaterThan(0);

    runtime.setAppearanceMode("solid");
    expect((runtime.object.getObjectByName("M1") as Mesh).material).toBeInstanceOf(
      MeshStandardMaterial,
    );

    runtime.dispose();
  });

  it("renders mold bodies as visible solid and glass meshes attached to the target scene", () => {
    const invalidate = vi.fn();
    const runtime = createReferenceMoldBlock3dRuntime(invalidate);
    const target = new Group();

    runtime.setTarget("model-1", target);
    runtime.setDefinition(definition);

    expect(runtime.object).toBeDefined();
    const moldBodiesGroup = runtime.object.getObjectByName("ReferenceMoldBodies") as Group;
    expect(moldBodiesGroup).toBeDefined();
    const bodyMesh = moldBodiesGroup.getObjectByName("M1") as Mesh;
    expect(bodyMesh).toBeDefined();
    expect(bodyMesh.visible).toBe(true);

    runtime.dispose();
  });

  it("renders and refreshes distinct outer-mold and cavity face runs", () => {
    const invalidate = vi.fn();
    const runtime = createReferenceMoldBlock3dRuntime(invalidate);
    const target = new Group();

    const faceRunBody: MoldBodyData = {
      ...baseBody,
      id: "multi-material-body",
      name: "MultiMaterialMoldBody",
      mesh: {
        ...baseBody.mesh,
        faceRuns: [
          { startTriangle: 0, triangleCount: 1, role: "outer-mold" },
          { startTriangle: 1, triangleCount: 1, role: "cavity-surface" },
        ],
      },
    };

    const multiDefinition: ReferenceMoldDefinition = {
      ...definition,
      moldBodies: [faceRunBody],
    };

    runtime.setTarget("model-1", target);
    runtime.setDefinition(multiDefinition);

    const bodyMesh = runtime.object.getObjectByName("MultiMaterialMoldBody") as Mesh;
    expect(bodyMesh).toBeDefined();
    expect(Array.isArray(bodyMesh.material)).toBe(true);

    const materials = bodyMesh.material as MeshStandardMaterial[];
    expect(materials.length).toBe(2);

    // Outer mold face: Engineering Red
    expect(materials[0]!.color.getHex()).toBe(0xba4a44);
    // Cavity face: deeper red with distinct physical response
    expect(materials[1]!.color.getHex()).toBe(0x9b3934);
    expect(bodyMesh.castShadow).toBe(true);
    expect(bodyMesh.receiveShadow).toBe(true);

    // Verify BufferGeometry groups
    expect(bodyMesh.geometry.groups.length).toBe(2);
    expect(bodyMesh.geometry.groups[0]!.start).toBe(0);
    expect(bodyMesh.geometry.groups[0]!.count).toBe(3);
    expect(bodyMesh.geometry.groups[1]!.start).toBe(3);
    expect(bodyMesh.geometry.groups[1]!.count).toBe(3);

    expect(() => runtime.setAppearanceMode("glass")).not.toThrow();
    expect((bodyMesh.material as MeshPhysicalMaterial[]).every(
      (material) => material instanceof MeshPhysicalMaterial,
    )).toBe(true);
    expect(bodyMesh.castShadow).toBe(false);
    expect(bodyMesh.receiveShadow).toBe(false);

    runtime.setPalette({
      background: "rgb(245, 247, 250)",
      gridMajor: "rgb(100, 100, 100)",
      gridMinor: "rgb(150, 150, 150)",
    });
    runtime.setAppearanceMode("solid");
    const lightMaterials = bodyMesh.material as MeshStandardMaterial[];
    expect(lightMaterials[0]!.color.getHex()).toBe(0xc4524c);
    expect(lightMaterials[1]!.color.getHex()).toBe(0xa33d38);

    runtime.dispose();
  });

  it("keeps render-only feature edges isolated from canonical feature overlays", () => {
    const invalidate = vi.fn();
    const runtime = createReferenceMoldBlock3dRuntime(invalidate);
    const target = new Group();

    runtime.setTarget("model-1", target);
    runtime.setDefinition(definition);

    // Verify zero synthetic overlays exist in scene graph
    expect(runtime.object.getObjectByName("RegKeyOverlay_feature-1")).toBeUndefined();
    expect(runtime.object.getObjectByName("SprueOverlayFunnel")).toBeUndefined();
    expect(runtime.object.getObjectByName("SprueOverlayStem")).toBeUndefined();
    expect(runtime.object.getObjectByName("ReferenceMoldFeatureEdges")).toBeDefined();

    // Verification of atomic disposal
    runtime.setDefinition(null);
    expect(runtime.object.children.length).toBe(0);

    runtime.dispose();
  });

  it("does not recolor a complete cavity-affected body without face provenance", () => {
    expect(resolveBodyRole({ cavityAffected: true })).toBe("outer-mold");
  });

  it("enforces canonical ownership and zero orphaned objects on setDefinition(null), clearTarget, and dispose", () => {
    const invalidate = vi.fn();
    const runtime = createReferenceMoldBlock3dRuntime(invalidate);
    const target = new Object3D();

    runtime.setTarget("model-1", target);
    runtime.setDefinition(definition);

    expect(runtime.object.children.length).toBeGreaterThan(0);

    // Setting definition to null must dispose all geometries/materials and clear all children
    runtime.setDefinition(null);
    expect(runtime.object.children.length).toBe(0);

    // Setting definition again creates canonical body meshes
    runtime.setDefinition(definition);
    expect(runtime.object.getObjectByName("M1")).toBeDefined();

    // clearTarget disposes and clears all children
    runtime.clearTarget();
    expect(runtime.object.children.length).toBe(0);
    expect(target.children.length).toBe(0);

    // dispose removes all objects and references
    runtime.dispose();
    expect(runtime.object.children.length).toBe(0);
  });
});
