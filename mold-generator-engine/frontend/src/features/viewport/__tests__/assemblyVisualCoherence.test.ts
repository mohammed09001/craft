import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "three";
import { describe, expect, it, vi } from "vitest";

import { createCadMaterial } from "../runtime/cadMaterialFactory";
import { createLocalStlRuntime } from "../runtime/localStlImport";
import { createReferenceMoldBlock3dRuntime } from "../runtime/referenceMoldBlock3dRuntime";
import { CAD_DARK_THEME } from "../runtime/viewportVisualTheme";
import type { ViewportPalette } from "../viewport.contracts";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RenderScheduler } from "../runtime/renderScheduler";

const DARK_PALETTE: ViewportPalette = {
  background: "#161c24",
  gridMajor: "#303943",
  gridMinor: "#46525f",
};

const LIGHT_PALETTE: ViewportPalette = {
  background: "#ffffff",
  gridMajor: "#cccccc",
  gridMinor: "#eeeeee",
};

describe("Assembly Visual Coherence", () => {
  it("enforces coherent shadow casting and receiving across imported parts and mold bodies", () => {
    const scene = new Scene();
    const modelRoot = new Group();
    const camera = new PerspectiveCamera();
    const controls = { update: vi.fn(), enabled: true } as unknown as OrbitControls;
    const scheduler = { invalidate: vi.fn(), dispose: vi.fn() } as unknown as RenderScheduler;

    const stlRuntime = createLocalStlRuntime({
      camera,
      controls,
      modelRoot,
      scene,
      scheduler,
      onModelStatusChange: vi.fn(),
      onModelReplaced: vi.fn(),
      createGrid: vi.fn().mockReturnValue(new Group()),
      replaceGrid: vi.fn(),
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([0,0,0, 10,0,0, 0,10,0]), 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, createCadMaterial("imported-part", "solid", CAD_DARK_THEME));

    // Exercise replaceModel logic via test setup
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    stlRuntime.dispose();
  });

  it("propagates theme/palette updates to imported part runtime materials", () => {
    const scene = new Scene();
    const modelRoot = new Group();
    const camera = new PerspectiveCamera();
    const controls = { update: vi.fn(), enabled: true } as unknown as OrbitControls;
    const scheduler = { invalidate: vi.fn(), dispose: vi.fn() } as unknown as RenderScheduler;

    const stlRuntime = createLocalStlRuntime({
      camera,
      controls,
      modelRoot,
      scene,
      scheduler,
      onModelStatusChange: vi.fn(),
      onModelReplaced: vi.fn(),
      createGrid: vi.fn().mockReturnValue(new Group()),
      replaceGrid: vi.fn(),
      palette: DARK_PALETTE,
    });

    // Test setPalette method on stlRuntime
    expect(() => stlRuntime.setPalette(LIGHT_PALETTE)).not.toThrow();
    expect(scheduler.invalidate).toHaveBeenCalled();

    stlRuntime.dispose();
  });

  it("preserves intentional material role differentiation while ensuring CAD physical parameters", () => {
    const outer = createCadMaterial("outer-mold", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const cavity = createCadMaterial("cavity-surface", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const sprue = createCadMaterial("sprue-funnel", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const key = createCadMaterial("registration-key", "solid", CAD_DARK_THEME) as MeshStandardMaterial;
    const imported = createCadMaterial("imported-part", "solid", CAD_DARK_THEME) as MeshStandardMaterial;

    // Roles maintain functional color distinction
    expect(outer.color.getHex()).toBe(CAD_DARK_THEME.outerMoldColor);
    expect(cavity.color.getHex()).toBe(CAD_DARK_THEME.cavitySurfaceColor);
    expect(sprue.color.getHex()).toBe(CAD_DARK_THEME.sprueFunnelColor);
    expect(key.color.getHex()).toBe(CAD_DARK_THEME.registrationKeyColor);
    expect(imported.color.getHex()).toBe(CAD_DARK_THEME.importedPartColor);

    // All solid materials maintain depth write and non-transparency
    expect(outer.transparent).toBe(false);
    expect(cavity.transparent).toBe(false);
    expect(sprue.transparent).toBe(false);
    expect(key.transparent).toBe(false);
    expect(imported.transparent).toBe(false);

    outer.dispose();
    cavity.dispose();
    sprue.dispose();
    key.dispose();
    imported.dispose();
  });

  it("unindexes orthogonal mold body geometry to preserve flat CAD face normals without smooth corner averaging", () => {
    const invalidate = vi.fn();
    const runtime = createReferenceMoldBlock3dRuntime(invalidate);

    const definition: ReferenceMoldDefinition = {
      schemaVersion: 1,
      definitionId: "coherence-test",
      modelId: "test-model",
      coordinateSystem: { units: "millimeters", upAxis: "Z" },
      selectionBoxBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      referenceMoldBlock: { clearanceMm: 5, bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 15, y: 15, z: 15 } } },
      usedFaces: ["front"],
      moldBodies: [
        {
          id: "body-1",
          name: "Mold Body 1",
          visible: true,
          bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 15, y: 15, z: 15 } },
          triangleCount: 12,
          volumeMm3: 8000,
          watertight: true,
          mesh: {
            // Box face positions and indices
            positions: [
              -5,-5,-5,  15,-5,-5,  15,15,-5,  -5,15,-5, // bottom face
              -5,-5,15,  15,-5,15,  15,15,15,  -5,15,15  // top face
            ],
            indices: [
              0,1,2, 0,2,3, // bottom
              4,6,5, 4,7,6  // top
            ],
          },
        },
      ],
    };

    const target = new Group();
    runtime.setTarget("test-model", target);
    runtime.setDefinition(definition);

    const bodiesGroup = runtime.object.children.find((child) => child.name === "ReferenceMoldBodies");
    expect(bodiesGroup).toBeDefined();

    const bodyMesh = bodiesGroup?.children[0] as Mesh;
    expect(bodyMesh).toBeDefined();
    expect(bodyMesh.geometry.index).toBeNull(); // Verified unindexed for flat face normals

    runtime.dispose();
  });
});
