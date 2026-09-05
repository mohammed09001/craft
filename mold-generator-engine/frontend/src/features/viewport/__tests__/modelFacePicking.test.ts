import { Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import {
  createPickedFaceId,
  getPickedModelFace,
} from "@/features/viewport/runtime/modelFacePicking";

describe("modelFacePicking", () => {
  it("creates a stable face id from object uuid and face index", () => {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial(),
    );

    expect(createPickedFaceId(mesh, 7)).toBe(`face:${mesh.uuid}:7`);

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it("returns the first intersection with a valid face index", () => {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial(),
    );
    mesh.name = "PickedMesh";

    const picked = getPickedModelFace([
      {
        object: mesh,
        faceIndex: 4,
      } as never,
    ]);

    expect(picked).toEqual({
      faceId: `face:${mesh.uuid}:4`,
      faceIndex: 4,
      objectUuid: mesh.uuid,
      objectName: "PickedMesh",
    });

    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it("returns null when no valid face index exists", () => {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial(),
    );

    expect(
      getPickedModelFace([
        {
          object: mesh,
        } as never,
      ]),
    ).toBeNull();

    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
