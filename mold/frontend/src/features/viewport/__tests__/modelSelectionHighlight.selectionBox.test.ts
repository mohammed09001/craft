import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import { createModelSelectionHighlight } from "@/features/viewport/runtime/modelSelectionHighlight";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

const palette: ViewportPalette = {
  background: "#0f172a",
  gridMajor: "#334155",
  gridMinor: "#1e293b",
};

const getMeshGeometryWorldBounds = (mesh: Mesh) => {
  mesh.geometry.computeBoundingBox();
  mesh.updateWorldMatrix(true, false);

  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
};

const expectBoundsToMatch = (actual: Box3, expected: Box3) => {
  expect(actual.min.x).toBeCloseTo(expected.min.x);
  expect(actual.min.y).toBeCloseTo(expected.min.y);
  expect(actual.min.z).toBeCloseTo(expected.min.z);
  expect(actual.max.x).toBeCloseTo(expected.max.x);
  expect(actual.max.y).toBeCloseTo(expected.max.y);
  expect(actual.max.z).toBeCloseTo(expected.max.z);
};

describe("modelSelectionHighlight selection box integration", () => {
  it("aligns the object selection bounding box with untransformed model bounds", () => {
    const sceneRoot = new Group();
    const target = new Mesh(
      new BoxGeometry(2, 4, 6),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    sceneRoot.add(target);

    const expectedBounds = getMeshGeometryWorldBounds(target);
    const highlight = createModelSelectionHighlight();

    highlight.apply(target, palette);

    const selectionBox = target.children.find(
      (child) => child.name === "ObjectSelectionBoundingBox",
    );

    expect(selectionBox).toBeDefined();
    expect(selectionBox?.parent).toBe(target);
    expectBoundsToMatch(new Box3().setFromObject(selectionBox!), expectedBounds);

    highlight.dispose();
    target.geometry.dispose();
  });

  it("keeps the object selection bounding box aligned when the selected model parent is transformed", () => {
    const sceneRoot = new Group();
    const modelRoot = new Group();
    const target = new Mesh(
      new BoxGeometry(2, 4, 6),
      new MeshStandardMaterial({ color: 0xffffff }),
    );

    modelRoot.position.set(12, -8, 5);
    modelRoot.rotation.set(0, 0, Math.PI / 2);
    target.position.set(3, 4, -2);
    modelRoot.add(target);
    sceneRoot.add(modelRoot);

    const highlight = createModelSelectionHighlight();

    highlight.apply(target, palette);

    const selectionBox = target.children.find(
      (child) => child.name === "ObjectSelectionBoundingBox",
    );

    expect(selectionBox).toBeDefined();
    expect(selectionBox?.parent).toBe(target);
    expectBoundsToMatch(
      new Box3().setFromObject(selectionBox!),
      getMeshGeometryWorldBounds(target),
    );

    modelRoot.position.set(-6, 3, 10);
    modelRoot.rotation.set(Math.PI / 2, 0, 0);
    sceneRoot.updateWorldMatrix(true, true);

    expectBoundsToMatch(
      new Box3().setFromObject(selectionBox!),
      getMeshGeometryWorldBounds(target),
    );

    highlight.dispose();
    target.geometry.dispose();
  });

  it("removes the object selection bounding box when highlight is cleared", () => {
    const target = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    const highlight = createModelSelectionHighlight();

    highlight.apply(target, palette);

    expect(
      target.children.some((child) => child.name === "ObjectSelectionBoundingBox"),
    ).toBe(true);

    highlight.clear();

    expect(
      target.children.some((child) => child.name === "ObjectSelectionBoundingBox"),
    ).toBe(false);

    target.geometry.dispose();
  });

  it("removes box face hover when highlight is cleared", () => {
    const target = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    const highlight = createModelSelectionHighlight();

    highlight.apply(target, palette);

    const selectionBox = target.children.find(
      (child) => child.name === "ObjectSelectionBoundingBox",
    );
    const pickFace = selectionBox?.children.find(
      (child) => child.name === "ObjectSelectionBoxFacePick:front",
    );

    expect(pickFace).toBeDefined();
    expect(
      highlight.updateSelectionBoxFaceHover([{ object: pickFace } as never]),
    ).toBe(true);
    expect(
      selectionBox?.children.some(
        (child) => child.name === "ObjectSelectionBoxFaceHover:front",
      ),
    ).toBe(true);

    highlight.clear();

    expect(
      target.children.some((child) => child.name === "ObjectSelectionBoundingBox"),
    ).toBe(false);

    target.geometry.dispose();
  });

  it("allows repeatable hover targets for different box faces", () => {
    const target = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    const highlight = createModelSelectionHighlight();

    highlight.apply(target, palette);

    const selectionBox = target.children.find(
      (child) => child.name === "ObjectSelectionBoundingBox",
    );
    const frontPickFace = selectionBox?.children.find(
      (child) => child.name === "ObjectSelectionBoxFacePick:front",
    );
    const topPickFace = selectionBox?.children.find(
      (child) => child.name === "ObjectSelectionBoxFacePick:top",
    );

    expect(frontPickFace).toBeDefined();
    expect(topPickFace).toBeDefined();

    highlight.updateSelectionBoxFaceHover([{ object: frontPickFace } as never]);
    expect(highlight.getSelectionBoxHoverTarget()?.face).toBe("front");

    highlight.updateSelectionBoxFaceHover([{ object: topPickFace } as never]);
    expect(highlight.getSelectionBoxHoverTarget()?.face).toBe("top");

    highlight.dispose();
    target.geometry.dispose();
  });

  it("does not introduce mold envelope, margin, or block concepts", () => {
    const target = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    const highlight = createModelSelectionHighlight();

    highlight.apply(target, palette);

    const serialized = JSON.stringify({
      childNames: target.children.map((child) => child.name),
    });

    expect(serialized).not.toContain("moldEnvelope");
    expect(serialized).not.toContain("moldBlock");
    expect(serialized).not.toContain("margin");
    expect(serialized).not.toContain("clearance");

    highlight.dispose();
    target.geometry.dispose();
  });
});
