import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CavityToolData } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import type { MoldMeshPayload } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import { createSpruePreview3dRuntime } from "@/features/viewport/runtime/spruePreview3dRuntime";

function payloadFromBox(size: number): MoldMeshPayload {
  const geometry = new BoxGeometry(size, size, size);
  const position = geometry.getAttribute("position");
  const payload = {
    positions: Array.from(position.array),
    indices: Array.from(geometry.index?.array ?? []),
  };
  geometry.dispose();
  return payload;
}

function cavityToolFromBox(size: number): CavityToolData {
  const mesh = payloadFromBox(size);
  const halfSize = size / 2;
  return {
    mesh,
    bounds: {
      min: { x: -halfSize, y: -halfSize, z: -halfSize },
      max: { x: halfSize, y: halfSize, z: halfSize },
    },
    volumeMm3: size ** 3,
    triangleCount: mesh.indices.length / 3,
    connectedComponentCount: 1,
    watertight: true,
    manifold: true,
    warnings: [],
    clearanceMm: 0,
    implementationMethod: "exact-watertight-part-solid",
    qualityMode: "high",
  };
}

let rafQueue: Map<number, FrameRequestCallback>;
let nextRafId: number;

beforeEach(() => {
  rafQueue = new Map();
  nextRafId = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextRafId;
    nextRafId += 1;
    rafQueue.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafQueue.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flushOneFrame() {
  const [id, callback] = [...rafQueue][0]!;
  rafQueue.delete(id);
  callback(16);
}

function pointerEvent(type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, {
    button: 0,
    // Hover moves carry no pressed buttons -- a pressed button is a drag
    // gesture and must not schedule placement preview work.
    buttons: 0,
    clientX: x,
    clientY: y,
    isPrimary: true,
    pointerId: 1,
  });
  return event;
}

describe("Sprue pointer placement RAF coalescing", () => {
  function setup() {
    const canvas = document.createElement("canvas");
    // jsdom canvases have zero size; normalizePointerToNdc needs a real rect.
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 40);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const onValidPlacementClick = vi.fn();
    const runtime = createSpruePreview3dRuntime({
      camera,
      canvas,
      invalidate: vi.fn(),
      onValidPlacementClick,
    });
    const moldRoot = new Group();
    const mold = new Mesh(
      new BoxGeometry(10, 10, 10),
      new MeshStandardMaterial(),
    );
    mold.userData.moldBodyId = "body-1";
    mold.userData.cavityAffected = true;
    mold.userData.moldTopZ = 5;
    moldRoot.add(mold);
    runtime.setMoldRoot(moldRoot);
    runtime.setCavityGeometry(cavityToolFromBox(4));
    runtime.setActive(true);
    return { canvas, onValidPlacementClick, runtime };
  }

  it("coalesces 100 pointermove events into exactly one expensive placement update per frame, using the latest coordinate", () => {
    const { canvas, runtime } = setup();

    // Frame 1: one move -> one queued job.
    canvas.dispatchEvent(pointerEvent("pointermove", 110, 100));
    expect(rafQueue.size).toBe(1);
    expect(runtime.getPlacement()).toBeNull();
    flushOneFrame();
    const firstPlacement = runtime.getPlacement();
    expect(firstPlacement?.status).toBe("valid");
    expect(firstPlacement?.topPoint.x).toBeGreaterThan(0);

    // 100 moves in ONE frame: exactly one queued expensive update, and no
    // intermediate placement work ran (placement still shows frame 1). The
    // coordinates stay within the cavity region so the final placement is
    // valid.
    for (let index = 0; index < 100; index += 1) {
      canvas.dispatchEvent(pointerEvent("pointermove", 111 + (index % 2), 100));
    }
    expect(rafQueue.size).toBe(1);
    expect(runtime.getPlacement()?.topPoint.x).toBe(firstPlacement?.topPoint.x);

    flushOneFrame();
    const coalescedPlacement = runtime.getPlacement();
    expect(coalescedPlacement?.status).toBe("valid");
    // The single update used the LATEST pointer coordinate.
    expect(coalescedPlacement?.topPoint.x).toBeGreaterThan(firstPlacement!.topPoint.x);

    // Flushing again without new moves runs nothing further.
    expect(rafQueue.size).toBe(0);
    expect(runtime.getPlacement()?.topPoint.x).toBe(coalescedPlacement?.topPoint.x);

    runtime.dispose();
  });

  it("cancels the queued placement update when the tool deactivates before the frame runs", () => {
    const { canvas, runtime } = setup();

    canvas.dispatchEvent(pointerEvent("pointermove", 110, 100));
    expect(rafQueue.size).toBe(1);

    runtime.setActive(false);
    expect(rafQueue.size).toBe(0);

    // Any stray flush runs nothing: the placement never appears.
    expect(runtime.getPlacement()).toBeNull();
    runtime.dispose();
  });

  it("commits the latest pending pointer state at the click boundary even if the RAF has not fired", () => {
    const { canvas, onValidPlacementClick, runtime } = setup();

    canvas.dispatchEvent(pointerEvent("pointermove", 110, 100));
    canvas.dispatchEvent(pointerEvent("pointermove", 112, 100));
    // No frame has run yet: the queued latest coordinate must still be what
    // the click commits.
    expect(rafQueue.size).toBe(1);

    canvas.dispatchEvent(pointerEvent("pointerdown", 112, 100));
    canvas.dispatchEvent(pointerEvent("pointerup", 112, 100));

    expect(onValidPlacementClick).toHaveBeenCalledTimes(1);
    const placement = onValidPlacementClick.mock.calls[0]![0];
    expect(placement.status).toBe("valid");
    // x=120 maps to a larger NDC than x=110: the click used the latest move.
    expect(placement.topPoint.x).toBeGreaterThan(1);

    runtime.dispose();
  });
});
