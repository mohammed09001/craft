/**
 * Ground-plane ruler reference fixture generator for the native migration.
 *
 * Runs the REAL reference ruler modules: the label-step selection with its hysteresis, the tick and label layout, the label
 * text, the projection that turns a world length into pixels, and the whole runtime (createGroundPlaneRulerRuntime) through a
 * zoom sequence, recording what it builds each time: whether it rebuilt, the axes, the ticks (positions and lengths), the
 * labels (positions, height, colour) and the materials' colours and opacities. Also records the engineering grid's material
 * colours for the palette strings the application actually passes (three.js cannot parse the "rgba(r g b / a)" form, so the
 * minor grid colour is its default white). Replayed by tst_ground_ruler.cpp and tst_viewport_look.cpp.
 *
 * Label sprites use a canvas texture; jsdom has no 2D canvas, so the label aspect is 1 here and only the sprite HEIGHT is
 * recorded (the width depends on the font).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import { LineSegments, PerspectiveCamera, Sprite, type Object3D } from "three";

import { createEngineeringGrid } from "@/features/viewport/runtime/createEngineeringGrid";
import { createGroundPlaneRulerRuntime } from "@/features/viewport/runtime/createGroundPlaneRulerRuntime";
import {
  computeGroundPlaneRulerLayout,
  formatRulerLabel,
  projectWorldLengthToPixels,
  rulerStepBounds,
  selectRulerLabelStep,
} from "@/features/viewport/runtime/groundPlaneRuler";

const outputPath = resolve(process.env.CRAFT_RULER_OUTPUT ?? "ruler-reference.json");

const DARK = { background: "rgb(11, 17, 24)", gridMajor: "rgb(48, 57, 67)", gridMinor: "rgba(100 114 129 / 0.16)" };
const LIGHT = { background: "rgb(247, 249, 251)", gridMajor: "rgb(183, 195, 207)", gridMinor: "rgba(135 149 163 / 0.2)" };

function camera(distance: number, aspect: number, direction = [1, -1, 0.78], target = [0, 0, 0]) {
  const c = new PerspectiveCamera(45, aspect, 0.1, 2000);
  c.up.set(0, 0, 1);
  const length = Math.hypot(direction[0]!, direction[1]!, direction[2]!);
  c.position.set(
    target[0]! + (direction[0]! / length) * distance,
    target[1]! + (direction[1]! / length) * distance,
    target[2]! + (direction[2]! / length) * distance,
  );
  c.lookAt(target[0]!, target[1]!, target[2]!);
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
  return c;
}

function describeRuntimeChildren(children: readonly Object3D[]) {
  const axes = children.find((c) => c.name === "Ground Plane Ruler Axes") as LineSegments | undefined;
  const ticks = children.find((c) => c.name === "Ground Plane Ruler Ticks") as LineSegments | undefined;
  const sprites = children.filter((c) => c instanceof Sprite) as Sprite[];
  const lineMaterial = (line: LineSegments | undefined) => {
    const m = line?.material as unknown as { color: { getHex(): number }; opacity: number; transparent: boolean } | undefined;
    return m === undefined ? null : { colorHex: m.color.getHex(), opacity: m.opacity, transparent: m.transparent };
  };
  const positions = (line: LineSegments | undefined) => (line === undefined ? [] : Array.from(line.geometry.getAttribute("position").array as Float32Array));
  const tickVertices = positions(ticks);
  return {
    axes: { vertices: positions(axes), material: lineMaterial(axes) },
    ticks: { vertices: tickVertices, material: lineMaterial(ticks) },
    labels: sprites.map((s) => ({
      x: s.position.x,
      y: s.position.y,
      z: s.position.z,
      height: s.scale.y,
      colorHex: (s.material as unknown as { color: { getHex(): number } }).color.getHex(),
      depthTest: (s.material as unknown as { depthTest: boolean }).depthTest,
      depthWrite: (s.material as unknown as { depthWrite: boolean }).depthWrite,
    })),
  };
}

function runtimeSequence(palette: typeof DARK, gridConfig: { size: number; minorStep: number; majorStep: number }, distances: number[], viewportHeight: number, aspect: number) {
  const cam = camera(distances[0]!, aspect);
  const canvas = { clientHeight: viewportHeight } as unknown as HTMLCanvasElement;
  const runtime = createGroundPlaneRulerRuntime({ camera: cam, canvas, palette, invalidate: () => undefined });
  runtime.setGridConfig(gridConfig);
  let previousFirstChild: Object3D | undefined;
  const steps: unknown[] = [];
  for (const distance of distances) {
    const c = camera(distance, aspect);
    cam.position.copy(c.position);
    cam.quaternion.copy(c.quaternion);
    cam.updateMatrixWorld(true);
    runtime.updateForCamera();
    const first = runtime.object.children[0];
    const rebuilt = first !== previousFirstChild;
    previousFirstChild = first;
    steps.push({
      distance,
      pixelsPerWorldUnit: projectWorldLengthToPixels(cam, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1, viewportHeight),
      rebuilt,
      ...describeRuntimeChildren(runtime.object.children),
    });
  }
  runtime.dispose();
  return steps;
}

it("records the ground-plane ruler of the reference", () => {
  // --- layout and label text -------------------------------------------------------------------------------------------
  const layouts = [[110, 10], [110, 20], [110, 50], [25, 5], [100, 25], [12.5, 2.5], [0.5, 0.1], [110, 0], [0, 10], [-5, 10], [110, 10, 0], [110, 10, 2.5], [110, 10, 4]]
    .map(([half, step, divisions]) => {
      const layout = divisions === undefined ? computeGroundPlaneRulerLayout(half!, step!) : computeGroundPlaneRulerLayout(half!, step!, divisions);
      return { halfExtent: half, step, minorDivisions: divisions ?? null, ticks: layout.ticks.map((t) => [t.position, t.major]), labels: layout.labels.map((l) => [l.value, l.position]) };
    });
  const formats = [0, -0, 1, -1, 0.4, 0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 19.5, -19.6, 100, 1234567.5, 1e21, 0.1 + 0.2].map((v) => ({ value: Object.is(v, -0) ? "-0" : v, text: formatRulerLabel(v) }));

  // --- step selection, with and without the current step (hysteresis) ------------------------------------------------
  const bounds = [rulerStepBounds({ minorStep: 10, size: 220 }), rulerStepBounds({ minorStep: 1, size: 50 }), rulerStepBounds({ minorStep: 0.5, size: 20 })];
  const selections: unknown[] = [];
  for (const b of bounds) {
    for (const ppu of [0.02, 0.2, 0.5, 1, 1.7, 2, 3.7, 5, 8, 12, 40, 160]) {
      for (const current of [null, b.minStep, b.minStep * 2, b.minStep * 5, b.maxStep]) {
        selections.push({ minStep: b.minStep, maxStep: b.maxStep, pixelsPerWorldUnit: ppu, currentStep: current, step: selectRulerLabelStep({ pixelsPerWorldUnit: ppu, minStep: b.minStep, maxStep: b.maxStep, currentStep: current }) });
      }
    }
  }
  const invalidSelections = [
    { pixelsPerWorldUnit: 0, minStep: 10, maxStep: 110 },
    { pixelsPerWorldUnit: -1, minStep: 10, maxStep: 110 },
    { pixelsPerWorldUnit: Number.NaN, minStep: 10, maxStep: 110 },
    { pixelsPerWorldUnit: 2, minStep: 0, maxStep: 110 },
    { pixelsPerWorldUnit: 2, minStep: 10, maxStep: 5 },
    { pixelsPerWorldUnit: 2, minStep: 10, maxStep: 110, minLabelPixels: 0 },
    { pixelsPerWorldUnit: 2, minStep: 10, maxStep: 110, minLabelPixels: 100, maxLabelPixels: 50 },
  ].map((s) => ({ ...s, pixelsPerWorldUnit: Number.isNaN(s.pixelsPerWorldUnit) ? "NaN" : s.pixelsPerWorldUnit, step: selectRulerLabelStep(s) }));

  // --- projection of a world length into pixels ----------------------------------------------------------------------
  const projections = [
    { distance: 100, aspect: 1.5, direction: [1, -1, 0.78], height: 640 },
    { distance: 60, aspect: 1.5, direction: [1, -1, 0.78], height: 640 },
    { distance: 400, aspect: 1.5, direction: [1, -1, 0.78], height: 640 },
    { distance: 100, aspect: 1, direction: [0, 0, 1], height: 600 },
    { distance: 100, aspect: 2, direction: [0, -1, 0.2], height: 480 },
    { distance: 100, aspect: 1.5, direction: [1, 0, 0], height: 640 },
  ].map((p) => {
    const c = camera(p.distance, p.aspect, p.direction);
    return { ...p, pixels: projectWorldLengthToPixels(c, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1, p.height), pixelsAlongY: projectWorldLengthToPixels(c, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 10, p.height) };
  });

  // --- the runtime through a zoom sequence ------------------------------------------------------------------------------
  const zoom = [400, 300, 220, 160, 120, 90, 70, 55, 45, 60, 80, 120, 200, 320, 600];
  const runtime = {
    darkGrid220: runtimeSequence(DARK, { size: 220, minorStep: 10, majorStep: 50 }, zoom, 640, 1.5),
    lightGrid220: runtimeSequence(LIGHT, { size: 220, minorStep: 10, majorStep: 50 }, [100], 640, 1.5),
    smallPartGrid: runtimeSequence(DARK, { size: 60, minorStep: 2, majorStep: 10 }, [150, 100, 60, 40, 30, 25, 40, 80, 150], 640, 1.5),
  };

  // --- the engineering grid's colours for the palette strings the application passes ----------------------------------
  const gridColours = (palette: typeof DARK) => {
    const grid = createEngineeringGrid(palette, { size: 220, minorStep: 10, majorStep: 50 });
    const minor = grid.userData.minorMaterial as unknown as { color: { getHex(): number }; opacity: number };
    const major = grid.userData.majorMaterial as unknown as { color: { getHex(): number }; opacity: number };
    return { minorColorHex: minor.color.getHex(), minorOpacity: minor.opacity, majorColorHex: major.color.getHex(), majorOpacity: major.opacity };
  };

  const result = { layouts, formats, selections, invalidSelections, projections, runtime, grid: { dark: gridColours(DARK), light: gridColours(LIGHT) } };

  // The hysteresis exists: somewhere in the zoom sequence a step is kept although another would be nearer the band centre.
  expect(runtime.darkGrid220.some((s) => (s as { rebuilt: boolean }).rebuilt === false)).toBe(true);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result));
});
