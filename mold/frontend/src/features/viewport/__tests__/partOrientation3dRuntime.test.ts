import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import { createPartOrientation3dRuntime } from "@/features/viewport/runtime/partOrientation3dRuntime";

function createImportedPart(scene: Scene) {
  const root = new Group();
  root.position.set(8, -3, 12);
  const geometry = new BoxGeometry(4, 8, 6);
  geometry.translate(20, -10, 5);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  root.add(mesh);
  scene.add(root);
  root.updateWorldMatrix(true, true);
  return { geometry, mesh, root };
}

function expectVectorClose(actual: Vector3, expected: Vector3) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

describe("part orientation pivot runtime", () => {
  it("centers the retained pivot on the transformed part without creating controls", () => {
    const runtime = createPartOrientation3dRuntime();
    const scene = new Scene();
    scene.add(runtime.object);
    const { geometry, mesh, root } = createImportedPart(scene);
    const sourcePositions = Array.from(geometry.getAttribute("position").array);
    const expectedCenter = new Box3()
      .setFromObject(mesh)
      .getCenter(new Vector3());

    runtime.setTarget(root, mesh);

    expect(runtime.object.children).toHaveLength(1);
    const pivot = runtime.object.children[0]!;
    expect(pivot.name).toBe("Part Orientation Pivot");
    expect(root.parent).toBe(pivot);
    expectVectorClose(pivot.getWorldPosition(new Vector3()), expectedCenter);
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(
      sourcePositions,
    );
    expect(
      runtime.object.getObjectByName("Part Orientation Gizmo"),
    ).toBeUndefined();
  });

  it("releases the part for one authoritative transform while preserving world placement", () => {
    const runtime = createPartOrientation3dRuntime();
    const scene = new Scene();
    scene.add(runtime.object);
    const { mesh, root } = createImportedPart(scene);
    runtime.setTarget(root, mesh);
    const centerBefore = new Box3().setFromObject(mesh).getCenter(new Vector3());
    const protectedGeometry = [
      "mold",
      "cavity",
      "sprue",
      "registration",
      "export",
    ].map((name, index) => {
      const object = new Group();
      object.name = name;
      object.position.set(index + 1, index + 2, index + 3);
      scene.add(object);
      object.updateMatrixWorld(true);
      return { matrix: object.matrixWorld.clone(), object };
    });

    runtime.releaseTarget();

    expect(root.parent).toBe(scene);
    expectVectorClose(
      new Box3().setFromObject(mesh).getCenter(new Vector3()),
      centerBefore,
    );
    runtime.setTarget(root, mesh);
    runtime.setTarget(root, mesh);
    expect(runtime.object.children).toHaveLength(1);
    expect(root.parent?.name).toBe("Part Orientation Pivot");
    for (const protectedObject of protectedGeometry) {
      protectedObject.object.updateMatrixWorld(true);
      expect(protectedObject.object.matrixWorld.equals(protectedObject.matrix)).toBe(
        true,
      );
    }
  });

  it("reconstructs the approved orientation and fully detaches on disposal", () => {
    const runtime = createPartOrientation3dRuntime();
    const scene = new Scene();
    scene.add(runtime.object);
    const { mesh, root } = createImportedPart(scene);
    const approved = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      Math.PI / 2,
    );
    root.quaternion.copy(approved);
    root.updateWorldMatrix(true, true);
    runtime.setOrientation(approved);
    runtime.setTarget(root, mesh);

    const pivot = runtime.object.children[0]!;
    expect(pivot.quaternion.equals(approved)).toBe(true);
    expect(root.getWorldQuaternion(new Quaternion()).equals(approved)).toBe(true);

    runtime.dispose();
    expect(root.parent).toBe(scene);
    expect(runtime.object.parent).toBeNull();
  });
});
