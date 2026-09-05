import {
  BufferGeometry,
  MeshBasicMaterial,
  Vector3,
  type Mesh,
} from "three";
import { describe, expect, it } from "vitest";

import {
  createObjectSelectionBoxFaceDefinitions,
  createObjectSelectionBoxRuntime,
  OBJECT_SELECTION_BOX_FACE_VALUES,
} from "@/features/viewport/runtime/objectSelectionBoxRuntime";

describe("objectSelectionBoxRuntime", () => {
  it("defines exactly six object selection box faces", () => {
    const definitions = createObjectSelectionBoxFaceDefinitions({
      min: new Vector3(-1, -2, -3),
      max: new Vector3(4, 5, 6),
    });

    expect(definitions.map((definition) => definition.face).sort()).toEqual(
      [...OBJECT_SELECTION_BOX_FACE_VALUES].sort(),
    );
    expect(definitions).toHaveLength(6);
    expect(new Set(definitions.map((definition) => definition.face)).size).toBe(6);
  });

  it("creates a dashed 3D object selection bounding box from exact bounds", () => {
    const runtime = createObjectSelectionBoxRuntime({
      min: new Vector3(-1, -2, -3),
      max: new Vector3(4, 5, 6),
    });

    expect(runtime.object.name).toBe("ObjectSelectionBoundingBox");
    expect(runtime.object.geometry.getAttribute("position").count).toBe(24);
    expect(runtime.object.material.dashSize).toBe(0.35);
    expect(runtime.object.material.gapSize).toBe(0.22);
    expect(
      runtime.object.children.filter((child) =>
        child.name.startsWith("ObjectSelectionBoxFacePick:"),
      ),
    ).toHaveLength(6);

    runtime.dispose();
  });

  it("updates the selection box bounds without adding mold margins", () => {
    const runtime = createObjectSelectionBoxRuntime({
      min: new Vector3(0, 0, 0),
      max: new Vector3(1, 1, 1),
    });

    runtime.updateBounds({
      min: new Vector3(-2, -4, -6),
      max: new Vector3(2, 4, 6),
    });

    const position = runtime.object.geometry.getAttribute("position");
    const values = Array.from(position.array);

    expect(Math.min(...values.filter((_, index) => index % 3 === 0))).toBe(-2);
    expect(Math.max(...values.filter((_, index) => index % 3 === 0))).toBe(2);
    expect(Math.min(...values.filter((_, index) => index % 3 === 1))).toBe(-4);
    expect(Math.max(...values.filter((_, index) => index % 3 === 1))).toBe(4);
    expect(Math.min(...values.filter((_, index) => index % 3 === 2))).toBe(-6);
    expect(Math.max(...values.filter((_, index) => index % 3 === 2))).toBe(6);

    runtime.dispose();
  });

  it("creates and clears a transparent hover overlay on a box face", () => {
    const runtime = createObjectSelectionBoxRuntime({
      min: new Vector3(0, 0, 0),
      max: new Vector3(2, 4, 6),
    });

    expect(runtime.updateHoveredFace("front")).toBe(true);
    expect(runtime.getHoveredFace()).toBe("front");

    const overlay = runtime.object.children.find(
      (child) => child.name === "ObjectSelectionBoxFaceHover:front",
    ) as Mesh<BufferGeometry, MeshBasicMaterial> | undefined;

    expect(overlay).toBeDefined();
    expect(overlay?.material.transparent).toBe(true);

    expect(runtime.clearHoveredFace()).toBe(true);
    expect(runtime.getHoveredFace()).toBeNull();
    expect(
      runtime.object.children.some((child) =>
        child.name.startsWith("ObjectSelectionBoxFaceHover:"),
      ),
    ).toBe(false);

    runtime.dispose();
  });

  it("replaces the previous face hover overlay during repeated hover changes", () => {
    const runtime = createObjectSelectionBoxRuntime({
      min: new Vector3(0, 0, 0),
      max: new Vector3(2, 4, 6),
    });

    runtime.updateHoveredFace("front");
    const firstOverlay = runtime.object.children.find(
      (child) => child.name === "ObjectSelectionBoxFaceHover:front",
    );

    runtime.updateHoveredFace("top");

    expect(runtime.getHoveredFace()).toBe("top");
    expect(runtime.object.children).not.toContain(firstOverlay);
    expect(
      runtime.object.children.filter((child) =>
        child.name.startsWith("ObjectSelectionBoxFaceHover:"),
      ),
    ).toHaveLength(1);
    expect(
      runtime.object.children.some(
        (child) => child.name === "ObjectSelectionBoxFaceHover:top",
      ),
    ).toBe(true);

    runtime.dispose();
  });

  it("does not introduce mold envelope, margin, or block concepts", () => {
    const runtime = createObjectSelectionBoxRuntime({
      min: new Vector3(-1, -2, -3),
      max: new Vector3(4, 5, 6),
    });

    runtime.updateHoveredFace("right");

    const serialized = JSON.stringify({
      objectName: runtime.object.name,
      childNames: runtime.object.children.map((child) => child.name),
    });

    expect(serialized).not.toContain("moldEnvelope");
    expect(serialized).not.toContain("moldBlock");
    expect(serialized).not.toContain("margin");
    expect(serialized).not.toContain("clearance");

    runtime.dispose();
  });
});
