import {
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";

import type { MoldBodyData } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import { createSegmentationVisualization3dRuntime } from "@/features/viewport/runtime/segmentationVisualization3dRuntime";
import {
  CAD_DARK_THEME,
  CAD_LIGHT_THEME,
} from "@/features/viewport/runtime/viewportVisualTheme";

const body: MoldBodyData = {
  id: "preview-body",
  name: "Preview Body",
  visible: true,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 20, z: 20 } },
  triangleCount: 2,
  volumeMm3: 8_000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 20, 0, 0, 0, 20, 0, 20, 20, 0],
    indices: [0, 1, 2, 1, 3, 2],
    faceRuns: [
      { startTriangle: 0, triangleCount: 1, role: "outer-mold" },
      { startTriangle: 1, triangleCount: 1, role: "registration-key" },
    ],
  },
};

describe("segmentation visualization runtime", () => {
  it("renders planned (preview) sections with the same final appearance as normal molds", () => {
    const runtime = createSegmentationVisualization3dRuntime(vi.fn());
    const sourceBeforeRendering = structuredClone(body);
    runtime.setVisualization(
      [body, { ...body, id: "preview-body-2", name: "Preview Body 2" }],
      [{ id: "boundary-x", axis: "x", coordinateMm: 10, ordinal: 0, sequenceIndex: 0 }],
      [],
    );

    const sections = runtime.object.getObjectByName(
      "Segmentation Planned Sections",
    ) as Group;
    expect(sections.children.filter((child) => child instanceof Mesh)).toHaveLength(2);
    const mesh = sections.getObjectByName("Preview Body") as Mesh;
    const materials = mesh.material as MeshStandardMaterial[];

    // Same material role -> same appearance as a normal (non-oversized) mold
    // body: no ghosted/translucent preview treatment.
    expect(materials[0]!.color.getHex()).toBe(CAD_DARK_THEME.outerMoldColor);
    expect(materials[0]!.transparent).toBe(false);
    expect(materials[0]!.opacity).toBe(1);
    expect(materials[0]!.depthWrite).toBe(true);
    expect(materials[0]!.roughness).toBe(CAD_DARK_THEME.outerRoughness);
    expect(materials[0]!.metalness).toBe(CAD_DARK_THEME.outerMetalness);
    expect(materials[1]!.color.getHex()).toBe(
      CAD_DARK_THEME.registrationKeyColor,
    );
    expect(materials[1]!.transparent).toBe(false);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(
      runtime.object.getObjectByName("Segmentation Preview Plane boundary-x"),
    ).toBeDefined();
    const previewPlane = runtime.object.getObjectByName(
      "Segmentation Preview Plane boundary-x",
    ) as Group;
    const planeSurface = previewPlane.children[0] as Mesh;
    const planeEdges = previewPlane.children[1] as LineSegments;
    expect(planeSurface.renderOrder).toBeGreaterThan(mesh.renderOrder);
    expect(planeEdges.renderOrder).toBeGreaterThan(planeSurface.renderOrder);
    expect(body).toEqual(sourceBeforeRendering);
    runtime.dispose();
  });

  it("keeps material role appearance stable across appearance and palette changes", () => {
    const runtime = createSegmentationVisualization3dRuntime(vi.fn());
    runtime.setVisualization([body], [], []);
    runtime.setAppearanceMode("glass");

    let mesh = runtime.object.getObjectByName("Preview Body") as Mesh;
    let materials = mesh.material as MeshStandardMaterial[];
    expect(materials[0]!.color.getHex()).toBe(CAD_DARK_THEME.outerMoldColor);
    expect(materials[0]!.transparent).toBe(true);

    runtime.setPalette({
      background: "rgb(245, 247, 250)",
      gridMajor: "rgb(100, 100, 100)",
      gridMinor: "rgb(150, 150, 150)",
    });
    mesh = runtime.object.getObjectByName("Preview Body") as Mesh;
    materials = mesh.material as MeshStandardMaterial[];
    expect(materials[0]!.color.getHex()).toBe(CAD_LIGHT_THEME.outerMoldColor);
    runtime.dispose();
  });

  it("hides preview geometry once a committed result exists, keeping committed appearance identical to preview's", () => {
    const runtime = createSegmentationVisualization3dRuntime(vi.fn());
    runtime.setVisualization([body], [], [body]);
    const planned = runtime.object.getObjectByName(
      "Segmentation Planned Sections",
    ) as Group;
    expect(planned.children).toHaveLength(0);
    const committed = runtime.object.getObjectByName(
      "Segmentation Committed Bodies",
    ) as Group;
    const mesh = committed.getObjectByName("Preview Body") as Mesh;
    const materials = mesh.material as MeshStandardMaterial[];
    expect(materials[0]!.color.getHex()).toBe(CAD_DARK_THEME.outerMoldColor);
    expect(materials[0]!.transparent).toBe(false);
    expect(materials[1]!.color.getHex()).toBe(
      CAD_DARK_THEME.registrationKeyColor,
    );
    expect(materials[1]!.transparent).toBe(false);
    runtime.dispose();
  });

  it("disposes replaced preview meshes, materials, and cutting-plane display resources", () => {
    const runtime = createSegmentationVisualization3dRuntime(vi.fn());
    runtime.setVisualization(
      [body],
      [
        {
          id: "boundary-x",
          axis: "x",
          coordinateMm: 10,
          ordinal: 0,
          sequenceIndex: 0,
        },
      ],
      [],
    );

    const mesh = runtime.object.getObjectByName("Preview Body") as Mesh;
    const materials = mesh.material as MeshStandardMaterial[];
    const plane = runtime.object.getObjectByName(
      "Segmentation Preview Plane boundary-x",
    ) as Group;
    const planeSurface = plane.children[0] as Mesh;
    const planeEdges = plane.children[1] as LineSegments;
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDisposals = materials.map((material) =>
      vi.spyOn(material, "dispose"),
    );
    const planeSurfaceGeometryDispose = vi.spyOn(
      planeSurface.geometry,
      "dispose",
    );
    const planeSurfaceMaterialDispose = vi.spyOn(
      planeSurface.material as MeshStandardMaterial,
      "dispose",
    );
    const edgeGeometryDispose = vi.spyOn(planeEdges.geometry, "dispose");
    const edgeMaterialDispose = vi.spyOn(
      planeEdges.material as LineBasicMaterial,
      "dispose",
    );

    runtime.setVisualization([], [], []);

    expect(geometryDispose).toHaveBeenCalledOnce();
    materialDisposals.forEach((dispose) =>
      expect(dispose).toHaveBeenCalledOnce(),
    );
    expect(planeSurfaceGeometryDispose).toHaveBeenCalledOnce();
    expect(planeSurfaceMaterialDispose).toHaveBeenCalledOnce();
    expect(edgeGeometryDispose).toHaveBeenCalledOnce();
    expect(edgeMaterialDispose).toHaveBeenCalledOnce();
    expect(
      (runtime.object.getObjectByName("Segmentation Planned Sections") as Group)
        .children,
    ).toHaveLength(0);
    runtime.dispose();
  });
});
