/**
 * Neutral mesh primitives shared by any domain (Execution 06: working-mold
 * registration and Master tooling registration both build alignment pins
 * along arbitrary directions). Pure payload builders -- no kernel coupling.
 */

export interface PrimitiveVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Deterministic right-handed orthonormal basis with w as the given unit direction. */
export function orthonormalBasisAround(w: PrimitiveVector3): { u: PrimitiveVector3; v: PrimitiveVector3; w: PrimitiveVector3 } {
  const reference = Math.abs(w.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = {
    x: reference.y * w.z - reference.z * w.y,
    y: reference.z * w.x - reference.x * w.z,
    z: reference.x * w.y - reference.y * w.x,
  };
  const uLength = Math.hypot(u.x, u.y, u.z);
  u.x /= uLength;
  u.y /= uLength;
  u.z /= uLength;
  const v = {
    x: w.y * u.z - w.z * u.y,
    y: w.z * u.x - w.x * u.z,
    z: w.x * u.y - w.y * u.x,
  };
  return { u, v, w };
}

/**
 * Explicit n-gon prism (cylinder) payload along `direction`, centered on
 * `center` and spanning ±lengthMm/2 along it.
 */
export function cylinderPrismPayload(
  direction: PrimitiveVector3,
  center: PrimitiveVector3,
  radiusMm: number,
  lengthMm: number,
  segments: number,
): { positions: number[]; indices: number[] } {
  const { u, v, w } = orthonormalBasisAround(direction);
  const positions: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    const ou = Math.cos(angle) * radiusMm;
    const ov = Math.sin(angle) * radiusMm;
    positions.push(
      center.x + u.x * ou + v.x * ov - w.x * lengthMm / 2,
      center.y + u.y * ou + v.y * ov - w.y * lengthMm / 2,
      center.z + u.z * ou + v.z * ov - w.z * lengthMm / 2,
    );
  }
  for (let i = 0; i < segments; i += 1) {
    const angle = (2 * Math.PI * i) / segments;
    const ou = Math.cos(angle) * radiusMm;
    const ov = Math.sin(angle) * radiusMm;
    positions.push(
      center.x + u.x * ou + v.x * ov + w.x * lengthMm / 2,
      center.y + u.y * ou + v.y * ov + w.y * lengthMm / 2,
      center.z + u.z * ou + v.z * ov + w.z * lengthMm / 2,
    );
  }
  const indices: number[] = [];
  const bottomCenterIndex = positions.length / 3;
  positions.push(center.x - w.x * lengthMm / 2, center.y - w.y * lengthMm / 2, center.z - w.z * lengthMm / 2);
  const topCenterIndex = positions.length / 3;
  positions.push(center.x + w.x * lengthMm / 2, center.y + w.y * lengthMm / 2, center.z + w.z * lengthMm / 2);
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    indices.push(bottomCenterIndex, j, i);
    indices.push(topCenterIndex, segments + i, segments + j);
    indices.push(i, j, segments + j);
    indices.push(i, segments + j, segments + i);
  }
  return { positions, indices };
}

/** Maps an axis-direction id ("+X".."-Z") to a unit vector. */
export function directionIdToVector(direction: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z"): PrimitiveVector3 {
  switch (direction) {
    case "+X": return { x: 1, y: 0, z: 0 };
    case "-X": return { x: -1, y: 0, z: 0 };
    case "+Y": return { x: 0, y: 1, z: 0 };
    case "-Y": return { x: 0, y: -1, z: 0 };
    case "+Z": return { x: 0, y: 0, z: 1 };
    case "-Z": return { x: 0, y: 0, z: -1 };
  }
}
