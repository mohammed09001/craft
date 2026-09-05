import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  type Object3D,
} from "three";

import type { ModelSelectionStatus } from "@/features/viewport/modelSelection.store";
import { createModelSelectionRuntime } from "@/features/viewport/runtime/modelSelectionRuntime";
import type { RenderScheduler } from "@/features/viewport/runtime/renderScheduler";

const PALETTE = {
  background: "#0b1118",
  gridMajor: "#303943",
  gridMinor: "#46525f",
};

function createPointerEvent(
  type: string,
  init: Partial<PointerEvent> & { clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.assign(event, {
    button: init.button ?? 0,
    clientX: init.clientX,
    clientY: init.clientY,
    isPrimary: init.isPrimary ?? true,
    pointerId: init.pointerId ?? 1,
  });

  return event as PointerEvent;
}

function createHarness() {
  const canvas = document.createElement("canvas");
  const statuses: ModelSelectionStatus[] = [];
  const splitFaces: string[] = [];
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  const scheduler = {
    dispose: vi.fn(),
    invalidate: vi.fn(),
  } satisfies RenderScheduler;

  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  Object.defineProperty(canvas, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }),
  });

  const runtime = createModelSelectionRuntime({
    camera,
    canvas,
    onSelectionChange: (status) => statuses.push(status),
    onSplitFaceToggle: (face) => splitFaces.push(face),
    palette: PALETTE,
    scheduler,
  });
  const mesh = new Mesh(
    new BoxGeometry(2, 2, 2),
    new MeshStandardMaterial({ color: 0xb8e3ec }),
  );

  mesh.updateMatrixWorld(true);
  runtime.resetForModelReplacement({ modelId: "model-1", target: mesh });

  return {
    canvas,
    mesh,
    runtime,
    scheduler,
    statuses,
    splitFaces,
  };
}

it("hides and restores the selection box without clearing model selection", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });

  const { canvas, mesh, runtime, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", {
      clientX: 50,
      clientY: 50,
    }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", {
      clientX: 50,
      clientY: 50,
    }),
  );

  const selectionBox = mesh.getObjectByName(
    "ObjectSelectionBoundingBox",
  );

  expect(selectionBox).toBeDefined();
  expect(selectionBox?.visible).toBe(true);
  expect(statuses.at(-1)?.isModelSelected).toBe(true);

  runtime.setSelectionBoxVisible(false);

  expect(selectionBox?.visible).toBe(false);
  expect(statuses.at(-1)?.isModelSelected).toBe(true);

  runtime.setSelectionBoxVisible(true);

  expect(selectionBox?.visible).toBe(true);
  expect(statuses.at(-1)?.isModelSelected).toBe(true);
});

it("re-derives semantic face bounds after an orientation geometry change without model replacement", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  const { canvas, mesh, runtime, statuses } = createHarness();
  canvas.dispatchEvent(createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }));
  canvas.dispatchEvent(createPointerEvent("pointerup", { clientX: 50, clientY: 50 }));

  const previousGeometry = mesh.geometry;
  mesh.geometry = new BoxGeometry(4, 2, 6);
  mesh.updateMatrixWorld(true);
  runtime.refreshForModelTransform({ modelId: "model-1", target: mesh });

  expect(statuses.at(-1)).toEqual(expect.objectContaining({
    isModelSelected: true,
    selectedModelId: "model-1",
    selectionBoxBounds: {
      min: { x: -2, y: -1, z: -3 },
      max: { x: 2, y: 1, z: 3 },
    },
  }));
  previousGeometry.dispose();
  runtime.dispose();
});

it("selects a canonical K1 face in split mode", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
  const { canvas, runtime, splitFaces } = createHarness();
  canvas.dispatchEvent(createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }));
  canvas.dispatchEvent(createPointerEvent("pointerup", { clientX: 50, clientY: 50 }));
  runtime.setSplitFaceSelection(true, []);
  canvas.dispatchEvent(createPointerEvent("pointermove", { clientX: 50, clientY: 50 }));
  canvas.dispatchEvent(createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }));
  canvas.dispatchEvent(createPointerEvent("pointerup", { clientX: 50, clientY: 50 }));
  expect(splitFaces).toEqual(["top"]);
});

function hasDescendantNamed(root: Object3D, name: string) {
  let found = false;

  root.traverse((child) => {
    if (child.name === name) {
      found = true;
    }
  });

  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("selects the whole model on a true primary click", () => {
  const { canvas, mesh, scheduler, statuses } = createHarness();
  const originalMaterial = mesh.material;

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  expect(statuses.at(-1)).toEqual({
    isModelSelected: true,
    selectedModelId: "model-1",
    selectionBoxBounds: {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    },
    announcement: "Model selected.",
  });
  expect(mesh.material).not.toBe(originalMaterial);
  expect(scheduler.invalidate).toHaveBeenCalled();
});

it("clears selection on empty click and Escape", () => {
  const { canvas, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 99, clientY: 99 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 99, clientY: 99 }),
  );

  expect(statuses.at(-1)).toEqual({
    isModelSelected: false,
    announcement: "Selection cleared.",
  });

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

  expect(statuses.at(-1)).toEqual({
    isModelSelected: false,
    announcement: "Selection cleared.",
  });
});

it("does not select after drag or non-left button release", () => {
  const { canvas, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointermove", { clientX: 58, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 58, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerdown", {
      button: 2,
      clientX: 50,
      clientY: 50,
    }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", {
      button: 2,
      clientX: 50,
      clientY: 50,
    }),
  );

  expect(statuses).toEqual([{ isModelSelected: false }]);
});

it("uses throttled hover picking for cursor feedback and cleans it on leave", () => {
  const requestAnimationFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const { canvas } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointermove", { clientX: 50, clientY: 50 }),
  );

  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  expect(canvas.style.cursor).toBe("pointer");

  canvas.dispatchEvent(
    createPointerEvent("pointerleave", { clientX: 50, clientY: 50 }),
  );

  expect(canvas.style.cursor).toBe("");
});

it("does not create an STL face hover overlay during selected model hover", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const { canvas, mesh, runtime } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  expect(
    mesh.children.some((child) => child.name === "ModelFaceHoverPreview"),
  ).toBe(false);

  canvas.dispatchEvent(
    createPointerEvent("pointermove", { clientX: 50, clientY: 50 }),
  );

  expect(
    mesh.children.some((child) => child.name === "ModelFaceHoverPreview"),
  ).toBe(false);
  expect(canvas.style.cursor).toBe("pointer");

  runtime.setActiveTool("measure-distance");

  expect(
    mesh.children.some((child) => child.name === "ModelFaceHoverPreview"),
  ).toBe(false);
});

it("clicking an already-selected model's face again does not change the camera or selection", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const { canvas, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );
  const statusCountAfterFirstClick = statuses.length;

  canvas.dispatchEvent(
    createPointerEvent("pointermove", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  // A second click on the same already-selected face is a plain 3D
  // reselect -- 2D box-face focus mode no longer exists, so it must not
  // emit another selection status or otherwise change state.
  expect(statuses).toHaveLength(statusCountAfterFirstClick);
  expect(statuses.at(-1)).toEqual({
    isModelSelected: true,
    selectedModelId: "model-1",
    selectionBoxBounds: {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    },
    announcement: "Model selected.",
  });
});

it("blocks left-click selection while a visual-only tool owns hover", () => {
  const { canvas, mesh, runtime, statuses } = createHarness();
  const statusCountBeforeClick = statuses.length;
  runtime.setInteractionBlocked(true);

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  expect(statuses).toHaveLength(statusCountBeforeClick);
  expect(hasDescendantNamed(mesh, "ObjectSelectionBoundingBox")).toBe(false);
});

it("clears the selection box when the selected model is replaced", () => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  const { canvas, mesh, runtime } = createHarness();
  const replacementMesh = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0xffffff }),
  );

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  expect(hasDescendantNamed(mesh, "ObjectSelectionBoundingBox")).toBe(true);

  runtime.resetForModelReplacement({
    modelId: "model-2",
    target: replacementMesh,
  });

  expect(hasDescendantNamed(mesh, "ObjectSelectionBoundingBox")).toBe(false);
  expect(
    mesh.children.some((child) => child.name === "ModelFaceHoverPreview"),
  ).toBe(false);

  replacementMesh.geometry.dispose();
  replacementMesh.material.dispose();
});
