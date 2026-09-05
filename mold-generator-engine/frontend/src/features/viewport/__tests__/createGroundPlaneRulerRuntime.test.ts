import {
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Sprite,
} from "three";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/viewport/runtime/rulerLabelTexture", async () => {
  const { CanvasTexture } = await import("three");

  return {
    createRulerLabelTexture: () => ({
      texture: new CanvasTexture(document.createElement("canvas")),
      aspect: 2,
    }),
  };
});

import { createGroundPlaneRulerRuntime } from "../runtime/createGroundPlaneRulerRuntime";

function createTestRuntime() {
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
  camera.up.set(0, 0, 1);
  camera.position.set(95, -120, 85);
  camera.lookAt(0, 0, 10);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientHeight", {
    configurable: true,
    value: 600,
  });

  const invalidate = vi.fn();
  const runtime = createGroundPlaneRulerRuntime({
    camera,
    canvas,
    palette: {
      background: "#000000",
      gridMajor: "#333333",
      gridMinor: "#222222",
    },
    invalidate,
  });

  return { runtime, camera, canvas, invalidate };
}

describe("Ground Plane Ruler Runtime", () => {
  it("creates a named passive group", () => {
    const { runtime } = createTestRuntime();

    expect(runtime.object).toBeInstanceOf(Group);
    expect(runtime.object.name).toBe("Ground Plane Ruler");
    expect(runtime.object.userData.passiveVisualLayer).toBe(true);
  });

  it("builds axes, ticks, and labels on the first camera update", () => {
    const { runtime } = createTestRuntime();

    runtime.updateForCamera();

    const axes = runtime.object.children.find(
      (child) =>
        child instanceof LineSegments &&
        child.name === "Ground Plane Ruler Axes",
    );
    const ticks = runtime.object.children.find(
      (child) =>
        child instanceof LineSegments &&
        child.name === "Ground Plane Ruler Ticks",
    );
    const labels = runtime.object.children.filter(
      (child) => child instanceof Sprite,
    );

    expect(axes).toBeDefined();
    expect(ticks).toBeDefined();
    expect(labels.length).toBeGreaterThan(0);

    const positions = (axes as LineSegments).geometry.getAttribute("position");
    expect(positions.count).toBe(4);
    expect(
      (axes as LineSegments).material as LineBasicMaterial,
    ).toMatchObject({ transparent: true });
  });

  it("keeps the same geometry when the camera step is unchanged", () => {
    const { runtime } = createTestRuntime();

    runtime.updateForCamera();
    const firstAxis = runtime.object.children.find(
      (child) =>
        child instanceof LineSegments &&
        child.name === "Ground Plane Ruler Axes",
    );

    runtime.updateForCamera();
    const secondAxis = runtime.object.children.find(
      (child) =>
        child instanceof LineSegments &&
        child.name === "Ground Plane Ruler Axes",
    );

    expect(secondAxis).toBe(firstAxis);
  });

  it("re-extents the ruler after a new grid config", () => {
    const { runtime, invalidate } = createTestRuntime();

    runtime.setGridConfig({
      majorStep: 500,
      minorStep: 100,
      size: 2000,
    });
    runtime.updateForCamera();

    const axes = runtime.object.children.find(
      (child) =>
        child instanceof LineSegments &&
        child.name === "Ground Plane Ruler Axes",
    ) as LineSegments;
    const positions = axes.geometry.getAttribute("position");

    let maxX = 0;
    for (let index = 0; index < positions.count; index += 1) {
      maxX = Math.max(maxX, positions.getX(index));
    }

    expect(maxX).toBe(1000);
    expect(invalidate).toHaveBeenCalled();
  });

  it("updates material colors on palette changes", () => {
    const { runtime } = createTestRuntime();

    runtime.updateForCamera();
    runtime.setPalette({
      background: "#ffffff",
      gridMajor: "#444444",
      gridMinor: "#333333",
    });

    const axes = runtime.object.children.find(
      (child) =>
        child instanceof LineSegments &&
        child.name === "Ground Plane Ruler Axes",
    ) as LineSegments;
    const firstLabel = runtime.object.children.find(
      (child) => child instanceof Sprite,
    ) as Sprite;

    expect((axes.material as LineBasicMaterial).color.getHex()).toBe(0x444444);
    expect(firstLabel.material.color.getHex()).toBe(0x1d4ed8);
  });

  it("disposes all owned children and detaches from the parent", () => {
    const { runtime } = createTestRuntime();
    const scene = new Group();
    scene.add(runtime.object);

    runtime.updateForCamera();
    runtime.dispose();
    runtime.dispose();

    expect(runtime.object.children).toHaveLength(0);
    expect(runtime.object.parent).toBeNull();
  });
});
