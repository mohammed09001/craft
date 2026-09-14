import { Group, Mesh, type BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createReferenceMoldBlock3dRuntime,
} from "../runtime/referenceMoldBlock3dRuntime";
import type { ReferenceMoldDefinition } from "../../mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";
import type { MoldBodyData } from "../../mold-generation/reference-mold-definition/orthogonalMold";

// Execution 05 Article 02: the eye buttons must control the actual rendered
// objects. Flipping a body's `visible` changes only presentation state --
// the geometry identity is intentionally unchanged -- so the runtime must
// synchronize the existing Three.js meshes by stable body id instead of
// skipping the update or forcing a full geometry rebuild.

const baseBody: MoldBodyData = {
  id: "body-1",
  name: "M1",
  visible: true,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
  centroid: { x: 5, y: 5, z: 5 },
  triangleCount: 12,
  volumeMm3: 1000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 10, 10, 0, 10],
    indices: [0, 1, 2, 3, 4, 5],
  },
};

const secondBody: MoldBodyData = {
  ...baseBody,
  id: "body-2",
  name: "M2",
  bounds: { min: { x: 10, y: 0, z: 0 }, max: { x: 20, y: 10, z: 10 } },
  centroid: { x: 15, y: 5, z: 5 },
};

const versioned = (body: MoldBodyData, version: string) => ({ ...body, geometryVersion: version });

function definitionWith(bodies: MoldBodyData[]): ReferenceMoldDefinition {
  return {
    schemaVersion: 1,
    definitionId: "definition-1",
    modelId: "model-1",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
    referenceMoldBlock: {
      clearanceMm: 10,
      bounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 20, y: 20, z: 20 } },
    },
    usedFaces: [],
    moldBodies: bodies,
  };
}

function meshByBodyId(group: Group): Map<string, Mesh> {
  const found = new Map<string, Mesh>();
  group.traverse((descendant) => {
    if (!(descendant instanceof Mesh)) return;
    const bodyId = descendant.userData.moldBodyId;
    if (typeof bodyId === "string") found.set(bodyId, descendant);
  });
  return found;
}

function presentationSnapshot(group: Group) {
  const meshes = meshByBodyId(group);
  const snapshot = new Map<string, {
    mesh: Mesh;
    geometry: BufferGeometry;
    visible: boolean;
    boundsMinX: number | null;
    triangleCount: number;
  }>();
  for (const [id, mesh] of meshes) {
    snapshot.set(id, {
      mesh,
      geometry: mesh.geometry,
      visible: mesh.visible,
      boundsMinX: mesh.geometry.boundingBox?.min.x ?? null,
      triangleCount: mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.getAttribute("position").count / 3,
    });
  }
  return snapshot;
}

function setup() {
  const invalidate = vi.fn();
  const runtime = createReferenceMoldBlock3dRuntime(invalidate);
  const target = new Group();
  runtime.setTarget("model-1", target);
  runtime.setDefinition(definitionWith([
    versioned(baseBody, "v1"),
    versioned(secondBody, "v1"),
  ]));
  const group = runtime.object;
  return { runtime, group };
}

describe("reference mold runtime presentation synchronization (Execution 05 Article 02)", () => {
  it("hides the actual Three.js mesh when a body's visibility flips to false, without rebuilding geometry", () => {
    const { runtime, group } = setup();
    const before = presentationSnapshot(group);

    // Same geometry identity (same geometryVersion), only `visible` flipped.
    runtime.setDefinition(definitionWith([
      versioned({ ...baseBody, visible: false }, "v1"),
      versioned(secondBody, "v1"),
    ]));

    const after = presentationSnapshot(group);
    expect(after.get("body-1")?.visible).toBe(false);
    expect(after.get("body-2")?.visible).toBe(true);

    // Presentation-only change: identical mesh and geometry objects, no
    // geometry reconstruction, unchanged bounds and triangle counts.
    expect(after.get("body-1")?.mesh).toBe(before.get("body-1")?.mesh);
    expect(after.get("body-1")?.geometry).toBe(before.get("body-1")?.geometry);
    expect(after.get("body-1")?.boundsMinX).toBe(before.get("body-1")?.boundsMinX);
    expect(after.get("body-1")?.triangleCount).toBe(before.get("body-1")?.triangleCount);
    expect(after.get("body-2")?.geometry).toBe(before.get("body-2")?.geometry);

    runtime.dispose();
  });

  it("restores visibility when the body flips back to true", () => {
    const { runtime, group } = setup();

    runtime.setDefinition(definitionWith([
      versioned({ ...baseBody, visible: false }, "v1"),
      versioned(secondBody, "v1"),
    ]));
    expect(meshByBodyId(group).get("body-1")?.visible).toBe(false);

    runtime.setDefinition(definitionWith([
      versioned(baseBody, "v1"),
      versioned(secondBody, "v1"),
    ]));
    expect(meshByBodyId(group).get("body-1")?.visible).toBe(true);

    runtime.dispose();
  });

  it("toggles multiple bodies independently", () => {
    const { runtime, group } = setup();

    runtime.setDefinition(definitionWith([
      versioned({ ...baseBody, visible: false }, "v1"),
      versioned(secondBody, "v1"),
    ]));
    let meshes = meshByBodyId(group);
    expect(meshes.get("body-1")?.visible).toBe(false);
    expect(meshes.get("body-2")?.visible).toBe(true);

    runtime.setDefinition(definitionWith([
      versioned({ ...baseBody, visible: false }, "v1"),
      versioned({ ...secondBody, visible: false }, "v1"),
    ]));
    meshes = meshByBodyId(group);
    expect(meshes.get("body-1")?.visible).toBe(false);
    expect(meshes.get("body-2")?.visible).toBe(false);

    runtime.setDefinition(definitionWith([
      versioned(baseBody, "v1"),
      versioned({ ...secondBody, visible: false }, "v1"),
    ]));
    meshes = meshByBodyId(group);
    expect(meshes.get("body-1")?.visible).toBe(true);
    expect(meshes.get("body-2")?.visible).toBe(false);

    runtime.dispose();
  });
});
