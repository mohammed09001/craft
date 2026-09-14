import { describe, expect, it, vi } from "vitest";

import { createMasterMoldBody3dRuntime } from "../runtime/masterMoldBody3dRuntime";
import type { MasterMoldRenderableBody } from "../../mold-generation/master-mold/masterMoldViewportAdapter";

// Execution 05 Article 02: visibility is presentation state and must not sit
// inside the rebuild identity. Flipping a Master Mold body's `visible` must
// update the existing Three.js mesh in place -- not trigger (or be blocked
// by) a full geometry rebuild.

const body = (overrides: Partial<MasterMoldRenderableBody>): MasterMoldRenderableBody => ({
  id: "piece-1",
  name: "T1",
  visible: true,
  stale: false,
  geometryIdentity: "geom-1",
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
  triangleCount: 12,
  volumeMm3: 1000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 10, 10, 0, 10],
    indices: [0, 1, 2, 3, 4, 5],
  },
  ...overrides,
});

function meshByBodyId(group: { traverse: (cb: (node: unknown) => void) => void }) {
  const found = new Map<string, { visible: boolean; geometry: unknown }>();
  group.traverse((node) => {
    const descendant = node as { isMesh?: boolean; userData?: { moldBodyId?: string }; visible?: boolean; geometry?: unknown };
    if (!descendant.isMesh) return;
    const bodyId = descendant.userData?.moldBodyId;
    if (typeof bodyId === "string") found.set(bodyId, { visible: descendant.visible ?? true, geometry: descendant.geometry });
  });
  return found;
}

describe("master mold runtime presentation synchronization (Execution 05 Article 02)", () => {
  it("flips the existing mesh's visibility without rebuilding geometry", () => {
    const invalidate = vi.fn();
    const runtime = createMasterMoldBody3dRuntime(invalidate);
    runtime.setBodies([body({})]);
    const before = meshByBodyId(runtime.object);

    runtime.setBodies([body({ visible: false })]);

    const after = meshByBodyId(runtime.object);
    expect(after.get("piece-1")?.visible).toBe(false);
    expect(after.get("piece-1")?.geometry).toBe(before.get("piece-1")?.geometry);

    runtime.setBodies([body({})]);
    expect(meshByBodyId(runtime.object).get("piece-1")?.visible).toBe(true);

    runtime.dispose();
  });

  it("still rebuilds when the geometry identity changes", () => {
    const invalidate = vi.fn();
    const runtime = createMasterMoldBody3dRuntime(invalidate);
    runtime.setBodies([body({})]);
    const before = meshByBodyId(runtime.object);
    const rebuildsBefore = invalidate.mock.calls.length;

    runtime.setBodies([body({ geometryIdentity: "geom-2" })]);

    const after = meshByBodyId(runtime.object);
    expect(after.get("piece-1")?.geometry).not.toBe(before.get("piece-1")?.geometry);
    expect(invalidate.mock.calls.length).toBeGreaterThan(rebuildsBefore);

    runtime.dispose();
  });
});
