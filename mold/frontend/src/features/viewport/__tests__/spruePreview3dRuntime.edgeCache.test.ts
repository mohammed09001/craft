import { describe, expect, it, vi, beforeEach } from "vitest";

// Deterministic construction/disposal spy at the module boundary: count real
// EdgesGeometry work without exposing any production test counters.
const edgesGeometryTracker = { constructed: 0, disposed: 0 };

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class CountingEdgesGeometry extends actual.EdgesGeometry {
    constructor(...args: ConstructorParameters<typeof actual.EdgesGeometry>) {
      super(...args);
      edgesGeometryTracker.constructed += 1;
    }
    override dispose() {
      edgesGeometryTracker.disposed += 1;
      return super.dispose();
    }
  }
  return { ...actual, EdgesGeometry: CountingEdgesGeometry };
});

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
} from "three";
import { createSpruePreview3dRuntime } from "@/features/viewport/runtime/spruePreview3dRuntime";

function setup() {
  const canvas = document.createElement("canvas");
  const runtime = createSpruePreview3dRuntime({
    camera: new PerspectiveCamera(),
    canvas,
    invalidate: vi.fn(),
    onValidPlacementClick: vi.fn(),
  });
  return { canvas, runtime };
}

describe("Sprue glass edge reuse", () => {
  beforeEach(() => {
    edgesGeometryTracker.constructed = 0;
    edgesGeometryTracker.disposed = 0;
  });

  function moldWithGeometry(geometry: BoxGeometry) {
    const moldRoot = new Group();
    const mold = new Mesh(
      geometry,
      new MeshStandardMaterial({ opacity: 0.67, transparent: true }),
    );
    mold.name = "Mold body";
    mold.userData.moldBodyId = "body-1";
    mold.userData.cavityAffected = true;
    mold.userData.moldTopZ = 5;
    moldRoot.add(mold);
    return { moldRoot, mold };
  }

  it("does not rebuild EdgesGeometry when Sprue reactivates against unchanged geometry", () => {
    const geometry = new BoxGeometry(10, 10, 10);
    const { runtime } = setup();
    const { moldRoot, mold } = moldWithGeometry(geometry);
    runtime.setMoldRoot(moldRoot);

    runtime.setActive(true);
    const firstActivationConstructions = edgesGeometryTracker.constructed;
    expect(firstActivationConstructions).toBeGreaterThan(0);
    expect(mold.getObjectByName("SprueGlassEdges")).toBeDefined();

    // Deactivate: overlays detach but stay cached.
    runtime.setActive(false);
    expect(mold.getObjectByName("SprueGlassEdges")).toBeUndefined();
    expect(edgesGeometryTracker.constructed).toBe(firstActivationConstructions);
    expect(edgesGeometryTracker.disposed).toBe(0);

    // Reactivate on the same geometry: zero new extractions, no duplicates.
    runtime.setActive(true);
    expect(edgesGeometryTracker.constructed).toBe(firstActivationConstructions);
    const edgesChildren = mold.children.filter((child) => child.name === "SprueGlassEdges");
    expect(edgesChildren).toHaveLength(1);

    runtime.dispose();
    geometry.dispose();
  });

  it("recreates exactly the affected edge entry when one source geometry is replaced", () => {
    const firstGeometry = new BoxGeometry(10, 10, 10);
    const { runtime } = setup();
    const { moldRoot, mold } = moldWithGeometry(firstGeometry);
    runtime.setMoldRoot(moldRoot);
    runtime.setActive(true);
    const baseline = edgesGeometryTracker.constructed;

    // Replace the source geometry with a new object (model re-mesh).
    mold.geometry = new BoxGeometry(12, 10, 10);
    firstGeometry.dispose();
    runtime.setActive(false);
    runtime.setActive(true);

    // Exactly one new extraction for the replaced geometry; the stale entry
    // was pruned and disposed, and no duplicate children accumulated.
    expect(edgesGeometryTracker.constructed).toBe(baseline + 1);
    expect(edgesGeometryTracker.disposed).toBe(1);
    expect(mold.children.filter((child) => child.name === "SprueGlassEdges")).toHaveLength(1);

    runtime.dispose();
    mold.geometry.dispose();
  });

  it("disposes every cached edge geometry on runtime disposal", () => {
    const geometry = new BoxGeometry(10, 10, 10);
    const { runtime } = setup();
    const { moldRoot } = moldWithGeometry(geometry);
    runtime.setMoldRoot(moldRoot);
    runtime.setActive(true);
    const constructed = edgesGeometryTracker.constructed;
    expect(constructed).toBeGreaterThan(0);

    // Deactivate first: cached entries must still be alive for reuse.
    runtime.setActive(false);
    expect(edgesGeometryTracker.disposed).toBe(0);

    runtime.dispose();
    expect(edgesGeometryTracker.disposed).toBe(constructed);
    geometry.dispose();
  });
});
