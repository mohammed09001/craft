import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";

import { calculateAssemblyVisualBounds } from "../runtime/assemblyVisualBounds";

describe("Assembly Visual Bounds", () => {
  it("calculates unified bounding box across multiple mold bodies and model roots", () => {
    const moldRoot = new Group();
    const modelRoot = new Group();

    const bodyA = new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial());
    bodyA.position.set(-20, 0, 0);

    const bodyB = new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial());
    bodyB.position.set(20, 0, 0);

    moldRoot.add(bodyA, bodyB);

    const bounds = calculateAssemblyVisualBounds(moldRoot, modelRoot);

    expect(bounds).not.toBeNull();
    if (bounds !== null) {
      expect(bounds.min.x).toBeCloseTo(-25);
      expect(bounds.max.x).toBeCloseTo(25);
    }

    bodyA.geometry.dispose();
    bodyB.geometry.dispose();
  });

  it("returns null when no visible meshes exist", () => {
    const moldRoot = new Group();
    const modelRoot = new Group();

    const bounds = calculateAssemblyVisualBounds(moldRoot, modelRoot);
    expect(bounds).toBeNull();
  });
});
