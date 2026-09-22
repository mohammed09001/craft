import { verifyDemoldRotationByAxis, type Vector3Like } from "./masterMoldDemold.rotationVerifier";

interface RotatableDemoldSolid {
  transform(m: import("manifold-3d").Mat4): RotatableDemoldSolid;
  intersect(other: RotatableDemoldSolid): RotatableDemoldSolid;
  volume(): number;
  delete(): void;
}

export interface RotationReleaseSearchOptions {
  /** Candidate axis POINTS to hinge about (e.g. the piece's own bounding-box center) -- bounded, never continuous. */
  readonly axisPoints: readonly Vector3Like[];
  /** Candidate axis DIRECTIONS (the line's own orientation) -- reuses the same validated planning candidate-direction pool other searches in this codebase already use, not an arbitrary/unbounded new set. */
  readonly axisDirections: readonly Vector3Like[];
  /** Bounded set of sweep magnitudes (degrees) to try, each also tried in the opposite rotational sense automatically. */
  readonly angleMagnitudesDeg: readonly number[];
  readonly volumeToleranceMm3: number;
  readonly sampleCount?: number;
}

export interface RotationReleaseCandidate {
  readonly axisPoint: Vector3Like;
  readonly axisDirection: Vector3Like;
  readonly angleDeg: number;
}

export interface RotationReleaseSearchResult {
  /** The found hinge candidate, or null if nothing in the searched space cleared the piece. */
  readonly found: RotationReleaseCandidate | null;
  /** Real verification calls made -- the search's own observable cost (Execution 08 invariant #15: bounded and observable). */
  readonly candidatesTried: number;
}

/**
 * Execution 08/09: a genuine, explicitly bounded search over rotational
 * release candidates -- for a piece that has already failed every
 * translation-only technique this project has (direct pull, broadened
 * direction set, disassembly order, compound multi-segment paths; seven
 * independently completed techniques against the real free-form regression
 * fixture's own remaining sliver, per Execution 09). Every candidate is a
 * REAL `verifyDemoldRotationByAxis` call (no heuristic shortcuts).
 *
 * Per Execution 08 invariant #10 (never equate a search-budget failure with
 * physical impossibility) and #15 (search must remain bounded and
 * observable): `found: null` means nothing in the SEARCHED space cleared
 * the piece, not that no hinge axis anywhere in the continuous space of all
 * possible axis points/directions/angles could. The candidate axis point
 * and direction sets are the caller's own choice, reported back via
 * `candidatesTried` alongside this result so what was and was not tried is
 * always explicit.
 */
export function searchRotationReleasePath<S extends RotatableDemoldSolid>(
  toolSolid: S,
  targetSolid: S,
  options: RotationReleaseSearchOptions,
): RotationReleaseSearchResult {
  let candidatesTried = 0;
  for (const axisPoint of options.axisPoints) {
    for (const axisDirection of options.axisDirections) {
      for (const angleMagnitudeDeg of options.angleMagnitudesDeg) {
        for (const signedAngleDeg of [angleMagnitudeDeg, -angleMagnitudeDeg]) {
          candidatesTried += 1;
          const result = verifyDemoldRotationByAxis(
            toolSolid,
            targetSolid,
            axisPoint,
            axisDirection,
            signedAngleDeg,
            options.volumeToleranceMm3,
            options.sampleCount === undefined ? {} : { sampleCount: options.sampleCount },
          );
          if (result.removable) {
            return { found: { axisPoint, axisDirection, angleDeg: signedAngleDeg }, candidatesTried };
          }
        }
      }
    }
  }
  return { found: null, candidatesTried };
}
