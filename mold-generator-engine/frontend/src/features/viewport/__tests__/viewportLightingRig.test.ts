import { Box3, DirectionalLight, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createViewportLightingRig } from "../runtime/viewportLightingRig";

describe("Viewport Lighting Rig", () => {
  it("constructs a 5-point CAD studio lighting rig", () => {
    const rig = createViewportLightingRig();

    expect(rig.object.name).toBe("cad-lighting-rig");
    expect(rig.keyLight).toBeInstanceOf(DirectionalLight);
    expect(rig.fillLight).toBeInstanceOf(DirectionalLight);
    expect(rig.rimLight).toBeInstanceOf(DirectionalLight);
    expect(rig.keyLight.castShadow).toBe(true);

    // Verify key light intensity is balanced
    expect(rig.keyLight.intensity).toBe(1.45);
    expect(rig.ambientLight.intensity).toBe(0.15);
  });

  it("dynamically adapts key light shadow camera bounds to active mold bounds", () => {
    const rig = createViewportLightingRig();
    const moldBounds = new Box3(
      new Vector3(-50, -50, -50),
      new Vector3(50, 50, 50),
    );

    rig.updateBounds(moldBounds);

    expect(rig.keyLight.shadow.camera.left).toBeLessThan(0);
    expect(rig.keyLight.shadow.camera.right).toBeGreaterThan(0);
    expect(rig.keyLight.target.position.x).toBe(0);
    expect(rig.keyLight.target.position.y).toBe(0);
    expect(rig.keyLight.target.position.z).toBe(0);
  });
});
