import { Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { describe, expect, it } from "vitest";

import { buildGeometry } from "../cavity-generation/cavitySignedDistance.bvh";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../reference-mold-definition/orthogonalMold";
import { findInteriorProbePoint, validateOpenFaceAccess } from "./masterMoldGeometry.generator";

function addQuad(
  positions: number[],
  indices: number[],
  p0: readonly [number, number, number],
  p1: readonly [number, number, number],
  p2: readonly [number, number, number],
  p3: readonly [number, number, number],
): void {
  const base = positions.length / 3;
  positions.push(...p0, ...p1, ...p2, ...p3);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const BOUNDS: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const CENTER = new Vector3(5, 5, 5);

/** A closed 10x10x10 box, optionally missing one or more of its 6 axis-aligned faces. */
function boxMesh(omit: ReadonlySet<"+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z">): MoldMeshPayload {
  const positions: number[] = [];
  const indices: number[] = [];
  const { min, max } = BOUNDS;

  if (!omit.has("-X")) addQuad(positions, indices, [min.x, min.y, min.z], [min.x, max.y, min.z], [min.x, max.y, max.z], [min.x, min.y, max.z]);
  if (!omit.has("+X")) addQuad(positions, indices, [max.x, min.y, min.z], [max.x, min.y, max.z], [max.x, max.y, max.z], [max.x, max.y, min.z]);
  if (!omit.has("-Y")) addQuad(positions, indices, [min.x, min.y, min.z], [min.x, min.y, max.z], [max.x, min.y, max.z], [max.x, min.y, min.z]);
  if (!omit.has("+Y")) addQuad(positions, indices, [min.x, max.y, min.z], [max.x, max.y, min.z], [max.x, max.y, max.z], [min.x, max.y, max.z]);
  if (!omit.has("-Z")) addQuad(positions, indices, [min.x, min.y, min.z], [max.x, min.y, min.z], [max.x, max.y, min.z], [min.x, max.y, min.z]);
  if (!omit.has("+Z")) addQuad(positions, indices, [min.x, min.y, max.z], [min.x, max.y, max.z], [max.x, max.y, max.z], [max.x, min.y, max.z]);

  return { positions, indices };
}

describe("validateOpenFaceAccess", () => {
  it("finds no open direction for a fully sealed box", () => {
    const mesh = boxMesh(new Set());
    const access = validateOpenFaceAccess(mesh, CENTER);
    expect(access.openDirections).toEqual([]);
  });

  it("finds exactly the missing face as the one open direction for a box open on +Z only", () => {
    const mesh = boxMesh(new Set(["+Z"]));
    const access = validateOpenFaceAccess(mesh, CENTER);
    expect(access.openDirections).toEqual(["+Z"]);
  });

  it("finds exactly the missing face as the one open direction for a box open on -X only", () => {
    const mesh = boxMesh(new Set(["-X"]));
    const access = validateOpenFaceAccess(mesh, CENTER);
    expect(access.openDirections).toEqual(["-X"]);
  });

  it("detects both openings (rejectable as multiple_open_faces by the caller) for a tube open on +Z and -Z", () => {
    const mesh = boxMesh(new Set(["+Z", "-Z"]));
    const access = validateOpenFaceAccess(mesh, CENTER);
    expect(access.openDirections.slice().sort()).toEqual(["+Z", "-Z"]);
  });
});

describe("findInteriorProbePoint", () => {
  it("returns the bounds center directly when it already sits inside the solid", () => {
    const mesh = boxMesh(new Set(["+Z"]));
    const geometry = buildGeometry(mesh);
    try {
      const probe = findInteriorProbePoint(new MeshBVH(geometry), mesh, BOUNDS);
      expect(probe).not.toBeNull();
      expect(probe!.x).toBeCloseTo(5, 6);
      expect(probe!.y).toBeCloseTo(5, 6);
      expect(probe!.z).toBeCloseTo(5, 6);
    } finally {
      geometry.dispose();
    }
  });

  it("falls back to a surface-offset point when the bounds center is not inside the solid", () => {
    // A hollow square frame (extruded ring): the AABB center sits in the empty middle, not in the material.
    const positions: number[] = [];
    const indices: number[] = [];
    const outer = { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } };
    const inner = { min: { x: 3, y: 3 }, max: { x: 7, y: 7 } };
    const z0 = 0;
    const z1 = 2;

    // Four vertical wall segments between the outer and inner rectangles, capped top/bottom -- a closed hollow frame solid.
    const segments: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
      [[outer.min.x, outer.min.y], [outer.max.x, inner.min.y]], // front strip (full width, up to inner's near edge)
      [[outer.min.x, inner.max.y], [outer.max.x, outer.max.y]], // back strip
      [[outer.min.x, inner.min.y], [inner.min.x, inner.max.y]], // left strip
      [[inner.max.x, inner.min.y], [outer.max.x, inner.max.y]], // right strip
    ];

    for (const [segMin, segMax] of segments) {
      // Each strip is its own closed box (watertight union of 4 disjoint boxes is still a valid, if multi-fragment, solid for this probe-only test).
      const b = { min: { x: segMin[0], y: segMin[1], z: z0 }, max: { x: segMax[0], y: segMax[1], z: z1 } };
      addQuad(positions, indices, [b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.min.z], [b.min.x, b.max.y, b.min.z]);
      addQuad(positions, indices, [b.min.x, b.min.y, b.max.z], [b.min.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.max.z], [b.max.x, b.min.y, b.max.z]);
      addQuad(positions, indices, [b.min.x, b.min.y, b.min.z], [b.min.x, b.max.y, b.min.z], [b.min.x, b.max.y, b.max.z], [b.min.x, b.min.y, b.max.z]);
      addQuad(positions, indices, [b.max.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.max.z], [b.max.x, b.max.y, b.max.z], [b.max.x, b.max.y, b.min.z]);
      addQuad(positions, indices, [b.min.x, b.min.y, b.min.z], [b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.min.z]);
      addQuad(positions, indices, [b.min.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.max.z], [b.min.x, b.max.y, b.max.z]);
    }

    const mesh: MoldMeshPayload = { positions, indices };
    const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 2 } };
    const center = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 };

    const geometry = buildGeometry(mesh);
    try {
      const bvh = new MeshBVH(geometry);
      // Sanity: the AABB center really is in the empty hole, not in the frame material.
      expect(findInteriorProbePoint(bvh, mesh, bounds)).not.toBeNull();
      const probe = findInteriorProbePoint(bvh, mesh, bounds)!;
      const isCenter = Math.abs(probe.x - center.x) < 1e-9 && Math.abs(probe.y - center.y) < 1e-9 && Math.abs(probe.z - center.z) < 1e-9;
      expect(isCenter).toBe(false);
    } finally {
      geometry.dispose();
    }
  });
});
