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
  const signature = goldenMeshSignature(fixture.mesh);
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "golden",
      positions: fixture.mesh.positions,
      indices: fixture.mesh.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: fixture.bounds,
      geometryVersion: signature,
      sourceSignature: signature,
    },
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: "golden-rev",
    ...overrides,
  }));
}

/**
 * Content-based fixture identity. Two different fixtures can carry the same
 * vertex count; an identity derived from sizes alone collides in the
 * engine's planning caches and serves one fixture's planning result to
 * another (Execution 07 LOOP 07).
 */
function goldenMeshSignature(mesh: GoldenFixture["mesh"]): string {
  let hash = 2166136261;
  for (let index = 0; index < mesh.positions.length; index += 1) {
    hash = Math.imul(hash ^ Math.round(mesh.positions[index]! * 1e6), 16777619) >>> 0;
  }
  for (let index = 0; index < mesh.indices.length; index += 1) {
    hash = Math.imul(hash ^ mesh.indices[index]!, 16777619) >>> 0;
  }
  return `golden:${hash.toString(16)}`;
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

export async function buildBlindHoleCube(faces: readonly ("+Z" | "-Z" | "+X" | "-X")[], rotateAboutXDeg = 0): Promise<GoldenFixture> {
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

/** A single +Z blind hole: one localized lock for the localized-core planner (Execution 07 LOOP 06). */
export async function buildSingleHoleCubeFixture(): Promise<GoldenFixture> {
  return buildBlindHoleCube(["+Z"]);
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

/**
 * Execution 08 LOOP 23: a real (never mocked) exact-failure escalation
 * fixture. A wide overhanging cap sits above a narrow support column
 * offset to one side (a mushroom/T-shape): every patch individually has
 * clear per-patch ray visibility along SOME direction (planning reports
 * every piece count as feasible), but a 2- or 3-piece ordered half-space
 * split cannot actually translate its pieces apart without the overhang
 * colliding with the column -- a genuine geometric interference between a
 * piece's own BULK and the rest of the assembly that per-patch ray-casting
 * does not capture, only the exact collision sweep does. Verified directly
 * (masterMoldEngine.test.ts): 2 and 3 pieces both fail real exact
 * construction, 4 pieces exactly succeeds -- proving the LOOP 01
 * escalation path with real geometry, not a mocked exact-construction
 * failure.
 */
export async function buildMushroomOverhangFixture(): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const cap = createBlankSolid(module, { min: { x: -6, y: -6, z: 3 }, max: { x: 6, y: 6, z: 6 } });
  const column = createBlankSolid(module, { min: { x: 1, y: -2, z: -6 }, max: { x: 5, y: 2, z: 3 } });
  let solid: ManifoldSolid | null = null;
  try {
    solid = cap.add(column);
    return { mesh: payloadFromManifold(solid), bounds: boundsFromManifold(solid) };
  } finally {
    cap.delete();
    column.delete();
    solid?.delete();
  }
}

/**
 * Execution 07 LOOP 07: a box with an internal cavity open through the
 * bottom face. In +Z casting orientation the cavity ceiling is a
 * downward-facing surface with material above and no horizontal escape --
 * one real sealed high pocket whose air can only escape through a vent.
 */
export async function buildOpenCavityCubeFixture(): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const outer = createBlankSolid(module, { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } });
  const cavity = createBlankSolid(module, { min: { x: -2, y: -2, z: -5.5 }, max: { x: 2, y: 2, z: 2 } });
  let cup: ManifoldSolid | null = null;
  try {
    cup = outer.subtract(cavity);
    return { mesh: payloadFromManifold(cup), bounds: boundsFromManifold(cup) };
  } finally {
    outer.delete();
    cavity.delete();
    cup?.delete();
  }
}

/**
 * Execution 08 LOOP 22 Golden E: a curved organic saddle/lobe -- two offset
 * spheres close enough to fuse into one smoothly curved body with a
 * concave saddle-shaped waist between them (no flat faces, no sharp
 * edges). Exercises curvature-only geometry with a genuine concave zone,
 * distinct from the LOOP 02 fixture's oblique blind pockets.
 */
export async function buildSaddleLobeFixture(): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const lobeA = module.Manifold.sphere(6, 48).translate(-4, 0, 0);
  const lobeB = module.Manifold.sphere(6, 48).translate(4, 0, 0);
  let fused: ManifoldSolid | null = null;
  try {
    fused = lobeA.add(lobeB);
    return { mesh: payloadFromManifold(fused), bounds: boundsFromManifold(fused) };
  } finally {
    lobeA.delete();
    lobeB.delete();
    fused?.delete();
  }
}

/**
 * Execution 08 LOOP 22 Golden G: a partially visible curved region -- a
 * cylindrical boss on a base plate, standing next to a taller wall that
 * shadows roughly half of the boss's curved side surface from any single
 * horizontal direction. No direction sees the whole cylindrical region:
 * the region must be reached by combining directions or accepted as
 * partially resolved, unlike a free-standing cylinder (fully visible from
 * every horizontal direction) or a blind hole (visible from exactly one).
 */
export async function buildPartiallyVisibleCurvedFixture(): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const base = createBlankSolid(module, { min: { x: -8, y: -5, z: -3 }, max: { x: 8, y: 5, z: 0 } });
  const boss = module.Manifold.cylinder(6, 3, 3, 48).translate(-2, 0, 0);
  const wall = createBlankSolid(module, { min: { x: 2, y: -5, z: -3 }, max: { x: 3.5, y: 5, z: 6 } });
  let baseWithBoss: ManifoldSolid | null = null;
  let combined: ManifoldSolid | null = null;
  try {
    baseWithBoss = base.add(boss);
    combined = baseWithBoss.add(wall);
    return { mesh: payloadFromManifold(combined), bounds: boundsFromManifold(combined) };
  } finally {
    base.delete();
    boss.delete();
    wall.delete();
    baseWithBoss?.delete();
    combined?.delete();
  }
}

/**
 * Execution 08 LOOP 02: a minimized, deterministic derivative of the real
 * failing `Segmentation_Segment_1.stl` (1,576 triangles; 2-, 3- and 4-piece
 * Working Mold planning all rejected; 0 exact construction attempts).
 *
 * The exact STL cannot be committed (not available in this repository), so
 * the geometric property that produced that failure is reproduced instead:
 * a smoothly curved, non-axis-aligned free-form body (a union of three
 * offset spheres -- no flat faces anywhere) at a comparable triangle
 * density (~1.5-1.7k, inside the medium-mesh stride-2 band, Article 03),
 * carrying THREE mutually oblique blind pockets whose interiors are visible
 * ONLY along their own oblique axis. Every other candidate direction (world
 * axes, PCA axes, normal-cluster seeds) is more than 25 degrees off every
 * pocket axis, so no other direction can release it.
 *
 * This exercises the same structural gap as the real part: the dominant
 * normal-cluster candidate-direction source (Article 04) is area-greedy and
 * bounded to 8 seeds; a large smoothly curved free-form surface contributes
 * a near-continuum of "novel" normals ahead of a pocket's own tiny flat
 * bottom in area-descending order, so a locked feature's own release
 * direction can fail to ever become a candidate at all -- not merely fail
 * accessibility or get pruned. Working Mold planning at maxWorkingMoldPieces
 * = 4 (the shipped default, GENERIC_RIGID_CAST_PROFILE) then rejects every
 * piece count with zero exact construction attempts, exactly like the real
 * part's observed failure.
 */
export async function buildFreeFormObliqueLockFixture(): Promise<GoldenFixture> {
  const module = await getManifoldModule();
  const mainRadius = 6;
  const main = module.Manifold.sphere(mainRadius, 48);
  const lobeA = module.Manifold.sphere(3.2, 28).translate(5.5, -4.5, -3);
  const lobeB = module.Manifold.sphere(3, 28).translate(-5, 4.5, -2.5);
  let blob: ManifoldSolid | null = null;
  try {
    const mainPlusA = main.add(lobeA);
    let current = mainPlusA.add(lobeB);
    mainPlusA.delete();

    // Three mutually oblique lock axes (see module doc comment): each more
    // than 25 degrees from every world axis and from the other two axes.
    const lockAxes: readonly { readonly rxDeg: number; readonly ryDeg: number }[] = [
      { rxDeg: 40, ryDeg: 15 },
      { rxDeg: -35, ryDeg: 50 },
      { rxDeg: 20, ryDeg: -60 },
    ];
    const holeRadius = 0.8;
    const outerReachMm = 15; // guaranteed outside the whole blob (max extent ~9.7mm).
    const tipRadiusMm = 2; // blind end stays well inside the main sphere (radius 6).
    const heightMm = outerReachMm - tipRadiusMm;
    for (const axis of lockAxes) {
      const cylinder = module.Manifold.cylinder(heightMm, holeRadius, holeRadius, 20);
      // rotate(x,y,z) applied about the fixed global axes in x-y-z order takes
      // local +Z to (sin(y)cos(x), -sin(x), cos(y)cos(x)); translating the
      // rotated base out to outerReachMm along that same ray then carves a
      // hole entering from outside the solid down to a blind tip at radius
      // tipRadiusMm from center along the ray.
      const rotated = cylinder.rotate(axis.rxDeg, axis.ryDeg, 0);
      cylinder.delete();
      const rad = Math.PI / 180;
      const rx = axis.rxDeg * rad;
      const ry = axis.ryDeg * rad;
      const dir = { x: Math.sin(ry) * Math.cos(rx), y: -Math.sin(rx), z: Math.cos(ry) * Math.cos(rx) };
      const positioned = rotated.translate(dir.x * outerReachMm, dir.y * outerReachMm, dir.z * outerReachMm);
      rotated.delete();
      const next = current.subtract(positioned);
      positioned.delete();
      current.delete();
      current = next;
    }
    blob = current;

    return { mesh: payloadFromManifold(blob), bounds: boundsFromManifold(blob) };
  } finally {
    main.delete();
    lobeA.delete();
    lobeB.delete();
    blob?.delete();
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
