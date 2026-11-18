/**
 * Sprue resize-gizmo reference fixture generator for the native migration.
 *
 * Drives the REAL reference sprueResizeRuntime (Three.js under jsdom, real DOM events) and records, in
 * native/tests/fixtures/reference/sprue-resize-reference.json (replayed by tst_sprue_gizmo_equivalence.cpp):
 *
 *  - the handles built for a set of sprue presentation definitions (pending / resolved / invalid, tilted axis): position,
 *    orientation, torus parameters, colours;
 *  - hover picking: for pixels around and away from the handles the world ray the runtime casts and the handle it
 *    resolves (or none), the cursor, and which owning mold bodies it hides;
 *  - drag gestures: label text, preview scale, interaction state after every move, the commit made on release (or none
 *    after Escape);
 *  - the numeric editor opened by a double click: its value/min/max/step and what Enter commits for several inputs;
 *  - the real presentation selector (pending / resolved / invalid precedence).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { expect, it, vi } from "vitest";

import type { SpruePresentationDefinition } from "@/features/mold-generation/sprue-generation";
import { createSelectSpruePresentationDefinitions } from "@/features/mold-generation/split-face/splitFace.store";
import { createSprueResizeRuntime } from "@/features/viewport/runtime/sprueResizeRuntime";

const outputPath = resolve(process.env.CRAFT_SPRUE_RESIZE_OUTPUT ?? "sprue-resize-reference.json");
const W = 800, H = 600;

type Vec = { x: number; y: number; z: number };
const vec = (v: Vector3): Vec => ({ x: v.x, y: v.y, z: v.z });

const unit = (x: number, y: number, z: number): Vec => {
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
};

const DEFINITIONS: SpruePresentationDefinition[] = [
  { operationId: "sprue:1", position: { x: 0, y: 0, z: 32 }, inwardDirection: { x: 0, y: 0, z: -1 }, profile: { mainDiameterMm: 5, entryNeckDiameterMm: 3.2, entryNeckLengthMm: 4 }, depthMm: 10, targetBodyIds: ["body-1"], status: "resolved" },
  { operationId: "sprue:2", position: { x: 15, y: 5, z: 32 }, inwardDirection: { x: 0, y: 0, z: -1 }, profile: { mainDiameterMm: 6, entryNeckDiameterMm: 4, entryNeckLengthMm: 4 }, status: "pending" },
  { operationId: "sprue:3", position: { x: -15, y: -8, z: 32 }, inwardDirection: unit(0.25, -0.1, -0.9), profile: { mainDiameterMm: 3, entryNeckDiameterMm: 2.5, entryNeckLengthMm: 2 }, depthMm: 12, targetBodyIds: ["body-1", "body-2"], status: "invalid" },
];

function makeCamera() {
  const camera = new PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(45, -70, 75);
  camera.lookAt(0, 0, 15);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function rectOf() {
  return { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) };
}

function event(type: string, fields: Record<string, unknown>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { button: 0, buttons: 0, isPrimary: true, pointerId: 1, shiftKey: false, clientX: 0, clientY: 0 }, fields);
  return e;
}

function setup() {
  const camera = makeCamera();
  const canvas = document.createElement("canvas");
  const host = document.createElement("div");
  document.body.append(host);
  host.append(canvas);
  canvas.getBoundingClientRect = rectOf as never;
  host.getBoundingClientRect = rectOf as never;
  (canvas as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
  (canvas as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => undefined;
  const controls = { enabled: true };
  const commits: Array<{ kind: string; operationId: string; diameterMm: number }> = [];
  const runtime = createSprueResizeRuntime({
    camera, canvas, host, controls, invalidate: () => undefined,
    onDiameterCommit: vi.fn(async (operationId: string, diameterMm: number) => { commits.push({ kind: "main", operationId, diameterMm }); return true; }),
    onEntryNeckDiameterCommit: vi.fn(async (operationId: string, diameterMm: number) => { commits.push({ kind: "neck", operationId, diameterMm }); return true; }),
  });
  const root = new Group();
  const bodies = ["body-1", "body-2", "body-3"].map((id) => {
    const mesh = new Mesh(new BoxGeometry(10, 10, 10), new MeshStandardMaterial());
    mesh.userData.moldBodyId = id;
    mesh.userData.cavityAffected = true;
    root.add(mesh);
    return mesh;
  });
  runtime.setMoldRoot(root);
  runtime.setSprues(DEFINITIONS);
  runtime.setActive(true);
  runtime.object.updateMatrixWorld(true);  // the renderer does this every frame; the runtime is not in a scene here
  return { camera, canvas, host, controls, commits, runtime, bodies, root };
}

function handleInfo(runtime: ReturnType<typeof setup>["runtime"]) {
  return runtime.object.children.map((child) => {
    const group = child as Group;
    const [visual, target] = group.children as Mesh[];
    const vp = (visual.geometry as unknown as { parameters: Record<string, number> }).parameters;
    const tp = (target.geometry as unknown as { parameters: Record<string, number> }).parameters;
    const vm = visual.material as unknown as { color: { getHex(): number }; opacity: number };
    const [, operationId, opening] = group.name.split(":");
    return {
      name: group.name,
      operationId: `sprue:${operationId}`,
      opening,
      position: vec(group.position),
      quaternion: { x: group.quaternion.x, y: group.quaternion.y, z: group.quaternion.z, w: group.quaternion.w },
      visual: { radius: vp.radius, tube: vp.tube, radialSegments: vp.radialSegments, tubularSegments: vp.tubularSegments, colorHex: vm.color.getHex(), opacity: vm.opacity, scale: visual.scale.x },
      target: { radius: tp.radius, tube: tp.tube, radialSegments: tp.radialSegments, tubularSegments: tp.tubularSegments },
    };
  });
}

/** The pixel at which a world point appears. */
function project(camera: PerspectiveCamera, p: Vector3) {
  const ndc = p.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * W, y: ((1 - ndc.y) / 2) * H };
}

function rayAt(camera: PerspectiveCamera, x: number, y: number) {
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), camera);
  return { origin: vec(raycaster.ray.origin), direction: vec(raycaster.ray.direction) };
}

function hoveredHandle(runtime: ReturnType<typeof setup>["runtime"]) {
  const found = runtime.object.children.find((child) => {
    const visual = (child as Group).children[0] as Mesh;
    return (visual.material as unknown as { color: { getHex(): number } }).color.getHex() === 0x67c58f;
  });
  return found === undefined ? null : found.name;
}

it("records the real Sprue resize gizmo runtime", () => {
  // --- handles ---------------------------------------------------------------------------------------------------
  const base = setup();
  const handles = handleInfo(base.runtime);
  const objectVisible = base.runtime.object.visible;

  // --- hover picking -----------------------------------------------------------------------------------------------
  const picks: unknown[] = [];
  const ringPoint = (group: Group, theta: number, radius: number) => {
    const local = new Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
    return group.localToWorld(local);
  };
  const probes: Array<{ label: string; x: number; y: number }> = [];
  for (const child of base.runtime.object.children) {
    const group = child as Group;
    const target = group.children[1] as Mesh;
    const params = (target.geometry as unknown as { parameters: Record<string, number> }).parameters;
    for (const theta of [0, 0.7, 1.9, 3.3, 4.6]) {
      const p = ringPoint(group, theta, params.radius);
      const pixel = project(base.camera, p);
      for (const [dx, dy] of [[0, 0], [3, 0], [0, 4], [-6, 3], [12, 0], [0, 25], [40, 40]]) {
        probes.push({ label: `${group.name}@${theta}+${dx},${dy}`, x: pixel.x + dx, y: pixel.y + dy });
      }
    }
    const center = project(base.camera, group.position);
    probes.push({ label: `${group.name}@centre`, x: center.x, y: center.y });
  }
  probes.push({ label: "far-corner", x: 5, y: 5 }, { label: "far-corner-2", x: W - 5, y: H - 5 });
  for (const probe of probes) {
    base.canvas.dispatchEvent(event("pointerleave", {}));
    base.runtime.object.updateMatrixWorld(true);
    base.canvas.dispatchEvent(event("pointermove", { clientX: probe.x, clientY: probe.y }));
    const hovered = hoveredHandle(base.runtime);
    picks.push({
      ...probe,
      ray: rayAt(base.camera, probe.x, probe.y),
      hovered,
      state: base.runtime.getInteractionState(),
      cursor: base.canvas.style.cursor.startsWith("url(") ? "funnel" : base.canvas.style.cursor,
      hiddenBodies: base.bodies.filter((b) => !b.visible).map((b) => b.userData.moldBodyId as string),
    });
  }
  base.canvas.dispatchEvent(event("pointerleave", {}));
  const afterLeave = { hovered: hoveredHandle(base.runtime), hiddenBodies: base.bodies.filter((b) => !b.visible).length, state: base.runtime.getInteractionState() };

  // --- drags -------------------------------------------------------------------------------------------------------------
  type Move = { dx: number; dy: number; shift?: boolean };
  const dragCases: Array<{ name: string; handle: string; moves: Move[]; release: "up" | "escape" }> = [
    { name: "top-grow-snapped", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 10, dy: 0 }, { dx: 40, dy: 0 }], release: "up" },
    { name: "top-shrink-to-neck-minimum", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: -200, dy: 0 }], release: "up" },
    { name: "top-grow-to-maximum", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 2000, dy: 0 }], release: "up" },
    { name: "top-shift-fine", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 13, dy: 0, shift: true }], release: "up" },
    { name: "top-vertical-contributes", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 10, dy: -40 }], release: "up" },
    { name: "top-no-change", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 1, dy: 0 }], release: "up" },
    { name: "top-out-and-back", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 60, dy: 0 }, { dx: 0, dy: 0 }], release: "up" },
    { name: "top-escape-cancels", handle: "SprueResizeHandle:sprue:1:top", moves: [{ dx: 40, dy: 0 }], release: "escape" },
    { name: "bottom-grow-clamped-to-main", handle: "SprueResizeHandle:sprue:1:bottom", moves: [{ dx: 400, dy: 0 }], release: "up" },
    { name: "bottom-shrink-to-minimum", handle: "SprueResizeHandle:sprue:1:bottom", moves: [{ dx: -400, dy: 0 }], release: "up" },
    { name: "bottom-snapped", handle: "SprueResizeHandle:sprue:1:bottom", moves: [{ dx: 7, dy: 0 }], release: "up" },
    { name: "pending-top", handle: "SprueResizeHandle:sprue:2:top", moves: [{ dx: 30, dy: 0 }], release: "up" },
    { name: "invalid-top-small", handle: "SprueResizeHandle:sprue:3:top", moves: [{ dx: 25, dy: 0 }], release: "up" },
  ];
  const drags = dragCases.map((c) => {
    const s = setup();
    const group = s.runtime.object.children.find((g) => g.name === c.handle) as Group;
    const centre = project(s.camera, ringPoint(group, 0, (group.children[1] as Mesh & { geometry: { parameters: { radius: number } } }).geometry.parameters.radius));
    s.canvas.dispatchEvent(event("pointermove", { clientX: centre.x, clientY: centre.y }));
    const hoverBefore = hoveredHandle(s.runtime);
    s.canvas.dispatchEvent(event("pointerdown", { clientX: centre.x, clientY: centre.y }));
    const label = s.host.querySelector("[data-sprue-diameter-label]") as HTMLElement;
    const started = { state: s.runtime.getInteractionState(), controlsEnabled: s.controls.enabled, hoverBefore };
    const steps = c.moves.map((m) => {
      s.canvas.dispatchEvent(event("pointermove", { clientX: centre.x + m.dx, clientY: centre.y + m.dy, shiftKey: m.shift === true, buttons: 1 }));
      return { dx: m.dx, dy: m.dy, shift: m.shift === true, label: label.textContent, labelColor: label.style.color, labelVisible: label.style.display !== "none", scale: group.scale.x, scaleY: group.scale.y, state: s.runtime.getInteractionState(), cursor: s.canvas.style.cursor };
    });
    const last = c.moves[c.moves.length - 1];
    if (c.release === "up") s.canvas.dispatchEvent(event("pointerup", { clientX: centre.x + last.dx, clientY: centre.y + last.dy }));
    else window.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" }));
    return {
      ...c,
      started,
      steps,
      after: { commits: s.commits, state: s.runtime.getInteractionState(), controlsEnabled: s.controls.enabled, scale: group.scale.x, labelVisible: label.style.display !== "none" },
    };
  });

  // --- numeric editor ---------------------------------------------------------------------------------------------------------
  const numericCases = [
    { name: "main-valid", handle: "SprueResizeHandle:sprue:1:top", input: "6.5" },
    { name: "main-below-minimum", handle: "SprueResizeHandle:sprue:1:top", input: "1" },
    { name: "main-below-neck", handle: "SprueResizeHandle:sprue:1:top", input: "2.1" },
    { name: "main-above-maximum", handle: "SprueResizeHandle:sprue:1:top", input: "80" },
    { name: "neck-above-main", handle: "SprueResizeHandle:sprue:1:bottom", input: "9" },
    { name: "neck-valid", handle: "SprueResizeHandle:sprue:1:bottom", input: "3.7" },
    { name: "not-a-number", handle: "SprueResizeHandle:sprue:1:top", input: "abc" },
    { name: "empty", handle: "SprueResizeHandle:sprue:1:top", input: "" },
  ];
  const numeric = numericCases.map((c) => {
    const s = setup();
    const group = s.runtime.object.children.find((g) => g.name === c.handle) as Group;
    const radius = (group.children[1] as Mesh & { geometry: { parameters: { radius: number } } }).geometry.parameters.radius;
    const centre = project(s.camera, ringPoint(group, 0, radius));
    s.canvas.dispatchEvent(event("dblclick", { clientX: centre.x, clientY: centre.y }));
    const input = s.host.querySelector("[data-sprue-diameter-input]") as HTMLInputElement | null;
    const opened = input === null ? null : { value: input.value, min: input.min, max: input.max, step: input.step, state: s.runtime.getInteractionState() };
    if (input !== null) {
      input.value = c.input;
      input.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter" }));
    }
    const stillOpen = s.host.querySelector("[data-sprue-diameter-input]") !== null;
    const afterEnter = { commits: s.commits, stillOpen, state: s.runtime.getInteractionState() };
    let afterEscape: unknown = null;
    if (stillOpen) {
      (s.host.querySelector("[data-sprue-diameter-input]") as HTMLInputElement).dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Escape" }));
      afterEscape = { stillOpen: s.host.querySelector("[data-sprue-diameter-input]") !== null, state: s.runtime.getInteractionState() };
    }
    return { ...c, opened, afterEnter, afterEscape };
  });

  // --- deactivation and replacement --------------------------------------------------------------------------------------------
  const lifecycle = (() => {
    const s = setup();
    const group = s.runtime.object.children[0] as Group;
    const radius = (group.children[1] as Mesh & { geometry: { parameters: { radius: number } } }).geometry.parameters.radius;
    const centre = project(s.camera, ringPoint(group, 0, radius));
    s.canvas.dispatchEvent(event("pointermove", { clientX: centre.x, clientY: centre.y }));
    const hovered = hoveredHandle(s.runtime);
    s.runtime.setActive(false);
    const inactive = { visible: s.runtime.object.visible, hovered: hoveredHandle(s.runtime), hidden: s.bodies.filter((b) => !b.visible).length, state: s.runtime.getInteractionState() };
    s.canvas.dispatchEvent(event("pointermove", { clientX: centre.x, clientY: centre.y }));
    const inactiveHover = hoveredHandle(s.runtime);
    s.runtime.setActive(true);
    s.runtime.object.updateMatrixWorld(true);
    s.runtime.setSprues([{ ...DEFINITIONS[0], profile: { ...DEFINITIONS[0].profile, mainDiameterMm: 7 } }]);
    const rebuilt = handleInfo(s.runtime).map((h) => ({ name: h.name, radius: h.visual.radius }));
    return { hovered, inactive, inactiveHover, rebuilt };
  })();

  // --- the real presentation selector (pending / resolved / invalid precedence) ------------------------------------------------
  const intent = (operationId: string, status: "pending" | "resolved" | "invalid", x: number, main: number) => ({
    operationId, anchor: { position: { x, y: 1, z: 30 } }, inwardDirection: { x: 0, y: 0, z: -1 },
    profileDesign: { profile: { mainDiameterMm: main, entryNeckDiameterMm: 2.5, entryNeckLengthMm: 4 } },
    validation: { status },
  });
  const resolved = (operationId: string, x: number, main: number) => ({
    operationId, position: { x, y: 1, z: 30 }, inwardDirection: { x: 0, y: 0, z: -1 }, profile: { mainDiameterMm: main, entryNeckDiameterMm: 2.5, entryNeckLengthMm: 4 }, depthMm: 12, targetBodyIds: ["body-1"],
  });
  const select = createSelectSpruePresentationDefinitions();
  const selectorCases = [
    { name: "resolved-uses-resolved-geometry", definitions: [intent("a", "resolved", 5, 6)], sprues: [resolved("a", 5.5, 7)] },
    { name: "pending-ignores-stale-resolved", definitions: [intent("a", "pending", 5, 8)], sprues: [resolved("a", 5.5, 7)] },
    { name: "invalid-keeps-last-resolved", definitions: [intent("a", "invalid", 5, 8)], sprues: [resolved("a", 5.5, 7)] },
    { name: "invalid-without-resolved-marks-intent", definitions: [intent("a", "invalid", 5, 8)], sprues: [] },
    { name: "resolved-without-resolved-geometry", definitions: [intent("a", "resolved", 5, 8)], sprues: [] },
    { name: "several-in-order", definitions: [intent("a", "resolved", 1, 3), intent("b", "pending", 2, 4), intent("c", "invalid", 3, 5)], sprues: [resolved("a", 1.5, 3.5), resolved("c", 3.5, 5.5)] },
  ].map((c) => ({ ...c, presentation: select({ sprueDefinitions: c.definitions as never, sprues: c.sprues as never }) }));

  const fixture = {
    generatedFrom: "mold/frontend/src/features/viewport/runtime/sprueResizeRuntime.ts and split-face/splitFace.store.ts (selectSpruePresentationDefinitions)",
    viewport: { width: W, height: H },
    camera: { fov: 45, near: 0.1, far: 1000, position: { x: 45, y: -70, z: 75 }, target: { x: 0, y: 0, z: 15 }, up: { x: 0, y: 0, z: 1 } },
    constants: { snapMm: 0.25, sensitivityMmPerPixel: 0.05 },
    definitions: DEFINITIONS,
    objectVisible,
    handles,
    picks,
    afterLeave,
    drags,
    numeric,
    lifecycle,
    selectorCases,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 1));
  expect(handles.length).toBe(5);
});
