import {
  BoxGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { describe, expect, it } from "vitest";

import { createFeatureEdgeOverlay } from "../runtime/featureEdgeOverlay";

describe("Feature Edge Overlay", () => {
  it("creates sharp feature edge lines in a dedicated container group", () => {
    const overlay = createFeatureEdgeOverlay();
    const box = new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial());
    box.name = "TestMoldBody";

    overlay.updateFromMoldMeshes([box]);

    expect(overlay.group.name).toBe("ReferenceMoldFeatureEdges");
    expect(overlay.group.children).toHaveLength(1);

    const edgeLine = overlay.group.children[0];
    expect(edgeLine).toBeDefined();
    if (edgeLine !== undefined) {
      expect(edgeLine.name).toBe("TestMoldBody_Edges");
      expect(edgeLine.visible).toBe(true);
      expect(edgeLine).toBeInstanceOf(LineSegments);
      overlay.setColor(0x123456);
      expect((edgeLine as LineSegments).material).toBeInstanceOf(LineBasicMaterial);
      expect(((edgeLine as LineSegments).material as LineBasicMaterial).color.getHex()).toBe(0x123456);
      expect(Object.hasOwn(edgeLine, "raycast")).toBe(true);
    }

    box.geometry.dispose();
    box.material.dispose();
    overlay.dispose();
    expect(overlay.group.children).toHaveLength(0);
  });
});
