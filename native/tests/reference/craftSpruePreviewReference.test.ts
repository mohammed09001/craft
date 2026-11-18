/**
 * Sprue 3D preview reference fixture generator for the native migration.
 *
 * Drives the REAL reference spruePreview3dRuntime (Three.js, jsdom) on fixed mold/cavity scenes and rays and records,
 * in native/tests/fixtures/reference/sprue-preview-reference.json (replayed by tst_sprue_preview_equivalence.cpp):
 *
 *  - the placement the runtime resolves for each ray (status, top/cavity point, stem length, profile);
 *  - the three preview solids (funnel, main stem, entry neck): visibility and their exact world-space vertices,
 *    normals (renderer normal matrix) and indices;
 *  - the preview material (colours for valid/invalid, opacity, roughness, metalness);
 *  - the "glass" the runtime applies to the mold bodies while the Sprue tool is active (opacity, depth write, edge
 *    overlay colour/opacity and the edge segments).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BoxGeometry,
  BufferAttribute,
  Group,
  LineSegments,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Ray,
  Vector3,
  type BufferGeometry,
} from "three";
import { expect, it } from "vitest";

import type { CavityToolData } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import { createSpruePreview3dRuntime } from "@/features/viewport/runtime/spruePreview3dRuntime";

const outputPath = resolve(process.env.CRAFT_SPRUE_PREVIEW_OUTPUT ?? "sprue-preview-reference.json");

type Vec = { x: number; y: number; z: number };

function boxPayload(size: Vec, offset: Vec) {
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  geometry.translate(offset.x, offset.y, offset.z);
  const position = geometry.getAttribute("position");
  const payload = {
    positions: Array.from(position.array),
    indices: geometry.index === null ? Array.from({ length: position.count }, (_, i) => i) : Array.from(geometry.index.array),
  };
  geometry.dispose();
  return payload;
}

function cavityTool(size: Vec, offset: Vec): CavityToolData {
  const mesh = boxPayload(size, offset);
  return {
    mesh,
    bounds: {
      min: { x: offset.x - size.x / 2, y: offset.y - size.y / 2, z: offset.z - size.z / 2 },
      max: { x: offset.x + size.x / 2, y: offset.y + size.y / 2, z: offset.z + size.z / 2 },
    },
    volumeMm3: size.x * size.y * size.z,
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

const SCENES = [
  { name: "box10-cavity4", mold: { x: 10, y: 10, z: 10 }, topZ: 5, cavity: { size: { x: 4, y: 4, z: 4 }, offset: { x: 0, y: 0, z: 0 } } },
  { name: "wide-offset-cavity", mold: { x: 60, y: 40, z: 20 }, topZ: 10, cavity: { size: { x: 30, y: 20, z: 10 }, offset: { x: 5, y: -3, z: -2 } } },
  { name: "large-cavity", mold: { x: 220, y: 200, z: 120 }, topZ: 60, cavity: { size: { x: 150, y: 140, z: 60 }, offset: { x: 10, y: 0, z: -5 } } },
  { name: "tall-narrow-cavity", mold: { x: 40, y: 40, z: 90 }, topZ: 45, cavity: { size: { x: 6, y: 6, z: 20 }, offset: { x: -4, y: 4, z: -20 } } },
];

/** Top-down rays over and around the cavity, oblique rays onto the top face, and rays that must be rejected. */
function raysFor(scene: (typeof SCENES)[number]) {
  const c = scene.cavity;
  const hx = c.size.x / 2, hy = c.size.y / 2;
  const top = scene.topZ + 40;
  const rays: Array<{ name: string; origin: Vec; direction: Vec }> = [];
  const down = { x: 0, y: 0, z: -1 };
  const at = (name: string, x: number, y: number) => rays.push({ name, origin: { x, y, z: top }, direction: down });
  at("over-cavity-centre", c.offset.x, c.offset.y);
  at("over-cavity-quarter", c.offset.x + hx / 2, c.offset.y - hy / 2);
  at("over-cavity-near-edge", c.offset.x + hx - 0.01, c.offset.y);
  at("beside-cavity", c.offset.x + hx + 0.5, c.offset.y);
  at("far-from-cavity", scene.mold.x / 2 - 0.7, scene.mold.y / 2 - 0.7);
  at("on-top-face-edge", scene.mold.x / 2 - 1e-3, 0);
  at("outside-the-body", scene.mold.x / 2 + 3, 0);
  for (const [i, tilt] of [0.1, 0.35, -0.5].entries()) {
    const d = new Vector3(tilt, tilt * 0.6, -1).normalize();
    rays.push({ name: `oblique-${i}`, origin: { x: c.offset.x - d.x * 40, y: c.offset.y - d.y * 40, z: scene.topZ + 40 }, direction: { x: d.x, y: d.y, z: d.z } });
  }
  // From the side: hits a vertical wall, which is not the top face.
  rays.push({ name: "side-wall", origin: { x: scene.mold.x / 2 + 30, y: 0, z: 0 }, direction: { x: -1, y: 0, z: 0 } });
  // From below.
  rays.push({ name: "from-below", origin: { x: c.offset.x, y: c.offset.y, z: -scene.mold.z - 40 }, direction: { x: 0, y: 0, z: 1 } });
  return rays;
}

function worldMesh(mesh: Mesh) {
  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute("position") as BufferAttribute;
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrix);
  const v = new Vector3();
  const positions: number[] = [];
  const normals: number[] = [];
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
    positions.push(v.x, v.y, v.z);
    v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    normals.push(v.x, v.y, v.z);
  }
  return { name: mesh.name, visible: mesh.visible, positions, normals, indices: geometry.index === null ? [] : Array.from(geometry.index.array) };
}

it("records the real Sprue 3D preview runtime", () => {
  const scenes = SCENES.map((scene) => {
    const canvas = document.createElement("canvas");
    const runtime = createSpruePreview3dRuntime({ camera: new PerspectiveCamera(), canvas, invalidate: () => undefined });
    const moldRoot = new Group();
    const moldMaterial = new MeshStandardMaterial({ depthWrite: true, opacity: 0.67, transparent: false });
    const mold = new Mesh(new BoxGeometry(scene.mold.x, scene.mold.y, scene.mold.z), moldMaterial);
    mold.userData.moldBodyId = "body-1";
    mold.userData.cavityAffected = true;
    mold.userData.moldTopZ = scene.topZ;
    moldRoot.add(mold);
    runtime.setMoldRoot(moldRoot);
    runtime.setCavityGeometry(cavityTool(scene.cavity.size, scene.cavity.offset));
    runtime.setActive(true);

    // The glass applied to the mold while the tool is active.
    const edges = mold.getObjectByName("SprueGlassEdges") as LineSegments;
    const edgePositions = edges.geometry.getAttribute("position");
    const glass = {
      moldOpacity: moldMaterial.opacity,
      moldTransparent: moldMaterial.transparent,
      moldDepthWrite: moldMaterial.depthWrite,
      edgeColorHex: (edges.material as unknown as { color: { getHex(): number } }).color.getHex(),
      edgeOpacity: (edges.material as unknown as { opacity: number }).opacity,
      edgeRenderOrder: edges.renderOrder,
      edgeSegments: Array.from({ length: edgePositions.count / 2 }, (_, i) => ({
        from: { x: edgePositions.getX(i * 2), y: edgePositions.getY(i * 2), z: edgePositions.getZ(i * 2) },
        to: { x: edgePositions.getX(i * 2 + 1), y: edgePositions.getY(i * 2 + 1), z: edgePositions.getZ(i * 2 + 1) },
      })),
    };

    const previewMaterials = new Set<string>();
    const rays = raysFor(scene).map((r) => {
      const placement = runtime.updateFromRay(new Ray(new Vector3(r.origin.x, r.origin.y, r.origin.z), new Vector3(r.direction.x, r.direction.y, r.direction.z).normalize()));
      const meshes = runtime.object.children.map((child) => worldMesh(child as Mesh));
      const material = (runtime.object.children[0] as Mesh).material as MeshStandardMaterial;
      previewMaterials.add(JSON.stringify({ hex: material.color.getHex(), opacity: material.opacity, roughness: material.roughness, metalness: material.metalness, transparent: material.transparent, depthWrite: material.depthWrite }));
      return {
        ...r,
        placement,
        previewVisible: runtime.object.visible,
        colorHex: material.color.getHex(),
        meshes: placement === null ? [] : meshes,
      };
    });
    runtime.setActive(false);
    const restored = { moldOpacity: moldMaterial.opacity, moldTransparent: moldMaterial.transparent, moldDepthWrite: moldMaterial.depthWrite };
    runtime.dispose();
    return { name: scene.name, mold: scene.mold, topZ: scene.topZ, cavity: scene.cavity, glass, restored, rays, previewMaterials: [...previewMaterials].map((m) => JSON.parse(m)) };
  });

  const fixture = {
    generatedFrom: "mold/frontend/src/features/viewport/runtime/spruePreview3dRuntime.ts",
    scenes,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(fixture, null, 1));
  expect(scenes.length).toBe(SCENES.length);
});
