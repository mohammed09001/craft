/**
 * Selection reference fixture generator for the native migration.
 *
 * Runs the REAL reference selection-box runtime and model-selection highlight (Three.js, no GPU needed) on fixed
 * inputs and records what they do in native/tests/fixtures/reference/selection-reference.json, which
 * native/tests/tst_selection_equivalence.cpp replays against the native implementation:
 *
 *  - the six selection-box faces (names and corner order) for several bounds;
 *  - for a deterministic set of rays, every pick-face hit (face, distance, point) and the face the hover logic
 *    resolves (getIntersectionFace: the nearest hit that carries a face key);
 *  - the highlight material (colour, emissive, intensity, roughness) for a light and a dark viewport palette;
 *  - the box and overlay styling constants (dash/gap, colours, opacities).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Color, Mesh, MeshStandardMaterial, Raycaster, SphereGeometry, Vector3, type Intersection, type Object3D } from "three";
import { expect, it } from "vitest";

import { createModelSelectionHighlight } from "@/features/viewport/runtime/modelSelectionHighlight";
import {
  OBJECT_SELECTION_BOX_FACE_VALUES,
  createObjectSelectionBoxFaceDefinitions,
  createObjectSelectionBoxRuntime,
} from "@/features/viewport/runtime/objectSelectionBoxRuntime";
import { CLICK_DRAG_THRESHOLD_PX } from "@/features/viewport/runtime/pointerSelection";

const outputPath = resolve(process.env.CRAFT_SELECTION_OUTPUT ?? "selection-reference.json");

type Vec = { x: number; y: number; z: number };
const vec = (v: Vector3): Vec => ({ x: v.x, y: v.y, z: v.z });

const BOUNDS: Array<{ name: string; min: Vec; max: Vec }> = [
  { name: "unit-cube", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
  { name: "bracket-grounded", min: { x: -20, y: -15, z: 0 }, max: { x: 20, y: 15, z: 12 } },
  { name: "offset-negative", min: { x: -50.5, y: 10, z: -3 }, max: { x: -10.25, y: 80, z: 7.75 } },
  { name: "flat-plate", min: { x: -100, y: -60, z: 0 }, max: { x: 100, y: 60, z: 2 } },
];

/** Deterministic rays around a box: through every face centre from outside along the axis and obliquely, from inside,
 *  along edges and corners, and clear misses. */
function raysFor(min: Vec, max: Vec): Array<{ name: string; origin: Vec; direction: Vec }> {
  const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const s = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const far = Math.max(s.x, s.y, s.z) * 3 + 10;
  const rays: Array<{ name: string; origin: Vec; direction: Vec }> = [];
  const axes: Array<[string, Vec]> = [
    ["+x", { x: 1, y: 0, z: 0 }], ["-x", { x: -1, y: 0, z: 0 }], ["+y", { x: 0, y: 1, z: 0 }],
    ["-y", { x: 0, y: -1, z: 0 }], ["+z", { x: 0, y: 0, z: 1 }], ["-z", { x: 0, y: 0, z: -1 }],
  ];
  for (const [label, a] of axes) {
    // From outside, looking at the centre along -axis.
    rays.push({ name: `axis-in${label}`, origin: { x: c.x + a.x * far, y: c.y + a.y * far, z: c.z + a.z * far }, direction: { x: -a.x, y: -a.y, z: -a.z } });
    // From inside, looking out along the axis.
    rays.push({ name: `inside-out${label}`, origin: { x: c.x, y: c.y, z: c.z }, direction: a });
    // Off-centre, a quarter of the way along each remaining axis.
    rays.push({ name: `offcentre${label}`, origin: { x: c.x + a.x * far + s.x * 0.2 * (a.x === 0 ? 1 : 0), y: c.y + a.y * far + s.y * 0.3 * (a.y === 0 ? 1 : 0), z: c.z + a.z * far - s.z * 0.2 * (a.z === 0 ? 1 : 0) }, direction: { x: -a.x, y: -a.y, z: -a.z } });
  }
  // Oblique rays from the camera-like corner directions at several heights.
  const obliques: Vec[] = [
    { x: 1, y: -1, z: 1 }, { x: -1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
    { x: 1, y: -1, z: -1 }, { x: -2, y: 1, z: 0.5 }, { x: 0.3, y: -1, z: 0.1 }, { x: 1, y: 0.05, z: 0.02 },
  ];
  for (const [i, d] of obliques.entries()) {
    const len = Math.hypot(d.x, d.y, d.z);
    const dir = { x: -d.x / len, y: -d.y / len, z: -d.z / len };
    for (const k of [0, 0.35, -0.4]) {
      rays.push({
        name: `oblique${i}/${k}`,
        origin: { x: c.x + (d.x / len) * far + s.x * k * 0.5, y: c.y + (d.y / len) * far - s.y * k * 0.4, z: c.z + (d.z / len) * far + s.z * k * 0.3 },
        direction: dir,
      });
    }
  }
  // Skimming an edge / hitting a corner exactly.
  rays.push({ name: "corner-hit", origin: { x: max.x + far, y: max.y + far, z: max.z + far }, direction: { x: -1 / Math.sqrt(3), y: -1 / Math.sqrt(3), z: -1 / Math.sqrt(3) } });
  rays.push({ name: "edge-skim", origin: { x: min.x, y: min.y - far, z: c.z }, direction: { x: 0, y: 1, z: 0 } });
  // Clear misses.
  rays.push({ name: "miss-parallel", origin: { x: max.x + far, y: max.y + 1, z: c.z }, direction: { x: -1, y: 0, z: 0 } });
  rays.push({ name: "miss-away", origin: { x: max.x + far, y: c.y, z: c.z }, direction: { x: 1, y: 0, z: 0 } });
  rays.push({ name: "miss-wide", origin: { x: c.x, y: min.y - far, z: max.z + s.z }, direction: { x: 0, y: 1, z: 0 } });
  return rays;
}

function faceHits(intersections: readonly Intersection<Object3D>[]) {
  return intersections
    .filter((i) => typeof i.object.userData.selectionBoxFace === "string")
    .map((i) => ({ face: i.object.userData.selectionBoxFace as string, distance: i.distance, point: vec(i.point) }));
}

it("records the selection box, hover resolution and highlight of the real reference", () => {
  const boxes = BOUNDS.map((b) => {
    const bounds = { min: new Vector3(b.min.x, b.min.y, b.min.z), max: new Vector3(b.max.x, b.max.y, b.max.z) };
    const definitions = createObjectSelectionBoxFaceDefinitions(bounds).map((d) => ({ face: d.face, corners: d.corners.map(vec) }));
    const runtime = createObjectSelectionBoxRuntime(bounds);
    runtime.object.updateWorldMatrix(true, true);
    const raycaster = new Raycaster();
    const rays = raysFor(b.min, b.max).map((r) => {
      raycaster.set(new Vector3(r.origin.x, r.origin.y, r.origin.z), new Vector3(r.direction.x, r.direction.y, r.direction.z).normalize());
      const intersections = raycaster.intersectObject(runtime.object, true);
      runtime.clearHoveredFace();
      runtime.updateHoveredFaceFromIntersections(intersections);
      return { ...r, hits: faceHits(intersections), hovered: runtime.getHoveredFace() };
    });
    runtime.clearHoveredFace();
    const position = runtime.object.geometry.getAttribute("position");
    const lineDistance = runtime.object.geometry.getAttribute("lineDistance");
    const edges = Array.from({ length: position.count / 2 }, (_, i) => ({
      from: { x: position.getX(i * 2), y: position.getY(i * 2), z: position.getZ(i * 2) },
      to: { x: position.getX(i * 2 + 1), y: position.getY(i * 2 + 1), z: position.getZ(i * 2 + 1) },
      distanceAtFrom: lineDistance.getX(i * 2),
      distanceAtTo: lineDistance.getX(i * 2 + 1),
    }));
    const material = runtime.object.material;

    runtime.updateHoveredFace("top");
    const hover = runtime.object.children.find((o) => o.name === "ObjectSelectionBoxFaceHover:top") as Mesh | undefined;
    const hoverMaterial = hover?.material as { color: Color; opacity: number } | undefined;
    runtime.clearHoveredFace();
    runtime.setSelectedFaces(["front"]);
    const selected = runtime.object.children.find((o) => o.name === "ObjectSelectionBoxFaceSelected:front") as Mesh | undefined;
    const selectedMaterial = selected?.material as { color: Color; opacity: number } | undefined;
    runtime.dispose();

    return {
      name: b.name,
      min: b.min,
      max: b.max,
      definitions,
      edges,
      rays,
      style: {
        dashSize: material.dashSize,
        gapSize: material.gapSize,
        lineColorHex: material.color.getHex(),
        lineOpacity: material.opacity,
        hoverColorHex: hoverMaterial?.color.getHex(),
        hoverOpacity: hoverMaterial?.opacity,
        selectedColorHex: selectedMaterial?.color.getHex(),
        selectedOpacity: selectedMaterial?.opacity,
      },
    };
  });

  const highlights = [
    { name: "dark", background: "#0b1118" },
    { name: "light", background: "#f4f6f8" },
    { name: "srgb-grey-808080-is-dark-in-linear-space", background: "#808080" },
    { name: "srgb-grey-bbbbbb-just-dark", background: "#bbbbbb" },
    { name: "srgb-grey-bcbcbc-just-light", background: "#bcbcbc" },
    { name: "saturated-blue", background: "#0000ff" },
    { name: "saturated-yellow", background: "#ffff00" },
  ].map((p) => {
    const mesh = new Mesh(new SphereGeometry(1), new MeshStandardMaterial({ color: 0xb8e3ec, roughness: 0.6 }));
    const highlight = createModelSelectionHighlight();
    highlight.apply(mesh, { background: p.background, gridMajor: "#000000", gridMinor: "#000000" });
    const m = mesh.material as MeshStandardMaterial;
    const out = {
      palette: p.name,
      background: p.background,
      colorHex: m.color.getHex(),
      emissiveHex: m.emissive.getHex(),
      emissiveIntensity: m.emissiveIntensity,
      roughness: m.roughness,
      selectionBoxPresent: highlight.getSelectionBoxBounds() !== null,
      selectionBoxBounds: (() => {
        const b = highlight.getSelectionBoxBounds();
        return b === null ? null : { min: vec(b.min as Vector3), max: vec(b.max as Vector3) };
      })(),
    };
    highlight.clear();
    return out;
  });

  const fixture = {
    generatedFrom: "mold/frontend/src/features/viewport/runtime (objectSelectionBoxRuntime, modelSelectionHighlight, pointerSelection)",
    faceNames: [...OBJECT_SELECTION_BOX_FACE_VALUES],
    clickDragThresholdPx: CLICK_DRAG_THRESHOLD_PX,
    boxes,
    highlights,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 1));
  expect(boxes.length).toBe(BOUNDS.length);
});
