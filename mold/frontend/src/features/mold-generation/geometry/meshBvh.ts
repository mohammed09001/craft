import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Ray,
  Uint32BufferAttribute,
  Vector3,
} from "three";
import { MeshBVH } from "three-mesh-bvh";

import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";

/**
 * Execution 05 Article 04: neutral BVH construction and point/ray queries
 * over an indexed triangle mesh payload. Generic spatial math -- visibility,
 * point classification, and ray-crossing counting -- usable by any domain.
 */

export const RAY_INTERSECTION_EPSILON_MM = 1e-7;

export const rayDirections = Object.freeze([
  new Vector3(1, Math.SQRT1_2, Math.sqrt(3) / 3).normalize(),

  new Vector3(Math.sqrt(2) / 5, 1, Math.sqrt(5) / 7).normalize(),

  new Vector3(Math.sqrt(7) / 9, Math.sqrt(3) / 4, 1).normalize(),
]);

export function buildMeshGeometry(mesh: MoldMeshPayload): BufferGeometry {
  if (mesh.positions.length % 3 !== 0 || mesh.indices.length % 3 !== 0) {
    throw new Error("Mesh payload is malformed.");
  }

  if (mesh.positions.length === 0 || mesh.indices.length === 0) {
    throw new Error("Mesh payload is empty.");
  }

  const geometry = new BufferGeometry();

  geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3));

  geometry.setIndex(new Uint32BufferAttribute(mesh.indices, 1));

  return geometry;
}

export function countUniqueForwardIntersections(
  bvh: MeshBVH,
  origin: Vector3,
  direction: Vector3,
): number {
  const ray = new Ray(origin, direction);

  const intersections = bvh
    .raycast(ray, DoubleSide, RAY_INTERSECTION_EPSILON_MM, Infinity)
    .map(intersection => intersection.distance)
    .filter(
      distance =>
        Number.isFinite(distance) &&
        distance > RAY_INTERSECTION_EPSILON_MM,
    )
    .sort((left, right) => left - right);

  let uniqueCount = 0;
  let previousDistance = -Infinity;

  for (const distance of intersections) {
    if (distance - previousDistance > RAY_INTERSECTION_EPSILON_MM) {
      uniqueCount += 1;
      previousDistance = distance;
    }
  }

  return uniqueCount;
}

export function classifyPointInside(bvh: MeshBVH, point: Vector3): boolean {
  let insideVotes = 0;

  for (const direction of rayDirections) {
    const intersectionCount = countUniqueForwardIntersections(bvh, point, direction);

    if (intersectionCount % 2 === 1) {
      insideVotes += 1;
    }
  }

  return insideVotes > rayDirections.length / 2;
}
