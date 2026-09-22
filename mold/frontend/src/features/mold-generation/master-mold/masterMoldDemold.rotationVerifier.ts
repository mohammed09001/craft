import type { Mat4 } from "manifold-3d";

export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Execution 08/09: true rotational/multi-axis release verification -- the
 * one capability this project's own investigation (Execution 09, seven
 * completed techniques against the real free-form regression fixture's
 * remaining 2.18mm3 sliver) repeatedly named as the only other unexplored
 * path, and never had. A piece whose real extraction motion is a ROTATION
 * about a hinge axis (not a single straight-line pull) cannot be proven
 * releasable by `verifyDemoldTranslationByVector` or
 * `verifyDemoldTranslationByPath` (Execution 09 LOOP 2) at all -- both are
 * pure-translation primitives by construction.
 *
 * Real column-major 4x4 rotation-about-an-arbitrary-axis matrix (Rodrigues'
 * rotation formula for the 3x3 block, plus the translation component that
 * makes it rotate about a POINT on the axis, not the origin). Manifold's
 * own `.transform(m: Mat4)` accepts exactly this format -- verified
 * directly against `three.js`'s own `Matrix4.makeRotationAxis` in this
 * module's own test file, not just derived by hand.
 */
export function rotationMatrix4AboutAxis(axisPoint: Vector3Like, axisDirection: Vector3Like, angleDegrees: number): Mat4 {
  const length = Math.hypot(axisDirection.x, axisDirection.y, axisDirection.z);
  if (length <= 0) throw new Error("rotation axis direction must be non-zero.");
  const kx = axisDirection.x / length, ky = axisDirection.y / length, kz = axisDirection.z / length;
  const theta = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta), oneMinusCos = 1 - cos;

  // Rodrigues: R = I + sin(theta)*K + (1-cos(theta))*K^2, K the cross-product matrix of the unit axis.
  const r00 = cos + kx * kx * oneMinusCos;
  const r01 = kx * ky * oneMinusCos - kz * sin;
  const r02 = kx * kz * oneMinusCos + ky * sin;
  const r10 = ky * kx * oneMinusCos + kz * sin;
  const r11 = cos + ky * ky * oneMinusCos;
  const r12 = ky * kz * oneMinusCos - kx * sin;
  const r20 = kz * kx * oneMinusCos - ky * sin;
  const r21 = kz * ky * oneMinusCos + kx * sin;
  const r22 = cos + kz * kz * oneMinusCos;

  // Rotating about a POINT p (not the origin): X' = R*(X - p) + p = R*X + (p - R*p).
  const { x: px, y: py, z: pz } = axisPoint;
  const tx = px - (r00 * px + r01 * py + r02 * pz);
  const ty = py - (r10 * px + r11 * py + r12 * pz);
  const tz = pz - (r20 * px + r21 * py + r22 * pz);

  // Column-major: [col0(x-basis), col1(y-basis), col2(z-basis), col3(translation)], each a 4-vector with w=0/0/0/1.
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    tx, ty, tz, 1,
  ];
}

/** Structural shape this verifier operates on -- mirrors `masterMoldDemold.verifier.ts`'s own `DemoldSolid`, plus `transform`. */
interface RotatableDemoldSolid {
  transform(m: Mat4): RotatableDemoldSolid;
  intersect(other: RotatableDemoldSolid): RotatableDemoldSolid;
  volume(): number;
  delete(): void;
}

export interface DemoldRotationVerificationResult {
  /** True iff no sampled rotation angle up to `maxAngleDegrees` produced a tool/target overlap volume beyond tolerance. */
  readonly removable: boolean;
  /** First angle (degrees, into the sweep from 0) at which a collision was confirmed, or null when removable. */
  readonly firstCollisionAngleDeg: number | null;
}

export interface DemoldRotationSweepOptions {
  readonly sampleCount?: number;
}

const DEFAULT_ROTATION_SAMPLE_COUNT = 32;

/**
 * The rotational analogue of `verifyDemoldTranslationByVector`: as
 * `targetSolid` rotates rigidly about the line through `axisPoint` along
 * `axisDirection`, from 0 up to `maxAngleDegrees` (right-hand rule about
 * `axisDirection`; pass a negative `maxAngleDegrees` to sweep the opposite
 * rotational sense about the SAME axis, rather than negating the axis
 * vector yourself), does it ever overlap `toolSolid` by more than
 * `volumeToleranceMm3`? Same real exact-CSG intersection check at each
 * sampled angle (not a point/ray heuristic), so genuine flush
 * sliding/pivoting contact along the swept surface is correctly never
 * flagged as a collision, exactly like the translation verifier's own
 * zero-clearance sliding-contact case.
 *
 * Discrete angle sampling, not a continuous proof -- the same documented,
 * deliberate resolution bound `COARSE_SAMPLE_COUNT` uses for translation
 * (Execution 06 Article 02 Strategy A), not an attempt at exhaustive proof
 * for an arbitrarily thin angular trap.
 */
export function verifyDemoldRotationByAxis<S extends RotatableDemoldSolid>(
  toolSolid: S,
  targetSolid: S,
  axisPoint: Vector3Like,
  axisDirection: Vector3Like,
  maxAngleDegrees: number,
  volumeToleranceMm3: number,
  options: DemoldRotationSweepOptions = {},
): DemoldRotationVerificationResult {
  const sampleCount = options.sampleCount ?? DEFAULT_ROTATION_SAMPLE_COUNT;
  // A negative maxAngleDegrees sweeps the OPPOSITE rotational sense about
  // the same axis (the natural way to try "the other way" without asking
  // the caller to negate the axis direction vector themselves).
  if (maxAngleDegrees === 0) throw new Error("maxAngleDegrees must be non-zero.");

  const overlapVolumeAt = (angleDeg: number): number => {
    const matrix = rotationMatrix4AboutAxis(axisPoint, axisDirection, angleDeg);
    const rotated = targetSolid.transform(matrix) as S;
    try {
      const overlap = toolSolid.intersect(rotated) as S;
      try {
        return overlap.volume();
      } finally {
        overlap.delete();
      }
    } finally {
      rotated.delete();
    }
  };

  const stepDeg = maxAngleDegrees / sampleCount;
  let firstCollisionAngleDeg: number | null = null;
  for (let step = 1; step <= sampleCount; step += 1) {
    const angleDeg = stepDeg * step;
    if (overlapVolumeAt(angleDeg) > volumeToleranceMm3) {
      firstCollisionAngleDeg = angleDeg;
      break;
    }
  }

  return { removable: firstCollisionAngleDeg === null, firstCollisionAngleDeg };
}
