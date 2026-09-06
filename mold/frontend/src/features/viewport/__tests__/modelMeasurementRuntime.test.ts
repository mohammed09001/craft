import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from "three";

import type { DistanceMeasurementStatus } from "@/features/viewport/modelMeasurement.store";
import { createModelMeasurementRuntime } from "@/features/viewport/runtime/modelMeasurementRuntime";
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
  const statuses: DistanceMeasurementStatus[] = [];
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

  const runtime = createModelMeasurementRuntime({
    camera,
    canvas,
    onMeasurementChange: (status) => statuses.push(status),
    palette: PALETTE,
    scheduler,
  });
  const mesh = new Mesh(
    new BoxGeometry(2, 2, 2),
    new MeshStandardMaterial({ color: 0xb8e3ec }),
  );

  mesh.updateMatrixWorld(true);
  runtime.resetForModelReplacement({ modelId: "model-1", target: mesh });
  runtime.setActiveTool("measure-distance");

  return {
    canvas,
    mesh,
    runtime,
    scheduler,
    statuses,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("creates first marker, second marker, line, and distance from surface clicks", () => {
  const { canvas, mesh, scheduler, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  expect(statuses.at(-1)).toEqual(
    expect.objectContaining({
      activeTool: "measure-distance",
      phase: "awaiting-second-point",
      firstPoint: expect.objectContaining({ z: 1 }),
    }),
  );

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 56, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 56, clientY: 50 }),
  );

  expect(statuses.at(-1)).toEqual(
    expect.objectContaining({
      activeTool: "measure-distance",
      phase: "complete",
      distance: expect.any(Number),
      distanceLabel: expect.stringContaining("Model Units"),
      secondPoint: expect.objectContaining({ z: 1 }),
    }),
  );
  expect(mesh.children.find((child) => child.name === "Distance Measurement Overlay"))
    .toBeDefined();
  expect(scheduler.invalidate).toHaveBeenCalled();
});

it("does not create points for empty clicks, drags, or non-left buttons", () => {
  const { canvas, statuses } = createHarness();
  const statusCount = statuses.length;

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 99, clientY: 99 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 99, clientY: 99 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointermove", { clientX: 60, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 60, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerdown", {
      button: 1,
      clientX: 50,
      clientY: 50,
    }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", {
      button: 1,
      clientX: 50,
      clientY: 50,
    }),
  );

  expect(statuses).toHaveLength(statusCount);
});

it("cancels draft with Escape while keeping the measure tool active", () => {
  const { canvas, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

  expect(statuses.at(-1)).toEqual({
    activeTool: "measure-distance",
    phase: "awaiting-first-point",
    announcement: "Measurement draft canceled.",
  });
});

it("cleans measurement on successful replacement and disposal", () => {
  const { canvas, mesh, runtime, statuses } = createHarness();

  canvas.dispatchEvent(
    createPointerEvent("pointerdown", { clientX: 50, clientY: 50 }),
  );
  canvas.dispatchEvent(
    createPointerEvent("pointerup", { clientX: 50, clientY: 50 }),
  );

  expect(mesh.children).toHaveLength(1);

  runtime.resetForModelReplacement(null);

  expect(mesh.children).toHaveLength(0);
  expect(statuses.at(-1)).toEqual({
    activeTool: "measure-distance",
    phase: "awaiting-first-point",
  });

  runtime.dispose();
  runtime.dispose();
});
