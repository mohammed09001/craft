import type { Bounds3 } from "../../split-face/splitFace.contracts";
import type { MoldMeshPayload } from "../../reference-mold-definition/orthogonalMold";
import { boundsFromManifold, createBlankSolid, getManifoldModule, payloadFromManifold, type ManifoldSolid } from "../../geometry/manifold";
import { buildMasterMoldSeedSnapshot, worldMeshFromSnapshot, type MasterMoldSeedSnapshot } from "../seed/masterMoldSeed";
import { GENERIC_RIGID_CAST_PROFILE } from "../engine/contracts";

/** Builds a Master seed from a fixture with the identity transform (tests). */
export function seedFromFixture(
  fixture: GoldenFixture,
  overrides: Partial<Parameters<typeof buildMasterMoldSeedSnapshot>[0]> = {},
): MasterMoldSeedSnapshot {
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "golden",
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: fixture.bounds,
      geometryVersion: `golden:${fixture.mesh.positions.length}`,
      sourceSignature: `golden-signature:${fixture.mesh.positions.length}`,
    },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: "golden-rev",
    ...overrides,
  }));
}

/**
 * Execution 06 Article 17: deterministic golden geometry fixtures.
 *
 * Each fixture is built as a real Manifold solid (watertight, manifold) with
 * a documented physical demolding analysis:
 *
 *  - simpleBox:        convex box; minimum practical 2-piece working mold.
 *  - threeHoleCube:    box with three blind holes (+Z, +X, -X); no two-piece
 *                      plan exists (the three hole bottoms need three
 *                      different pulls), a 3-piece half-space plan does.
 *  - fourHoleCube:     box with four blind holes (+Z, -Z, +X, -X); forces 4.
 *  - obliqueHoleCube:  three-hole cube rotated 45° about X; world axes fail,
 *                      the rotated cluster direction succeeds (Article 20).
 *  - sealedHollowBox:  box with a fully enclosed internal void; no rigid
 *                      half-space plan exists at any piece count -- the
 *                      structured flexible/sacrificial fallback case.
 *  - highPolySphere:   dense tessellated sphere for performance acceptance.
 */

export interface GoldenFixture {
  readonly mesh: MoldMeshPayload;
  readonly bounds: Bounds3;
}

/** Blind hole (cylinder) subtracted from a solid, entering through `face`, depth 3, radius 1.5. */
async function withBlindHole(solid: ManifoldSolid, face: "+Z" | "-Z" | "+X" | "-X", sideLength: number): Promise<ManifoldSolid> {
  const module = await getManifoldModule();
  const radius = 1.5;
  const depth = 3;
  const cylinder = module.Manifold.cylinder(depth, radius, radius, 32);
  let hole: ManifoldSolid;
  switch (face) {
    case "+Z":
      hole = cylinder.translate(0, 0, sideLength / 2 - depth);
      break;
    case "-Z":
      hole = cylinder.translate(0, 0, -sideLength / 2);
      break;
    case "+X":
      hole = cylinder.rotate(0, 90, 0).translate(sideLength / 2 - depth, 0, 0);
      break;
    case "-X":
      hole = cylinder.rotate(0, 90, 0).translate(-sideLength / 2, 0, 0);
      break;
  }
  cylinder.delete();
  try {
    return solid.subtract(hole);
  } finally {
    hole.delete();
  }
}

export async function buildSimpleBoxFixture(sideLength = 10): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const box = createBlankSolid(module, {
    min: { x: -sideLength / 2, y: -sideLength / 2, z: -sideLength / 2 },
    max: { x: sideLength / 2, y: sideLength / 2, z: sideLength / 2 },
  });
  try {
    return { mesh: payloadFromManifold(box), bounds: boundsFromManifold(box) };
  } finally {
    box.delete();
  }
}

async function buildBlindHoleCube(faces: readonly ("+Z" | "-Z" | "+X" | "-X")[], rotateAboutXDeg = 0): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const side = 10;
  let solid = createBlankSolid(module, {
    min: { x: -side / 2, y: -side / 2, z: -side / 2 },
    max: { x: side / 2, y: side / 2, z: side / 2 },
  });
  let current: ManifoldSolid | null = null;
  try {
    for (const face of faces) {
      current = await withBlindHole(solid, face, side);
      if (current !== solid) solid.delete();
      solid = current;
      current = null;
    }
    if (rotateAboutXDeg !== 0) {
      current = solid.rotate(rotateAboutXDeg, 0, 0);
      solid.delete();
      solid = current;
      current = null;
    }
    return { mesh: payloadFromManifold(solid), bounds: boundsFromManifold(solid) };
  } finally {
    if (current !== null) current.delete();
    solid.delete();
  }
}

export async function buildThreeHoleCubeFixture(): Promise<GoldenFixture> {
  return buildBlindHoleCube(["+Z", "+X", "-X"]);
}

export async function buildFourHoleCubeFixture(): Promise<GoldenFixture> {
  return buildBlindHoleCube(["+Z", "-Z", "+X", "-X"]);
}

export async function buildObliqueHoleCubeFixture(): Promise<GoldenFixture> {
  return buildBlindHoleCube(["+Z", "+X", "-X"], 45);
}

export async function buildSealedHollowBoxFixture(): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const outer = createBlankSolid(module, { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } });
  const inner = createBlankSolid(module, { min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } });
  let hollow: ManifoldSolid | null = null;
  try {
    hollow = outer.subtract(inner);
    return { mesh: payloadFromManifold(hollow), bounds: boundsFromManifold(hollow) };
  } finally {
    outer.delete();
    inner.delete();
    hollow?.delete();
  }
}

/** Dense UV sphere: deterministic high-poly mesh built without the kernel (triangles handed straight to Manifold). */
export function buildHighPolySphereFixture(rings = 72, sectors = 144, radius = 15): GoldenFixture {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (Math.PI * ring) / rings;
    for (let sector = 0; sector <= sectors; sector += 1) {
      const theta = (2 * Math.PI * sector) / sectors;
      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      );
    }
  }
  const vertexAt = (ring: number, sector: number) => ring * (sectors + 1) + sector;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = vertexAt(ring, sector);
      const b = vertexAt(ring + 1, sector);
      const c = vertexAt(ring + 1, sector + 1);
      const d = vertexAt(ring, sector + 1);
      if (ring !== 0) indices.push(a, b, d);
      if (ring !== rings - 1) indices.push(b, c, d);
    }
  }
  const rowLength = (sectors + 1) * 3;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]!);
    minY = Math.min(minY, positions[index + 1]!);
    minZ = Math.min(minZ, positions[index + 2]!);
    maxX = Math.max(maxX, positions[index]!);
    maxY = Math.max(maxY, positions[index + 1]!);
    maxZ = Math.max(maxZ, positions[index + 2]!);
  }
  void rowLength;
  return {
    mesh: { positions, indices },
    bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
  };
}
