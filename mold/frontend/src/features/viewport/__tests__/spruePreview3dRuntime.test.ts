import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Ray,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";

import type { CavityToolData } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import type { MoldMeshPayload } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import { createSpruePreview3dRuntime } from "@/features/viewport/runtime/spruePreview3dRuntime";

function payloadFromBox(size: number): MoldMeshPayload {
  const geometry = new BoxGeometry(size, size, size);
  const position = geometry.getAttribute("position");
  const payload = {
    positions: Array.from(position.array),
    indices:
      geometry.index === null
        ? Array.from({ length: position.count }, (_, index) => index)
        : Array.from(geometry.index.array),
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

function setup(onValidPlacementClick = vi.fn()) {
  const canvas = document.createElement("canvas");
  const invalidate = vi.fn();
  const runtime = createSpruePreview3dRuntime({
    camera: new PerspectiveCamera(),
    canvas,
    invalidate,
    onValidPlacementClick,
  });
  const moldRoot = new Group();
  const moldMaterial = new MeshStandardMaterial({
    depthWrite: true,
    opacity: 0.67,
    transparent: true,
  });
  const mold = new Mesh(new BoxGeometry(10, 10, 10), moldMaterial);
  mold.name = "Mold body";
  mold.userData.moldBodyId = "body-1";
  mold.userData.cavityAffected = true;
  mold.userData.moldTopZ = 5;
  moldRoot.add(mold);
  runtime.setMoldRoot(moldRoot);
  runtime.setCavityGeometry(cavityToolFromBox(4));

  return { canvas, invalidate, mold, moldMaterial, moldRoot, onValidPlacementClick, runtime };
}

const topRay = (x = 0, y = 0) =>
  new Ray(new Vector3(x, y, 20), new Vector3(0, 0, -1));

function pointerEvent(type: string, options: { x: number; y: number; buttons?: number }) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, {
    button: 0,
    buttons: options.buttons ?? 0,
    clientX: options.x,
    clientY: options.y,
    isPrimary: true,
    pointerId: 1,
  });
  return event;
}

describe("Sprue 3D preview runtime", () => {
  it("temporarily glasses affected mold bodies and restores their exact state", () => {
    const { invalidate, mold, moldMaterial, runtime } = setup();

    runtime.setActive(true);
    expect(moldMaterial.opacity).toBe(0.28);
    expect(moldMaterial.transparent).toBe(true);
    expect(moldMaterial.depthWrite).toBe(false);
    expect(mold.getObjectByName("SprueGlassEdges")).toBeDefined();

    invalidate.mockClear();
    runtime.setActive(false);
    expect(moldMaterial.opacity).toBe(0.67);
    expect(moldMaterial.transparent).toBe(true);
    expect(moldMaterial.depthWrite).toBe(true);
    expect(mold.getObjectByName("SprueGlassEdges")).toBeUndefined();
    expect(invalidate).toHaveBeenCalled();
    runtime.dispose();
  });

  it("rejects horizontal body surfaces below the canonical mold Top plane", () => {
    const { mold, runtime } = setup();
    mold.userData.moldTopZ = 8;
    runtime.setActive(true);

    expect(runtime.updateFromRay(topRay())).toBeNull();
    expect(runtime.object.visible).toBe(false);
    runtime.dispose();
  });

  it("shows only over the canonical Top face with a cavity below it", () => {
    const { runtime } = setup();
    runtime.setActive(true);

    expect(runtime.updateFromRay(topRay())).toMatchObject({ status: "valid" });
    expect(runtime.object.visible).toBe(true);

    const sideRay = new Ray(
      new Vector3(20, 0, 0),
      new Vector3(-1, 0, 0),
    );
    expect(runtime.updateFromRay(sideRay)).toBeNull();
    expect(runtime.object.visible).toBe(false);
    const bottomRay = new Ray(
      new Vector3(0, 0, -20),
      new Vector3(0, 0, 1),
    );
    expect(runtime.updateFromRay(bottomRay)).toBeNull();
    expect(runtime.object.visible).toBe(false);
    runtime.dispose();
  });

  it("uses the nearest cavity intersection for the dynamic stem length", () => {
    const { runtime } = setup();
    runtime.setActive(true);
    expect(runtime.updateFromRay(topRay())).toMatchObject({ status: "valid" });

    const stem = runtime.object.getObjectByName("SpruePreviewStem");
    const entryNeck = runtime.object.getObjectByName("SpruePreviewEntryNeck");
    expect(stem).toBeInstanceOf(Mesh);
    expect(entryNeck).toBeInstanceOf(Mesh);
    expect(stem!.scale.y + entryNeck!.scale.y).toBeCloseTo(3, 5);
    expect(stem!.position.z - entryNeck!.position.z).toBeCloseTo(
      (stem!.scale.y + entryNeck!.scale.y) / 2,
      5,
    );
    runtime.dispose();
  });

  it.each([2, 4])("stays green when the cavity path crosses %i mold bodies", (bodyCount) => {
    const { mold, moldRoot, runtime } = setup();
    mold.removeFromParent();
    mold.geometry.dispose();
    const layerHeight = 10 / bodyCount;
    for (let index = 0; index < bodyCount; index += 1) {
      const layer = new Mesh(
        new BoxGeometry(10, 10, layerHeight),
        new MeshStandardMaterial(),
      );
      layer.position.z = -5 + layerHeight * (index + 0.5);
      layer.userData.moldBodyId = `body-${index}`;
      layer.userData.cavityAffected = true;
      layer.userData.moldTopZ = layerHeight / 2;
      moldRoot.add(layer);
    }
    runtime.setMoldRoot(moldRoot);
    runtime.setActive(true);

    const placement = runtime.updateFromRay(topRay());

    expect(placement).toMatchObject({ status: "valid" });
    const material = (runtime.object.getObjectByName("SpruePreviewStem") as Mesh)
      .material as MeshStandardMaterial;
    expect(material.color.getHex()).toBe(0x31975a);
    runtime.dispose();
  });

  it("moves continuously and shows a bounds-derived red stem without a cavity hit", () => {
    const { runtime } = setup();
    runtime.setActive(true);
    expect(runtime.updateFromRay(topRay(0, 0))).toMatchObject({ status: "valid" });
    const stem = runtime.object.getObjectByName("SpruePreviewStem")!;
    const initialX = stem.position.x;

    expect(runtime.updateFromRay(topRay(1, 0))).toMatchObject({ status: "valid" });
    expect(stem.position.x).not.toBe(initialX);
    expect(stem.position.x).toBeCloseTo(1);

    const invalid = runtime.updateFromRay(topRay(4, 0));
    expect(invalid).toMatchObject({
      status: "invalid",
      stemLengthMm: 10,
      topPoint: { x: 4, y: 0, z: 5 },
    });
    expect(runtime.object.visible).toBe(true);
    const entryNeck = runtime.object.getObjectByName("SpruePreviewEntryNeck")!;
    expect(stem.scale.y + entryNeck.scale.y).toBeCloseTo(10);
    expect(Number.isFinite(stem.scale.y)).toBe(true);
    expect(Number.isFinite(entryNeck.scale.y)).toBe(true);
    const previewMaterial = (stem as Mesh).material as MeshStandardMaterial;
    expect(previewMaterial.color.getHex()).toBe(0xb33a36);
    expect(
      (runtime.object.getObjectByName("SpruePreviewFunnel") as Mesh).material,
    ).toBe(previewMaterial);
    runtime.dispose();
  });

  it("reuses the same meshes through repeated red and green transitions", () => {
    const { runtime } = setup();
    runtime.setActive(true);
    const funnel = runtime.object.getObjectByName("SpruePreviewFunnel");
    const stem = runtime.object.getObjectByName("SpruePreviewStem") as Mesh;
    const entryNeck = runtime.object.getObjectByName(
      "SpruePreviewEntryNeck",
    ) as Mesh;
    const previewMaterial = stem.material as MeshStandardMaterial;

    expect(runtime.updateFromRay(topRay(4))).toMatchObject({ status: "invalid" });
    expect(previewMaterial.color.getHex()).toBe(0xb33a36);
    const validPlacement = runtime.updateFromRay(topRay());
    expect(validPlacement).toMatchObject({ status: "valid" });
    expect(previewMaterial.color.getHex()).toBe(0x31975a);

    if (validPlacement?.status !== "valid") {
      throw new Error("Expected a valid engineering Sprue placement.");
    }

    stem.geometry.computeBoundingBox();
    entryNeck.geometry.computeBoundingBox();

    const stemBounds = stem.geometry.boundingBox;
    const entryNeckBounds = entryNeck.geometry.boundingBox;

    expect(stemBounds).not.toBeNull();
    expect(entryNeckBounds).not.toBeNull();

    const visualMainDiameterMm =
      ((stemBounds?.max.x ?? 0) - (stemBounds?.min.x ?? 0)) * stem.scale.x;
    const visualEntryNeckDiameterMm =
      ((entryNeckBounds?.max.x ?? 0) - (entryNeckBounds?.min.x ?? 0)) *
      entryNeck.scale.x;

    expect(visualMainDiameterMm).toBeCloseTo(
      validPlacement.profileDesign.profile.mainDiameterMm,
      5,
    );
    expect(visualEntryNeckDiameterMm).toBeCloseTo(
      validPlacement.profileDesign.profile.entryNeckDiameterMm,
      5,
    );

    expect(runtime.updateFromRay(topRay(4))).toMatchObject({ status: "invalid" });
    expect(previewMaterial.color.getHex()).toBe(0xb33a36);
    expect(runtime.updateFromRay(topRay())).toMatchObject({ status: "valid" });
    expect(runtime.object.children).toEqual([funnel, stem, entryNeck]);
    runtime.dispose();
  });

  it("emits valid and pending top-surface placements while blocking outside and drag gestures", () => {
    const { canvas, onValidPlacementClick, runtime } = setup();
    runtime.setActive(true);
    const valid = runtime.updateFromRay(topRay());
    expect(valid).toMatchObject({
      status: "valid",
      topPoint: { x: 0, y: 0, z: 5 },
      cavityPoint: { x: 0, y: 0, z: 2 },
      inwardDirection: { x: 0, y: 0, z: -1 },
      stemLengthMm: 3,
      coordinateSpace: "mold-local",
    });
    expect(valid).not.toBeNull();
    expect(valid?.profileDesign.profile.mainDiameterMm).toBeGreaterThan(0);
    expect(valid?.profileDesign.profile.entryNeckDiameterMm).toBeGreaterThan(0);
    expect(valid?.profileDesign.profile.entryNeckLengthMm).toBeGreaterThan(0);
    expect(valid?.profileDesign.profile.mainDiameterMm).toBeGreaterThanOrEqual(
      valid?.profileDesign.profile.entryNeckDiameterMm ?? Number.POSITIVE_INFINITY,
    );
    canvas.dispatchEvent(pointerEvent("pointerdown", { x: 10, y: 10, buttons: 1 }));
    canvas.dispatchEvent(pointerEvent("pointerup", { x: 10, y: 10 }));
    expect(onValidPlacementClick).toHaveBeenCalledTimes(1);
    expect(onValidPlacementClick).toHaveBeenCalledWith(valid);
    expect(onValidPlacementClick.mock.calls[0]![0].profileDesign).toBe(
      valid?.profileDesign,
    );

    runtime.updateFromRay(topRay(4));
    canvas.dispatchEvent(pointerEvent("pointerdown", { x: 10, y: 10, buttons: 1 }));
    canvas.dispatchEvent(pointerEvent("pointerup", { x: 10, y: 10 }));
    runtime.updateFromRay(new Ray(new Vector3(20, 0, 0), new Vector3(-1, 0, 0)));
    canvas.dispatchEvent(pointerEvent("pointerdown", { x: 10, y: 10, buttons: 1 }));
    canvas.dispatchEvent(pointerEvent("pointerup", { x: 10, y: 10 }));

    runtime.updateFromRay(topRay());
    canvas.dispatchEvent(pointerEvent("pointerdown", { x: 10, y: 10, buttons: 1 }));
    canvas.dispatchEvent(pointerEvent("pointermove", { x: 20, y: 20, buttons: 1 }));
    canvas.dispatchEvent(pointerEvent("pointerup", { x: 20, y: 20 }));
    expect(onValidPlacementClick).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it("clears on leave, cancel, tool change, mold/cavity replacement, and dispose", () => {
    const { canvas, mold, moldMaterial, runtime } = setup();
    runtime.setActive(true);
    runtime.updateFromRay(topRay());
    runtime.clearPreview();
    expect(runtime.object.visible).toBe(false);

    runtime.updateFromRay(topRay());
    canvas.dispatchEvent(new Event("pointerleave"));
    expect(runtime.object.visible).toBe(false);

    runtime.updateFromRay(topRay());
    canvas.dispatchEvent(new Event("pointercancel"));
    expect(runtime.object.visible).toBe(false);

    runtime.updateFromRay(topRay());
    runtime.setActive(false);
    expect(runtime.object.visible).toBe(false);

    runtime.setActive(true);
    runtime.updateFromRay(topRay());
    runtime.setCavityGeometry(null);
    expect(runtime.object.visible).toBe(false);

    runtime.setCavityGeometry(cavityToolFromBox(4));
    runtime.updateFromRay(topRay());
    runtime.setMoldRoot(null);
    expect(runtime.object.visible).toBe(false);

    runtime.setMoldRoot(mold);
    expect(runtime.updateFromRay(topRay())).toMatchObject({ status: "valid" });
    runtime.dispose();
    expect(runtime.object.parent).toBeNull();
    expect(moldMaterial.opacity).toBe(0.67);
  });

  it("keeps preview helpers out of mold and cavity raycast targets", () => {
    const { moldRoot, runtime } = setup();
    moldRoot.add(runtime.object);
    runtime.setMoldRoot(moldRoot);
    runtime.setActive(true);

    expect(runtime.updateFromRay(topRay())).toMatchObject({ status: "valid" });
    expect(runtime.object.visible).toBe(true);
    runtime.dispose();
  });

  it("respects rotated parent coordinates and canonical inward Top direction", () => {
    const { moldRoot, runtime } = setup();
    const transformedParent = new Group();
    transformedParent.rotation.x = -Math.PI / 2;
    transformedParent.add(moldRoot);
    transformedParent.updateWorldMatrix(true, true);
    runtime.setMoldRoot(moldRoot);
    runtime.setActive(true);

    const transformedTopRay = new Ray(
      new Vector3(0, 20, 0),
      new Vector3(0, -1, 0),
    );
    const transformedPlacement = runtime.updateFromRay(transformedTopRay);
    expect(transformedPlacement).toMatchObject({ status: "valid" });
    expect(transformedPlacement?.topPoint.x).toBeCloseTo(0);
    expect(transformedPlacement?.topPoint.y).toBeCloseTo(0);
    expect(transformedPlacement?.topPoint.z).toBeCloseTo(5);
    expect(
      transformedPlacement?.status === "valid"
        ? transformedPlacement.cavityPoint.y
        : Number.NaN,
    ).toBeCloseTo(0);
    const stem = runtime.object.getObjectByName("SpruePreviewStem")!;
    const entryNeck = runtime.object.getObjectByName("SpruePreviewEntryNeck")!;
    expect(stem.scale.y + entryNeck.scale.y).toBeCloseTo(3, 5);
    expect(stem.position.y - entryNeck.position.y).toBeCloseTo(
      (stem.scale.y + entryNeck.scale.y) / 2,
      5,
    );
    runtime.dispose();
  });
});


