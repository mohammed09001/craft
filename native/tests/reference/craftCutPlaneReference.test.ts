/**
 * Cut by Face plane visuals + eraser reference fixture generator for the native migration.
 *
 * Runs the REAL reference cutting-plane runtime (Three.js under jsdom, real DOM pointer events) and the REAL split-face
 * store, and records in native/tests/fixtures/reference/cutplane-reference.json (replayed by
 * tst_cutplane_equivalence.cpp):
 *
 *  - the slab drawn for each enabled plane (centre, thickness and extents) and its idle/eraser-hover look;
 *  - eraser hover picking: for pointer probes the world ray and the plane the runtime highlights (or none), and what a
 *    primary-button press does (the plane it asks to erase);
 *  - the store's removal lifecycle: which planes remain, the workflow, the cavity and definition state, history, for
 *    removeSplitFace and removeSplitFaceAndRebuild (parts rebuilt without the plane, back to face selection when the
 *    last plane goes), and the guard while parts are generating.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { beforeEach, expect, it, vi } from "vitest";

import { createReferenceMoldBlockBounds } from "@/features/mold-generation/reference-mold-definition/referenceMoldBlock.geometry";
import {
  createCuttingPlane,
  normalizedToWorldCoordinate,
  type Bounds3,
  type CuttingPlaneRecord,
  type PartBoundingBoxFaceId,
} from "@/features/mold-generation/split-face";
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import { createCuttingPlane3dRuntime } from "@/features/viewport/runtime/cuttingPlane3dRuntime";

const outputPath = resolve(process.env.CRAFT_CUTPLANE_OUTPUT ?? "cutplane-reference.json");
const W = 800, H = 600;

type Vec = { x: number; y: number; z: number };
const vec = (v: Vector3): Vec => ({ x: v.x, y: v.y, z: v.z });

const K1: Bounds3 = { min: { x: -20, y: -15, z: 0 }, max: { x: 20, y: 15, z: 12 } };
const CLEARANCE = 10;

function planesForRuntime(): CuttingPlaneRecord[] {
  const front = createCuttingPlane("front");
  const top = createCuttingPlane("top", { normalizedPosition: 0.4, provenance: "manual" });
  const left = createCuttingPlane("left", { normalizedPosition: 0.75, provenance: "manual" });
  const bottom = createCuttingPlane("bottom");
  const disabled = { ...createCuttingPlane("right"), enabled: false };
  return [front, top, left, bottom, disabled];
}

function makeCamera() {
  const camera = new PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(45, -70, 75);
  camera.lookAt(0, 0, 15);
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

const stateSnapshot = () => {
  const s = useSplitFaceStore.getState();
  return {
    selectedFaceIds: [...s.selectedFaceIds],
    selectedSplitFaceId: s.selectedSplitFaceId,
    planes: s.cuttingPlanes.map((p) => ({ id: p.id, sourceFaceId: p.sourceFaceId, axis: p.axis, normalizedPosition: p.normalizedPosition, enabled: p.enabled, creationOrder: p.creationOrder })),
    workflow: s.workflow,
    definitionNull: s.definition === null,
    bodyCount: s.definition?.moldBodies?.length ?? null,
    cavityStatus: s.cavity.status,
    undoDepth: s.undoStack.length,
    redoDepth: s.redoStack.length,
    revision: s.document.revision,
    activePlaneId: s.activePlaneId,
    error: s.error,
  };
};

beforeEach(() => {
  useSplitFaceStore.getState().clearForModelReplacement();
});

it("records the real cutting-plane runtime and the split-face removal lifecycle", async () => {
  // --- slabs and eraser hover -------------------------------------------------------------------------------------------
  const camera = makeCamera();
  const canvas = document.createElement("canvas");
  const rect = { left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0, toJSON: () => ({}) };
  canvas.getBoundingClientRect = (() => rect) as never;
  (canvas as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
  (canvas as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => undefined;
  const erased: PartBoundingBoxFaceId[] = [];
  const runtime = createCuttingPlane3dRuntime({
    camera, canvas, controls: { enabled: true } as never, invalidate: () => undefined,
    onDragStart: vi.fn(), onDragCommit: vi.fn(), onDragCancel: vi.fn(),
    onErasePlane: (faceId) => { erased.push(faceId); },
  });
  const k2 = createReferenceMoldBlockBounds(K1, CLEARANCE)!;
  const records = planesForRuntime();
  runtime.setPlanes(K1, k2, records);
  runtime.root.updateMatrixWorld(true);

  const slabs = runtime.root.children.map((child) => {
    const group = child as Group;
    const [surface, edges] = group.children as Mesh[];
    const params = (surface.geometry as BoxGeometry).parameters;
    const material = surface.material as unknown as { color: { getHex(): number }; opacity: number; transparent: boolean; depthWrite: boolean; side: number };
    const edgeMaterial = edges.material as unknown as { color: { getHex(): number }; opacity: number };
    return {
      planeId: surface.userData.planeId as string,
      position: vec(group.position),
      dims: { width: params.width, height: params.height, depth: params.depth },
      idle: { colorHex: material.color.getHex(), opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, doubleSided: material.side === 2 },
      edges: { colorHex: edgeMaterial.color.getHex(), opacity: edgeMaterial.opacity, vertexCount: (edges.geometry as Mesh["geometry"]).getAttribute("position").count },
    };
  });

  runtime.setEraserInteractionActive(true);
  const hoveredPlane = () => {
    const found = runtime.root.children.find((child) => {
      const surface = (child as Group).children[0] as Mesh;
      return (surface.material as unknown as { color: { getHex(): number } }).color.getHex() === 0xef3038;
    });
    return found === undefined ? null : ((found as Group).children[0] as Mesh).userData.planeId as string;
  };

  // Probe points: on each enabled slab (centre, near corners/edges) and in empty space.
  const probes: Array<{ label: string; x: number; y: number }> = [];
  for (const child of runtime.root.children) {
    const group = child as Group;
    const surface = group.children[0] as Mesh;
    const p = (surface.geometry as BoxGeometry).parameters;
    const id = surface.userData.planeId as string;
    for (const [fx, fy, fz] of [[0, 0, 0], [0.45, 0.2, 0], [-0.45, -0.3, 0], [0.49, 0.49, 0.5], [-0.49, 0.2, -0.5], [0.3, -0.45, 0.4]]) {
      const world = group.localToWorld(new Vector3(fx * p.width, fy * p.height, fz * p.depth));
      const pixel = project(camera, world);
      probes.push({ label: `${id}@${fx},${fy},${fz}`, x: pixel.x, y: pixel.y });
      probes.push({ label: `${id}@${fx},${fy},${fz}+edge`, x: pixel.x + 5, y: pixel.y - 3 });
    }
  }
  probes.push({ label: "far-corner", x: 4, y: 4 }, { label: "far-corner-2", x: W - 4, y: H - 4 }, { label: "mid-left", x: 6, y: H / 2 });

  const picks = probes.map((probe) => {
    canvas.dispatchEvent(event("pointerleave", {}));
    runtime.root.updateMatrixWorld(true);
    canvas.dispatchEvent(event("pointermove", { clientX: probe.x, clientY: probe.y }));
    return { ...probe, ray: rayAt(camera, probe.x, probe.y), hovered: hoveredPlane(), cursor: canvas.style.cursor };
  });

  // Look of the hovered plane (eraser): taken from the first probe that hovers something.
  let hoverLookRecorded: unknown = null;
  for (const probe of probes) {
    canvas.dispatchEvent(event("pointerleave", {}));
    canvas.dispatchEvent(event("pointermove", { clientX: probe.x, clientY: probe.y }));
    const id = hoveredPlane();
    if (id === null) continue;
    const group = runtime.root.children.find((c) => ((c as Group).children[0] as Mesh).userData.planeId === id) as Group;
    const surface = group.children[0] as Mesh;
    const edges = group.children[1] as Mesh;
    hoverLookRecorded = {
      colorHex: (surface.material as unknown as { color: { getHex(): number } }).color.getHex(),
      opacity: (surface.material as unknown as { opacity: number }).opacity,
      edgeColorHex: (edges.material as unknown as { color: { getHex(): number } }).color.getHex(),
      edgeOpacity: (edges.material as unknown as { opacity: number }).opacity,
    };
    break;
  }

  // Presses: a primary press on a plane asks to erase it; elsewhere nothing; the secondary button does nothing in eraser mode.
  const presses = probes.map((probe) => {
    erased.length = 0;
    canvas.dispatchEvent(event("pointerleave", {}));
    runtime.root.updateMatrixWorld(true);
    canvas.dispatchEvent(event("pointerdown", { clientX: probe.x, clientY: probe.y, button: 0 }));
    return { label: probe.label, erased: [...erased] };
  });
  erased.length = 0;
  const secondary = (() => {
    const first = probes.find((_, i) => picks[i].hovered !== null)!;
    canvas.dispatchEvent(event("pointerdown", { clientX: first.x, clientY: first.y, button: 2 }));
    return { erased: [...erased] };
  })();

  // Leaving eraser mode clears the hover.
  const firstHover = picks.find((p) => p.hovered !== null)!;
  canvas.dispatchEvent(event("pointermove", { clientX: firstHover.x, clientY: firstHover.y }));
  const hoverBeforeDeactivate = hoveredPlane();
  runtime.setEraserInteractionActive(false);
  const hoverAfterDeactivate = hoveredPlane();
  runtime.dispose();

  // --- the real store ------------------------------------------------------------------------------------------------------
  const k1Cube: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 30, z: 30 } };
  const scenarios: Array<{ name: string; faces: PartBoundingBoxFaceId[]; parts: boolean; remove: PartBoundingBoxFaceId; how: "remove" | "rebuild" | "selected"; selectFirst?: PartBoundingBoxFaceId; generating?: boolean }> = [
    { name: "remove-keeps-the-rest", faces: ["front", "back"], parts: false, remove: "front", how: "remove" },
    { name: "remove-last-returns-to-selection", faces: ["top"], parts: false, remove: "top", how: "remove" },
    { name: "remove-absent-face-does-nothing", faces: ["left"], parts: false, remove: "right", how: "remove" },
    { name: "remove-three-keeps-order", faces: ["bottom", "front", "right"], parts: false, remove: "front", how: "remove" },
    { name: "remove-ignored-while-generating-parts", faces: ["front", "back"], parts: false, remove: "front", how: "remove", generating: true },
    { name: "rebuild-after-remove", faces: ["front", "right"], parts: true, remove: "right", how: "rebuild" },
    { name: "rebuild-last-plane", faces: ["top"], parts: true, remove: "top", how: "rebuild" },
    { name: "rebuild-three-planes", faces: ["front", "right", "top"], parts: true, remove: "front", how: "rebuild" },
    { name: "rebuild-absent-face", faces: ["front"], parts: true, remove: "left", how: "rebuild" },
    { name: "rebuild-selected-plane", faces: ["front", "right"], parts: true, remove: "right", how: "selected", selectFirst: "right" },
  ];
  const lifecycle = [];
  for (const sc of scenarios) {
    useSplitFaceStore.getState().clearForModelReplacement();
    const store = useSplitFaceStore.getState();
    store.enterSelection();
    for (const face of sc.faces) useSplitFaceStore.getState().toggleFace(face);
    if (sc.parts) expect(await useSplitFaceStore.getState().createMoldParts("model", k1Cube)).toBe(true);
    if (sc.selectFirst) useSplitFaceStore.getState().selectSplitFace(sc.selectFirst);
    if (sc.generating) useSplitFaceStore.setState({ workflow: "generatingParts" });
    const before = stateSnapshot();
    let returned: boolean | null = null;
    if (sc.how === "remove") useSplitFaceStore.getState().removeSplitFace(sc.remove);
    else if (sc.how === "rebuild") returned = await useSplitFaceStore.getState().removeSplitFaceAndRebuild(sc.remove, "model", k1Cube);
    else returned = await useSplitFaceStore.getState().removeSelectedSplitFaceAndRebuild("model", k1Cube);
    lifecycle.push({ ...sc, before, after: stateSnapshot(), returned });
  }

  const fixture = {
    generatedFrom: "mold/frontend/src/features/viewport/runtime/cuttingPlane3dRuntime.ts and split-face/splitFace.store.ts",
    viewport: { width: W, height: H },
    camera: { fov: 45, near: 0.1, far: 1000, position: { x: 45, y: -70, z: 75 }, target: { x: 0, y: 0, z: 15 }, up: { x: 0, y: 0, z: 1 } },
    k1: K1,
    k2,
    clearanceMm: CLEARANCE,
    records: records.map((r) => ({ id: r.id, sourceFaceId: r.sourceFaceId, axis: r.axis, normalizedPosition: r.normalizedPosition, enabled: r.enabled, worldCoordinate: normalizedToWorldCoordinate(K1, r.axis, r.normalizedPosition) })),
    slabs,
    hoverLook: hoverLookRecorded,
    picks,
    presses,
    secondaryPress: secondary,
    deactivate: { hoverBefore: hoverBeforeDeactivate, hoverAfter: hoverAfterDeactivate },
    lifecycle,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 1));
  expect(slabs.length).toBe(4);
});
