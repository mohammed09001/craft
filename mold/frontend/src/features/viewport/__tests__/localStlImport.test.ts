import { Box3, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3 } from "three";
import { waitFor } from "@testing-library/react";

import type { ModelImportStatus } from "@/features/viewport";
import type { AdaptiveGridConfig } from "@/features/viewport/runtime/adaptiveGrid";
import { createEngineeringGrid } from "@/features/viewport/runtime/createEngineeringGrid";
import { createLocalStlRuntime } from "@/features/viewport/runtime/localStlImport";
import type { RenderScheduler } from "@/features/viewport/runtime/renderScheduler";
import type { CanonicalPartGeometry } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import {
  composePartFlip,
  IDENTITY_PART_ORIENTATION,
  type PartFlipDirection,
} from "@/features/viewport/partOrientation.store";
import { createReferenceMoldBlock3dRuntime } from "@/features/viewport/runtime/referenceMoldBlock3dRuntime";

const VALID_ASCII_STL = `solid test
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid test
`;

const OFFSET_ASCII_STL = `solid offset
facet normal 0 0 1
  outer loop
    vertex 20 -10 -5
    vertex 60 -10 -5
    vertex 20 30 -5
  endloop
endfacet
endsolid offset
`;

function createRuntimeHarness() {
  const onModelReplaced = vi.fn();
  const onPartOrientationCommit = vi.fn(() => true);
  const statuses: ModelImportStatus[] = [];
  const canonicalParts: (CanonicalPartGeometry | null)[] = [];
  const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
  const controls = {
    maxDistance: 0,
    minDistance: 0,
    target: new Vector3(),
    update: vi.fn(() => false),
  };
  const modelRoot = new Group();
  const scene = new Scene();
  const createGrid = vi.fn((config: AdaptiveGridConfig) =>
    createEngineeringGrid(
      {
        background: "#000000",
        gridMajor: "#333333",
        gridMinor: "#222222",
      },
      config,
    ),
  );
  const replaceGrid = vi.fn((grid) => {
    scene.add(grid);
  });
  const scheduler = {
    dispose: vi.fn(),
    invalidate: vi.fn(),
  } satisfies RenderScheduler;
  const runtime = createLocalStlRuntime({
    camera,
    controls: controls as never,
    modelRoot,
    scene,
    scheduler,
    onModelStatusChange: (status) => statuses.push(status),
    onModelReplaced,
    onPartOrientationCommit,
    createGrid,
    replaceGrid,
    onCanonicalA3Change: (geometry) => canonicalParts.push(geometry),
  });

  return {
    camera,
    controls,
    canonicalParts,
    createGrid,
    modelRoot,
    onModelReplaced,
    onPartOrientationCommit,
    replaceGrid,
    runtime,
    scene,
    scheduler,
    statuses,
  };
}

it("reconstructs orientation and grounds one discrete change through one engineering refresh", async () => {
  const {
    canonicalParts,
    modelRoot,
    onModelReplaced,
    replaceGrid,
    runtime,
    statuses,
  } =
    createRuntimeHarness();
  const halfTurn = {
    x: Math.SQRT1_2,
    y: 0,
    z: 0,
    w: Math.SQRT1_2,
  };
  runtime.setPartOrientation(halfTurn);
  runtime.loadLocalStl(new File([OFFSET_ASCII_STL], "oriented.stl"));

  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });

  expect(modelRoot.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);
  expect(canonicalParts.at(-1)?.transform).toEqual(
    modelRoot.children[0]?.matrixWorld.toArray(),
  );

  const previousSignature = canonicalParts.at(-1)?.sourceSignature;
  const canonicalCount = canonicalParts.length;
  const modelReplacementCount = onModelReplaced.mock.calls.length;
  const gridReplacementCount = replaceGrid.mock.calls.length;
  runtime.setPartOrientation({ x: 0, y: 0, z: 0, w: 1 });
  expect(canonicalParts.at(-1)?.sourceSignature).not.toBe(previousSignature);
  expect(modelRoot.quaternion.w).toBeCloseTo(1);
  const groundedBounds = new Box3().setFromObject(modelRoot);
  expect(groundedBounds.getCenter(new Vector3()).x).toBeCloseTo(0);
  expect(groundedBounds.getCenter(new Vector3()).y).toBeCloseTo(0);
  expect(groundedBounds.min.z).toBeCloseTo(0);
  expect(canonicalParts).toHaveLength(canonicalCount + 1);
  expect(onModelReplaced).toHaveBeenCalledTimes(modelReplacementCount);
  expect(replaceGrid).toHaveBeenCalledTimes(gridReplacementCount + 1);
});

it("centers and grounds every canonical Flip direction without moving the camera", async () => {
  const { camera, modelRoot, replaceGrid, runtime, statuses } =
    createRuntimeHarness();
  runtime.loadLocalStl(new File([OFFSET_ASCII_STL], "flips.stl"));
  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });
  const cameraPosition = camera.position.clone();
  const cameraQuaternion = camera.quaternion.clone();
  const directions: readonly PartFlipDirection[] = [
    "left",
    "right",
    "forward",
    "backward",
    "upside-down",
  ];

  for (const direction of directions) {
    const gridReplacementCount = replaceGrid.mock.calls.length;
    runtime.setPartOrientation(
      composePartFlip(IDENTITY_PART_ORIENTATION, direction),
    );
    const bounds = new Box3().setFromObject(modelRoot);
    const center = bounds.getCenter(new Vector3());
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0);
    expect(bounds.min.z).toBeCloseTo(0);
    expect(replaceGrid).toHaveBeenCalledTimes(gridReplacementCount + 1);
    expect(camera.position.equals(cameraPosition)).toBe(true);
    expect(camera.quaternion.equals(cameraQuaternion)).toBe(true);
  }
});

it("returns to identical orientation and grounding placement after four quarter-turns without drift", async () => {
  const { camera, modelRoot, runtime, statuses } = createRuntimeHarness();
  runtime.loadLocalStl(new File([OFFSET_ASCII_STL], "quarter_turns.stl"));
  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });

  const initialBounds = new Box3().setFromObject(modelRoot);
  const cameraPos = camera.position.clone();
  let currentOrientation = IDENTITY_PART_ORIENTATION;

  for (let step = 0; step < 4; step += 1) {
    currentOrientation = composePartFlip(currentOrientation, "left");
    runtime.setPartOrientation(currentOrientation);
  }

  const finalBounds = new Box3().setFromObject(modelRoot);
  expect(finalBounds.min.x).toBeCloseTo(initialBounds.min.x);
  expect(finalBounds.max.x).toBeCloseTo(initialBounds.max.x);
  expect(finalBounds.min.y).toBeCloseTo(initialBounds.min.y);
  expect(finalBounds.max.y).toBeCloseTo(initialBounds.max.y);
  expect(finalBounds.min.z).toBeCloseTo(0);
  expect(camera.position.equals(cameraPos)).toBe(true);
});

it("parses a local ASCII STL, adds one model, emits inspection data, and requests render", async () => {
  const { controls, modelRoot, runtime, scheduler, statuses } =
    createRuntimeHarness();
  const file = new File([VALID_ASCII_STL], "triangle.stl");

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(statuses.at(-1)).toEqual({
      phase: "ready",
      fileName: "triangle.stl",
      fileSize: file.size,
      fileSizeLabel: `${file.size} B`,
      format: "STL",
      geometryVertexCount: 3,
      geometryVertexCountLabel: "3",
      triangleCount: 1,
      triangleCountLabel: "1",
    });
  });

  expect(modelRoot.children).toHaveLength(1);
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);
  expect(modelRoot.position.toArray()).toEqual([0, 0, 0]);
  expect(controls.update).toHaveBeenCalled();
  expect(scheduler.invalidate).toHaveBeenCalled();
});

it("canonicalizes an offset model into grounded world-aligned geometry", async () => {
  const { modelRoot, runtime } = createRuntimeHarness();
  const file = new File([OFFSET_ASCII_STL], "offset.stl");

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  const mesh = modelRoot.children[0] as Mesh;
  const position = mesh.geometry.getAttribute("position").array;
  const bounds = new Box3().setFromObject(modelRoot);
  const center = bounds.getCenter(new Vector3());

  expect(modelRoot.position.toArray()).toEqual([0, 0, 0]);
  expect(bounds.min.z).toBeCloseTo(0);
  expect(center.x).toBeCloseTo(0);
  expect(center.y).toBeCloseTo(0);
  expect(Array.from(position).slice(0, 9)).toEqual([
    -20, -20, 0, 20, -20, 0, -20, 20, 0,
  ]);
});

it("reports a parsing error without adding a model", async () => {
  const { modelRoot, runtime, statuses } = createRuntimeHarness();
  const file = new File(["not an stl"], "broken.stl");

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(statuses.at(-1)).toEqual({
      phase: "error",
      fileName: "broken.stl",
      fileSize: file.size,
      message: "The STL file could not be parsed.",
    });
  });

  expect(modelRoot.children).toHaveLength(0);
});

it("keeps model grounding and grid when replacement parsing fails", async () => {
  const { modelRoot, onModelReplaced, replaceGrid, runtime, statuses } =
    createRuntimeHarness();
  const readyFile = new File([VALID_ASCII_STL], "ready.stl");
  const brokenFile = new File(["not an stl"], "broken.stl");

  runtime.loadLocalStl(readyFile);

  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });

  const replacementCallbackCount = onModelReplaced.mock.calls.length;
  const replaceGridCount = replaceGrid.mock.calls.length;
  const currentPosition = modelRoot.position.clone();

  runtime.loadLocalStl(brokenFile);

  await waitFor(() => {
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        phase: "ready",
        fileName: "ready.stl",
        lastImportError: "The STL file could not be parsed.",
      }),
    );
  });

  expect(modelRoot.children).toHaveLength(1);
  expect(modelRoot.position.equals(currentPosition)).toBe(true);
  expect(onModelReplaced).toHaveBeenCalledTimes(replacementCallbackCount);
  expect(replaceGrid).toHaveBeenCalledTimes(replaceGridCount);
});

it("atomically replaces the previous model and adaptive grid after a successful new load", async () => {
  const { createGrid, modelRoot, onModelReplaced, replaceGrid, runtime, statuses } =
    createRuntimeHarness();
  const firstFile = new File([VALID_ASCII_STL], "first.stl");
  const secondFile = new File([OFFSET_ASCII_STL], "second.stl");

  runtime.loadLocalStl(firstFile);

  await waitFor(() => {
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        phase: "ready",
        fileName: "first.stl",
      }),
    );
  });

  const firstModel = modelRoot.children[0];

  runtime.loadLocalStl(secondFile);

  await waitFor(() => {
    expect(statuses.at(-1)).toEqual(
      expect.objectContaining({
        phase: "ready",
        fileName: "second.stl",
      }),
    );
  });

  expect(modelRoot.children).toHaveLength(1);
  expect(modelRoot.children[0]).not.toBe(firstModel);
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);
  expect(modelRoot.position.toArray()).toEqual([0, 0, 0]);
  expect(createGrid).toHaveBeenLastCalledWith({
    majorStep: 25,
    minorStep: 5,
    size: 100,
  });
  expect(replaceGrid).toHaveBeenCalledTimes(2);
  expect(onModelReplaced).toHaveBeenCalledWith(null);
  expect(onModelReplaced).toHaveBeenLastCalledWith({
    modelId: expect.stringContaining("second.stl"),
    target: modelRoot.children[0],
  });
});

function createBoxStl(
  name: string,
  min: { x: number; y: number; z: number },
  max: { x: number; y: number; z: number },
) {
  const v = {
    leftBottomBack: [min.x, min.y, min.z],
    rightBottomBack: [max.x, min.y, min.z],
    rightTopBack: [max.x, max.y, min.z],
    leftTopBack: [min.x, max.y, min.z],
    leftBottomFront: [min.x, min.y, max.z],
    rightBottomFront: [max.x, min.y, max.z],
    rightTopFront: [max.x, max.y, max.z],
    leftTopFront: [min.x, max.y, max.z],
  };

  const triangles = [
    [v.leftBottomBack, v.rightTopBack, v.rightBottomBack],
    [v.leftBottomBack, v.leftTopBack, v.rightTopBack],
    [v.leftBottomFront, v.rightBottomFront, v.rightTopFront],
    [v.leftBottomFront, v.rightTopFront, v.leftTopFront],
    [v.leftBottomBack, v.rightBottomBack, v.rightBottomFront],
    [v.leftBottomBack, v.rightBottomFront, v.leftBottomFront],
    [v.leftTopBack, v.leftTopFront, v.rightTopFront],
    [v.leftTopBack, v.rightTopFront, v.rightTopBack],
    [v.leftBottomBack, v.leftBottomFront, v.leftTopFront],
    [v.leftBottomBack, v.leftTopFront, v.leftTopBack],
    [v.rightBottomBack, v.rightTopBack, v.rightTopFront],
    [v.rightBottomBack, v.rightTopFront, v.rightBottomFront],
  ];

  return [
    `solid ${name}`,
    ...triangles.flatMap((triangle) => [
      "facet normal 0 0 1",
      "  outer loop",
      ...triangle.map(
        ([x, y, z]) => `    vertex ${x} ${y} ${z}`,
      ),
      "  endloop",
      "endfacet",
    ]),
    `endsolid ${name}`,
    "",
  ].join("\n");
}

it("does not orient a newly imported model automatically", async () => {
  const { createGrid, modelRoot, runtime } = createRuntimeHarness();
  const file = new File(
    [createBoxStl("tall", { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 100 })],
    "tall.stl",
  );

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  const size = new Box3().setFromObject(modelRoot).getSize(new Vector3());

  expect(modelRoot.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  expect(size.z).toBeCloseTo(100);
  expect(createGrid).toHaveBeenCalledTimes(1);
  expect(createGrid).toHaveBeenLastCalledWith({
    majorStep: 5,
    minorStep: 1,
    size: 20,
  });
});

it("orients the current model on command, regrounds it, and updates the adaptive grid", async () => {
  const { createGrid, modelRoot, replaceGrid, runtime, scheduler, statuses } =
    createRuntimeHarness();
  const file = new File(
    [createBoxStl("tall", { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 100 })],
    "tall.stl",
  );

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });

  const mesh = modelRoot.children[0] as Mesh;
  const positionBefore = Array.from(mesh.geometry.getAttribute("position").array);

  runtime.orientModel();

  const bounds = new Box3().setFromObject(modelRoot);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());

  expect(modelRoot.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  expect(bounds.min.z).toBeCloseTo(0);
  expect(center.x).toBeCloseTo(0);
  expect(center.y).toBeCloseTo(0);
  expect(size.z).toBeCloseTo(2);
  expect(Array.from(mesh.geometry.getAttribute("position").array)).not.toEqual(
    positionBefore,
  );
  expect(createGrid).toHaveBeenLastCalledWith({
    majorStep: 50,
    minorStep: 10,
    size: 200,
  });
  expect(replaceGrid).toHaveBeenCalledTimes(2);
  expect(scheduler.invalidate).toHaveBeenCalled();
  expect(statuses.at(-1)).toEqual(
    expect.objectContaining({
      phase: "ready",
      fileName: "tall.stl",
    }),
  );
});

it("does not accumulate rotation when orient model is run repeatedly", async () => {
  const { modelRoot, runtime, statuses } = createRuntimeHarness();
  const file = new File(
    [createBoxStl("tall", { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 100 })],
    "repeat.stl",
  );

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });

  runtime.orientModel();

  const firstQuaternion = modelRoot.quaternion.clone();
  const firstPosition = modelRoot.position.clone();

  runtime.orientModel();

  expect(modelRoot.quaternion.equals(firstQuaternion)).toBe(true);
  expect(modelRoot.position.equals(firstPosition)).toBe(true);
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);
});

it("keeps the current orientation and grid when orientation preparation fails", async () => {
  const { createGrid, modelRoot, onPartOrientationCommit, replaceGrid, runtime, statuses } =
    createRuntimeHarness();
  const file = new File(
    [createBoxStl("tall", { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 100 })],
    "atomic.stl",
  );

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(statuses.at(-1)?.phase).toBe("ready");
  });

  const replaceGridCount = replaceGrid.mock.calls.length;
  const currentQuaternion = modelRoot.quaternion.clone();
  const currentPosition = modelRoot.position.clone();

  createGrid.mockImplementationOnce(() => {
    throw new Error("grid creation failed");
  });

  runtime.orientModel();

  expect(modelRoot.quaternion.equals(currentQuaternion)).toBe(true);
  expect(modelRoot.position.equals(currentPosition)).toBe(true);
  expect(replaceGrid).toHaveBeenCalledTimes(replaceGridCount);
  expect(onPartOrientationCommit).toHaveBeenLastCalledWith(IDENTITY_PART_ORIENTATION);
  expect(statuses.at(-1)).toEqual(
    expect.objectContaining({
      phase: "ready",
      fileName: "atomic.stl",
      lastImportError: "The model could not be oriented.",
    }),
  );
});
it("hides only the imported model geometry while keeping attached mold children visible", async () => {
  const { modelRoot, runtime, scheduler } = createRuntimeHarness();
  const file = new File([VALID_ASCII_STL], "visibility.stl");

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  const mesh = modelRoot.children[0] as Mesh;
  const attachedMoldChild = new Group();
  mesh.add(attachedMoldChild);

  const originalDrawRange = {
    start: mesh.geometry.drawRange.start,
    count: mesh.geometry.drawRange.count,
  };

  scheduler.invalidate.mockClear();

  runtime.setModelVisible(false);

  expect(mesh.visible).toBe(true);
  expect(attachedMoldChild.visible).toBe(true);
  expect(mesh.geometry.drawRange).toEqual({
    start: originalDrawRange.start,
    count: 0,
  });
  expect(scheduler.invalidate).toHaveBeenCalledTimes(1);

  runtime.setModelVisible(true);

  expect(mesh.geometry.drawRange).toEqual(originalDrawRange);
  expect(scheduler.invalidate).toHaveBeenCalledTimes(2);
});

it("maintains a visible, scene-attached STL mesh with renderable solid material after loading", async () => {
  const { modelRoot, runtime, scene } = createRuntimeHarness();
  const file = new File([VALID_ASCII_STL], "renderable.stl");

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  const mesh = modelRoot.children[0] as Mesh;

  // 1. Scene graph attachment
  expect(modelRoot.parent).toBe(scene);
  expect(mesh.parent).toBe(modelRoot);

  // 2. Visibility
  expect(modelRoot.visible).toBe(true);
  expect(mesh.visible).toBe(true);
  expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);

  // 3. Finite position, quaternion, non-zero scale
  expect(Number.isFinite(modelRoot.position.x)).toBe(true);
  expect(Number.isFinite(modelRoot.position.y)).toBe(true);
  expect(Number.isFinite(modelRoot.position.z)).toBe(true);
  expect(Number.isFinite(modelRoot.quaternion.x)).toBe(true);
  expect(Number.isFinite(modelRoot.quaternion.y)).toBe(true);
  expect(Number.isFinite(modelRoot.quaternion.z)).toBe(true);
  expect(Number.isFinite(modelRoot.quaternion.w)).toBe(true);
  expect(modelRoot.scale.x).toBeGreaterThan(0);
  expect(modelRoot.scale.y).toBeGreaterThan(0);
  expect(modelRoot.scale.z).toBeGreaterThan(0);

  // 4. Non-empty world bounding box and grounding at Z = 0
  const worldBox = new Box3().setFromObject(modelRoot);
  expect(worldBox.isEmpty()).toBe(false);
  expect(worldBox.min.z).toBeCloseTo(0);

  // 5. Material is a solid, non-transparent MeshStandardMaterial
  expect((mesh.material as MeshStandardMaterial).type).toBe("MeshStandardMaterial");
  const material = mesh.material as MeshStandardMaterial;
  expect(material.opacity).toBe(1);
  expect(material.transparent).toBe(false);
});

it("keeps imported model visible and properly grounded after multiple Flip operations without model replacement deselects", async () => {
  const { modelRoot, runtime, scene, onModelReplaced } = createRuntimeHarness();
  const file = new File([OFFSET_ASCII_STL], "flip_vis.stl");

  runtime.loadLocalStl(file);

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  const mesh = modelRoot.children[0] as Mesh;
  onModelReplaced.mockClear();

  // Perform multiple flips
  const leftOrientation = composePartFlip(IDENTITY_PART_ORIENTATION, "left");
  runtime.setPartOrientation(leftOrientation);

  expect(onModelReplaced).not.toHaveBeenCalled();
  expect(modelRoot.parent).toBe(scene);
  expect(mesh.parent).toBe(modelRoot);
  expect(modelRoot.visible).toBe(true);
  expect(mesh.visible).toBe(true);
  expect(modelRoot.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);

  const forwardOrientation = composePartFlip(IDENTITY_PART_ORIENTATION, "forward");
  runtime.setPartOrientation(forwardOrientation);

  expect(onModelReplaced).not.toHaveBeenCalled();
  expect(modelRoot.parent).toBe(scene);
  expect(mesh.parent).toBe(modelRoot);
  expect(modelRoot.visible).toBe(true);
  expect(mesh.visible).toBe(true);
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);
});

it("keeps modelRoot and GeneratedManufacturingRoot as siblings attached to scene when mold definition changes", async () => {
  const { modelRoot, runtime, scene } = createRuntimeHarness();
  const moldRuntime = createReferenceMoldBlock3dRuntime(vi.fn());
  scene.add(moldRuntime.object);

  runtime.loadLocalStl(new File([VALID_ASCII_STL], "sibling.stl"));

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  const mesh = modelRoot.children[0] as Mesh;

  // Mold root and model root are both children of scene, not parented inside each other
  expect(modelRoot.parent).toBe(scene);
  expect(mesh.parent).toBe(modelRoot);
  expect(moldRuntime.object.parent).toBe(scene);
  expect(modelRoot.children).not.toContain(moldRuntime.object);
  expect(mesh.children).not.toContain(moldRuntime.object);

  // Set mold definition and clear it
  moldRuntime.setTarget("sibling.stl", mesh);
  expect(modelRoot.parent).toBe(scene);
  expect(mesh.parent).toBe(modelRoot);
  expect(modelRoot.visible).toBe(true);
  expect(mesh.visible).toBe(true);

  moldRuntime.clearTarget();
  expect(modelRoot.parent).toBe(scene);
  expect(mesh.parent).toBe(modelRoot);
  expect(modelRoot.visible).toBe(true);
  expect(mesh.visible).toBe(true);

  moldRuntime.dispose();
});

it("raises the displayed part by the authoritative mold bottom clearance", async () => {
  const { modelRoot, runtime } = createRuntimeHarness();
  runtime.loadLocalStl(new File([VALID_ASCII_STL], "rebased-part.stl"));

  await waitFor(() => {
    expect(modelRoot.children).toHaveLength(1);
  });

  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(0);
  runtime.setMoldAssemblyOffset({ x: 0, y: 0, z: 10 });
  expect(new Box3().setFromObject(modelRoot).min.z).toBeCloseTo(10);
  expect(modelRoot.quaternion.toArray()).toEqual([0, 0, 0, 1]);
});
