import type { Intersection, Object3D } from "three";

export type PickedModelFace = {
  readonly faceId: string;
  readonly faceIndex: number;
  readonly objectUuid: string;
  readonly objectName?: string;
};

export const createPickedFaceId = (
  object: Object3D,
  faceIndex: number,
): string => `face:${object.uuid}:${faceIndex}`;

export const getPickedModelFace = (
  intersections: readonly Intersection<Object3D>[],
): PickedModelFace | null => {
  const hit = intersections.find(
    (entry) => typeof entry.faceIndex === "number" && entry.faceIndex >= 0,
  );

  if (hit === undefined || typeof hit.faceIndex !== "number") {
    return null;
  }

  return {
    faceId: createPickedFaceId(hit.object, hit.faceIndex),
    faceIndex: hit.faceIndex,
    objectUuid: hit.object.uuid,
    ...(hit.object.name ? { objectName: hit.object.name } : {}),
  };
};

