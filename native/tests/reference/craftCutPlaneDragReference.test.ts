/**
 * Cut by Face right-button plane drag: reference fixture generator for the native migration.
 *
 * Runs the REAL reference cutting-plane runtime (Three.js under jsdom, real DOM pointer events) and the REAL split-face
 * store, and records in native/tests/fixtures/reference/cutplane-drag-reference.json (replayed by
 * tst_cutplane_drag_equivalence.cpp):
 *
 *  - for several cameras (including ones looking along a plane's axis, where the reference drag plane degenerates) and
 *    every enabled plane: a drag recorded event by event (press, moves below and above the 4 px threshold, moves that
 *    run into the part box limits, release), with after every event the plane's coordinate along its axis, its look
 *    (colour and opacities), the cursor, whether the orbit controls are enabled, and the callbacks the runtime made
 *    (start / commit with the normalized position / cancel);
 *  - what does NOT start a drag: the primary button, a non-primary pointer, empty space, the Eraser being active;
 *  - how a drag ends other than by release: pointercancel, losing pointer capture, the planes being replaced;
 *  - the hover look and cursor outside the Eraser;
 *  - the store's commitPlaneDrag: which normalized positions it accepts, clamps or ignores (no change within 1e-9),
 *    what it does to history and to the committed mold.
 *
 * Every event carries the world ray through its pixel and the camera's view direction and up vector, so the native replay
 * needs no camera of its own.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { beforeEach, expect, it, vi } from "vitest";

import { createReferenceMoldBlockBounds } from "@/features/mold-generation/reference-mold-definition/referenceMoldBlock.geometry";
import {
  clampNormalizedPosition,
  createCuttingPlane,
  normalizedToWorldCoordinate,
  worldToNormalizedPosition,
  type Bounds3,
  type CuttingPlaneRecord,
} from "@/features/mold-generation/split-face";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import { createCuttingPlane3dRuntime } from "@/features/viewport/runtime/cuttingPlane3dRuntime";

const outputPath = resolve(process.env.CRAFT_CUTPLANE_DRAG_OUTPUT ?? "cutplane-drag-reference.json");
const W = 800, H = 600;

type Vec = { x: number; y: number; z: number };
const vec = (v: Vector3): Vec => ({ x: v.x, y: v.y, z: v.z });

const K1: Bounds3 = { min: { x: -20, y: -15, z: 0 }, max: { x: 20, y: 15, z: 12 } };
const CLEARANCE = 10;

// One enabled plane per axis (two parallel slabs of the same extent would hide one another from most cameras), and a disabled one.
function planeRecords(): CuttingPlaneRecord[] {
  return [
    createCuttingPlane("front", { normalizedPosition: 0.3, provenance: "manual" }),
    createCuttingPlane("top", { normalizedPosition: 0.4, provenance: "manual" }),
    createCuttingPlane("left", { normalizedPosition: 0.75, provenance: "manual" }),
    { ...createCuttingPlane("right"), enabled: false },
  ];
}

const CAMERAS = {
  default: { position: [45, -70, 75], target: [0, 0, 15] },
  side: { position: [0, -120, 8], target: [0, 0, 8] },            // along +y: planes on the y axis are seen edge-on
  topDown: { position: [0, 0, 130], target: [0, 0, 0] },          // along -z: the drag plane of a z-axis plane degenerates
  nearlyTopDown: { position: [1.5, 1, 130], target: [0, 0, 0] },  // almost, but not exactly, along the axis
  fromRight: { position: [120, 20, 30], target: [0, 0, 6] },
  alongX: { position: [140, 0, 6], target: [0, 0, 6] },         // along -x: an x-axis plane's drag plane falls back to the up vector
  alongY: { position: [0, 140, 6], target: [0, 0, 6] },         // along -y
} as const;
type CameraName = keyof typeof CAMERAS;

function makeCamera(name: CameraName) {
  const c = CAMERAS[name];
  const camera = new PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(...(c.position as [number, number, number]));
  camera.lookAt(...(c.target as [number, number, number]));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function event(type: string, fields: Record<string, unknown>) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { button: 0, buttons: 0, isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 }, fields);
  return e;
}

function project(camera: PerspectiveCamera, p: Vector3) {
  const ndc = p.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * W, y: ((1 - ndc.y) / 2) * H };
}

function rayAt(camera: PerspectiveCamera, x: number, y: number) {
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), camera);
  return { origin: vec(raycaster.ray.origin), direction: vec(raycaster.ray.direction) };
}

function harness(cameraName: CameraName, records = planeRecords()) {
  const camera = makeCamera(cameraName);
  const canvas = document.createElement("canvas");
  const rect = { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) };
  canvas.getBoundingClientRect = (() => rect) as never;
  const capture = { set: [] as number[], released: [] as number[] };
  (canvas as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = (id) => { capture.set.push(id); };
  (canvas as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = (id) => { capture.released.push(id); };
  const controls = { enabled: true };
  const log: Array<{ call: "start" | "commit" | "cancel" | "erase"; id?: string; normalized?: number; face?: string }> = [];
  const runtime = createCuttingPlane3dRuntime({
    camera, canvas, controls: controls as never, invalidate: () => undefined,
    onDragStart: (id) => log.push({ call: "start", id }),
    onDragCommit: (id, normalized) => log.push({ call: "commit", id, normalized }),
    onDragCancel: () => log.push({ call: "cancel" }),
    onErasePlane: (face) => log.push({ call: "erase", face }),
  });
  const k2 = createReferenceMoldBlockBounds(K1, CLEARANCE)!;
  runtime.setPlanes(K1, k2, records);
  runtime.root.updateMatrixWorld(true);
  return { camera, canvas, controls, runtime, log, capture, k2, records: records as CuttingPlaneRecord[] };
}
type Harness = ReturnType<typeof harness>;

function assemblyOf(h: Harness, id: string) {
  const group = h.runtime.root.children.find((c) => ((c as Group).children[0] as Mesh).userData.planeId === id) as Group;
  const surface = group.children[0] as Mesh;
  const edges = group.children[1] as Mesh;
  return { group, surface, edges };
}

function look(h: Harness, id: string) {
  const { surface, edges } = assemblyOf(h, id);
  const m = surface.material as unknown as { color: { getHex(): number }; opacity: number };
  const e = edges.material as unknown as { color: { getHex(): number }; opacity: number };
  return { colorHex: m.color.getHex(), opacity: m.opacity, edgeColorHex: e.color.getHex(), edgeOpacity: e.opacity };
}

const AXES = ["x", "y", "z"] as const;

function snapshot(h: Harness, id: string, mark: number) {
  const { group } = assemblyOf(h, id);
  const record = h.records.find((r) => r.id === id)!;
  const view = new Vector3();
  h.camera.getWorldDirection(view);
  return {
    coordinate: group.position[record.axis],
    look: look(h, id),
    cursor: h.canvas.style.cursor,
    controlsEnabled: h.controls.enabled,
    calls: h.log.slice(mark),
    captureSet: [...h.capture.set],
    captureReleased: [...h.capture.released],
    otherCoordinates: AXES.filter((a) => a !== record.axis).map((a) => group.position[a]),
  };
}

/** A pixel on the plane's slab that the runtime picks (hover look in non-Eraser mode), found by probing the slab. */
function pixelOnPlane(h: Harness, id: string): { x: number; y: number } | null {
  const { group, surface } = assemblyOf(h, id);
  const p = (surface.geometry as BoxGeometry).parameters;
  const hoverHex = 0xffb52e;
  const grid: Array<[number, number]> = [];
  for (const fx of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) for (const fy of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) grid.push([fx, fy]);
  for (const [fx, fy] of grid) {
    const world = group.localToWorld(new Vector3(fx * p.width, fy * p.height, 0));
    const pixel = project(h.camera, world);
    if (pixel.x < 0 || pixel.x > W || pixel.y < 0 || pixel.y > H) continue;
    h.canvas.dispatchEvent(event("pointerleave", {}));
    h.canvas.dispatchEvent(event("pointermove", { clientX: pixel.x, clientY: pixel.y }));
    if (look(h, id).colorHex === hoverHex) {
      h.canvas.dispatchEvent(event("pointerleave", {}));
      return pixel;
    }
  }
  h.canvas.dispatchEvent(event("pointerleave", {}));
  return null;
}

type Step =
  | { type: "down" | "move" | "up"; x: number; y: number; button?: number; pointerId?: number; isPrimary?: boolean }
  | { type: "pointercancel" | "lostpointercapture" | "pointerleave" }
  | { type: "setPlanes" }
  | { type: "applyCommit" }  // what the host does with a commit: the store takes the position and the planes are rebuilt
  | { type: "eraser"; active: boolean };

function run(h: Harness, id: string, steps: Step[]) {
  const record = h.records.find((r) => r.id === id)!;
  const out = [];
  for (const step of steps) {
    const mark = h.log.length;
    h.runtime.root.updateMatrixWorld(true);
    let defaultPrevented: boolean | null = null;
    let x: number | null = null, y: number | null = null;
    if (step.type === "down" || step.type === "move" || step.type === "up") {
      x = step.x; y = step.y;
      const name = step.type === "down" ? "pointerdown" : step.type === "move" ? "pointermove" : "pointerup";
      const e = event(name, {
        clientX: step.x, clientY: step.y, button: step.button ?? 0, buttons: step.type === "up" ? 0 : (step.button ?? 0) === 2 ? 2 : 1,
        pointerId: step.pointerId ?? 1, isPrimary: step.isPrimary ?? true,
      });
      h.canvas.dispatchEvent(e);
      defaultPrevented = e.defaultPrevented;
    } else if (step.type === "applyCommit") {
      const last = [...h.log].reverse().find((c) => c.call === "commit");
      if (last !== undefined && last.normalized !== undefined) {
        const index = h.records.findIndex((r) => r.id === last.id);
        h.records = h.records.map((r, i) => (i === index ? { ...r, normalizedPosition: last.normalized! } : r));
        h.runtime.setPlanes(K1, h.k2, h.records);
        h.runtime.root.updateMatrixWorld(true);
      }
    } else if (step.type === "setPlanes") {
      h.runtime.setPlanes(K1, h.k2, h.records);
      h.runtime.root.updateMatrixWorld(true);
    } else if (step.type === "eraser") {
      h.runtime.setEraserInteractionActive(step.active);
    } else {
      h.canvas.dispatchEvent(event(step.type, {}));
    }
    out.push({
      step,
      record: step.type === "applyCommit" ? h.records.find((r) => r.id === id)!.normalizedPosition : null,
      ray: x === null || y === null ? null : rayAt(h.camera, x, y),
      defaultPrevented,
      after: snapshot(h, id, mark),
    });
  }
  return { planeId: id, axis: record.axis, startCoordinate: normalizedToWorldCoordinate(K1, record.axis, record.normalizedPosition), steps: out };
}

function cameraInfo(h: Harness) {
  const view = new Vector3();
  h.camera.getWorldDirection(view);
  return { position: vec(h.camera.position), view: vec(view), up: vec(h.camera.up) };
}

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
});

it("records the real cutting-plane drag runtime and the split-face commitPlaneDrag", () => {
  // --- drags ---------------------------------------------------------------------------------------------------------------
  const dragScenarios: unknown[] = [];
  const offsets: Array<[number, number]> = [[1, 1], [3, 0], [2, -3], [3.9, 0], [4, 0], [0, -4], [30, -20], [-60, 40], [90, 25], [400, -300], [-500, 250], [0, 0]];

  for (const cameraName of Object.keys(CAMERAS) as CameraName[]) {
    for (const record of planeRecords().filter((r) => r.enabled)) {
      const h = harness(cameraName);
      const pixel = pixelOnPlane(h, record.id);
      if (pixel === null) continue;  // the plane is not visible from this camera
      const steps: Step[] = [{ type: "down", x: pixel.x, y: pixel.y, button: 2 }];
      for (const [dx, dy] of offsets) steps.push({ type: "move", x: pixel.x + dx, y: pixel.y + dy, button: 2 });
      steps.push({ type: "up", x: pixel.x + 0, y: pixel.y + 0, button: 2 });
      dragScenarios.push({ name: `${cameraName}:${record.id}:drag`, camera: cameraInfo(h), ...run(h, record.id, steps) });

      // A press and release without moving, or with moves under the threshold only, is not a drag: it is cancelled and the
      // plane is where it was.
      const h2 = harness(cameraName);
      dragScenarios.push({
        name: `${cameraName}:${record.id}:click`, camera: cameraInfo(h2),
        ...run(h2, record.id, [
          { type: "down", x: pixel.x, y: pixel.y, button: 2 },
          { type: "move", x: pixel.x + 2, y: pixel.y + 1, button: 2 },
          { type: "move", x: pixel.x - 3, y: pixel.y, button: 2 },
          { type: "up", x: pixel.x - 3, y: pixel.y, button: 2 },
        ]),
      });
    }
  }

  // Ways a drag ends other than by release, and things that do not start one (one camera, one plane each).
  const base = harness("default");
  const target = "cutting-plane:top";
  const targetPixel = pixelOnPlane(base, target)!;
  const mk = (cameraName: CameraName = "default") => harness(cameraName);
  const other = (fn: (h: Harness) => Step[], name: string, cameraName: CameraName = "default") => {
    const h = mk(cameraName);
    dragScenarios.push({ name, camera: cameraInfo(h), ...run(h, target, fn(h)) });
  };
  const px = targetPixel.x, py = targetPixel.y;
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2 }, { type: "pointercancel" }], "pointercancel-mid-drag");
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2 }, { type: "lostpointercapture" }], "lost-capture-mid-drag");
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2 }, { type: "setPlanes" }], "planes-replaced-mid-drag");
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2 }, { type: "pointerleave" }, { type: "move", x: px + 50, y: py - 30, button: 2 }, { type: "up", x: px + 50, y: py - 30, button: 2 }], "leave-mid-drag-keeps-dragging");
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2, pointerId: 7 }, { type: "up", x: px + 40, y: py - 30, button: 2, pointerId: 7 }, { type: "move", x: px + 10, y: py + 10, button: 2 }, { type: "up", x: px + 10, y: py + 10, button: 2 }], "other-pointer-is-ignored");
  other(() => [{ type: "down", x: px, y: py, button: 0 }, { type: "move", x: px + 40, y: py - 30 }, { type: "up", x: px + 40, y: py - 30 }], "primary-button-does-not-drag");
  other(() => [{ type: "down", x: px, y: py, button: 1 }, { type: "move", x: px + 40, y: py - 30 }, { type: "up", x: px + 40, y: py - 30 }], "middle-button-does-not-drag");
  other(() => [{ type: "down", x: px, y: py, button: 2, isPrimary: false }, { type: "move", x: px + 40, y: py - 30 }, { type: "up", x: px + 40, y: py - 30 }], "non-primary-pointer-does-not-drag");
  other(() => [{ type: "down", x: 8, y: 8, button: 2 }, { type: "move", x: 60, y: 60 }, { type: "up", x: 60, y: 60, button: 2 }], "empty-space-does-not-drag");
  other(() => [{ type: "eraser", active: true }, { type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30 }, { type: "up", x: px + 40, y: py - 30, button: 2 }], "eraser-active-does-not-drag");
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2 }, { type: "eraser", active: true }, { type: "up", x: px + 40, y: py - 30, button: 2 }], "eraser-activated-mid-drag-cancels");
  other(() => [{ type: "move", x: px, y: py }, { type: "move", x: px + 3, y: py + 1 }, { type: "move", x: 8, y: 8 }, { type: "pointerleave" }], "hover-without-drag");
  other(() => [{ type: "down", x: px, y: py, button: 2 }, { type: "move", x: px + 40, y: py - 30, button: 2 }, { type: "up", x: px + 40, y: py - 30, button: 2 }, { type: "applyCommit" }, { type: "down", x: px, y: py, button: 2 }, { type: "move", x: px - 40, y: py + 30, button: 2 }, { type: "up", x: px - 40, y: py + 30, button: 2 }], "two-drags-in-a-row");

  // --- the store ----------------------------------------------------------------------------------------------------------
  const k1Cube: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 30 } };
  const thin: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 0.5 } };
  const commits: unknown[] = [];
  const commitCases: Array<{ name: string; bounds: Bounds3; faces: Array<"front" | "top">; plane: "front" | "top"; value: number; parts?: boolean }> = [
    { name: "moves-to-a-position", bounds: k1Cube, faces: ["front"], plane: "front", value: 0.4 },
    { name: "same-position-changes-nothing", bounds: k1Cube, faces: ["front"], plane: "front", value: 1 - 1e-6 },
    { name: "within-1e-9-changes-nothing", bounds: k1Cube, faces: ["front"], plane: "front", value: 1 - 1e-6 - 5e-10 },
    { name: "just-over-1e-9-moves", bounds: k1Cube, faces: ["front"], plane: "front", value: 1 - 1e-6 - 2e-9 },
    { name: "clamps-above-1", bounds: k1Cube, faces: ["front"], plane: "front", value: 1.7 },
    { name: "clamps-below-0", bounds: k1Cube, faces: ["front"], plane: "front", value: -0.5 },
    { name: "zero-clamps-to-the-inset", bounds: k1Cube, faces: ["top"], plane: "top", value: 0 },
    { name: "thin-box-inset-is-in-millimetres", bounds: thin, faces: ["top"], plane: "top", value: 0 },
    { name: "thin-box-upper-inset", bounds: thin, faces: ["top"], plane: "top", value: 1 },
    { name: "second-of-two-planes", bounds: k1Cube, faces: ["front", "top"], plane: "top", value: 0.25 },
  ];
  for (const c of commitCases) {
    useSplitFaceStore.getState().clearForModelReplacement();
    useSplitFaceStore.getState().enterSelection();
    for (const face of c.faces) useSplitFaceStore.getState().toggleFace(face);
    const plane = useSplitFaceStore.getState().cuttingPlanes.find((p) => p.sourceFaceId === c.plane)!;
    const before = useSplitFaceStore.getState();
    const undoBefore = before.undoStack.length, redoBefore = before.redoStack.length, revisionBefore = before.document.revision;
    const positionBefore = plane.normalizedPosition;
    useSplitFaceStore.getState().beginPlaneDrag(plane.id);
    const duringDrag = { workflow: useSplitFaceStore.getState().workflow, activePlaneId: useSplitFaceStore.getState().activePlaneId };
    useSplitFaceStore.getState().commitPlaneDrag(plane.id, c.value, c.bounds);
    const after = useSplitFaceStore.getState();
    const planeAfter = after.cuttingPlanes.find((p) => p.id === plane.id)!;
    commits.push({
      ...c,
      axis: plane.axis,
      positionBefore,
      positionAfter: planeAfter.normalizedPosition,
      worldCoordinateAfter: planeAfter.lastValidWorldCoordinate ?? null,
      clampedValue: clampNormalizedPosition(c.value, c.bounds, plane.axis),
      duringDrag,
      workflowAfter: after.workflow,
      activePlaneIdAfter: after.activePlaneId,
      undoDepthDelta: after.undoStack.length - undoBefore,
      redoDepthDelta: after.redoStack.length - redoBefore,
      revisionDelta: after.document.revision - revisionBefore,
      definitionNull: after.definition === null,
    });
  }
  // The undo of a committed drag restores the plane's position.
  useSplitFaceStore.getState().clearForModelReplacement();
  useSplitFaceStore.getState().enterSelection();
  useSplitFaceStore.getState().toggleFace("front");
  const undoPlane = useSplitFaceStore.getState().cuttingPlanes[0]!;
  useSplitFaceStore.getState().beginPlaneDrag(undoPlane.id);
  useSplitFaceStore.getState().commitPlaneDrag(undoPlane.id, 0.4, k1Cube);
  const afterCommit = useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition;
  useSplitFaceStore.getState().undo();
  const afterUndo = useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition;
  useSplitFaceStore.getState().redo();
  const afterRedo = useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition;
  // A cancelled drag changes nothing.
  useSplitFaceStore.getState().beginPlaneDrag(undoPlane.id);
  const cancelSnapshotBefore = { workflow: useSplitFaceStore.getState().workflow, undo: useSplitFaceStore.getState().undoStack.length };
  useSplitFaceStore.getState().cancelPlaneDrag();
  const cancelSnapshotAfter = { workflow: useSplitFaceStore.getState().workflow, undo: useSplitFaceStore.getState().undoStack.length, position: useSplitFaceStore.getState().cuttingPlanes[0]!.normalizedPosition };

  const fixture = {
    generatedFrom: "mold/frontend/src/features/viewport/runtime/cuttingPlane3dRuntime.ts and split-face/splitFace.store.ts (commitPlaneDrag)",
    viewport: { width: W, height: H },
    k1: K1,
    k2: createReferenceMoldBlockBounds(K1, CLEARANCE),
    clearanceMm: CLEARANCE,
    thresholdPx: 4,
    colors: { idle: 0xf59e0b, hover: 0xffb52e, dragging: 0xef3038 },
    records: planeRecords().map((r) => ({ id: r.id, sourceFaceId: r.sourceFaceId, axis: r.axis, normalizedPosition: r.normalizedPosition, enabled: r.enabled })),
    safeInterval: AXES.map((axis) => ({ axis, min: worldToNormalizedPosition(K1, axis, K1.min[axis]), max: worldToNormalizedPosition(K1, axis, K1.max[axis]) })),
    drags: dragScenarios,
    commits,
    undo: { afterCommit, afterUndo, afterRedo },
    cancel: { before: cancelSnapshotBefore, after: cancelSnapshotAfter },
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 1));
  expect(dragScenarios.length).toBeGreaterThan(20);
  expect(vi.isMockFunction(vi.fn())).toBe(true);
});
