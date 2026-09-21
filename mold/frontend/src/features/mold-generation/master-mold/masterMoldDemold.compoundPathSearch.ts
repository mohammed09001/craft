import { verifyDemoldTranslationByVector, type DemoldPathSegment } from "./masterMoldDemold.verifier";

interface DemoldSolid {
  translate(x: number, y: number, z: number): DemoldSolid;
  intersect(other: DemoldSolid): DemoldSolid;
  volume(): number;
  delete(): void;
}

export interface CompoundPathSearchOptions {
  /** Candidate directions tried at every segment (own direction, sibling directions, planning candidates -- whatever the caller already has). */
  readonly candidateDirections: readonly (readonly [number, number, number])[];
  /** Bounded set of INTERMEDIATE hop distances to try (e.g. a piece's own characteristic dimensions) -- never an unbounded/continuous search. */
  readonly intermediateDistancesMm: readonly number[];
  /** Distance considered "fully extracted" once a direction clears this far from any waypoint -- the same role `clearanceDistanceMm` plays for a single-vector check. */
  readonly finalClearanceMm: number;
  /** Total segments allowed, INCLUDING the final clearing one (2 = at most one intermediate hop plus one final pull). */
  readonly maxSegments: number;
  readonly toleranceMm: number;
  readonly volumeToleranceMm3: number;
}

export interface CompoundPathSearchResult {
  /** The found path, or null if nothing in the searched space worked. */
  readonly path: readonly DemoldPathSegment[] | null;
  /** Real verification calls made -- the search's own observable cost, reported the same way every other budget in this codebase is. */
  readonly candidatesTried: number;
}

/**
 * Execution 09 LOOP 3 (scoping proof): a genuine, explicitly bounded search
 * over compound release paths -- for a piece that already failed every
 * single-direction attempt (Execution 08's own broadened direction and
 * order checks), tries combinations of intermediate hops followed by a
 * final clearing pull, up to `maxSegments` total. Every candidate is a REAL
 * `verifyDemoldTranslationByVector` call (no heuristic shortcuts) via
 * `masterMoldDemold.verifier.ts`'s own exact boolean sweep.
 *
 * Per Execution 08 invariant #10 (never equate a search-budget failure with
 * physical impossibility) and #15 (search must remain bounded and
 * observable): `path: null` means nothing in the SEARCHED space worked,
 * not that no compound path exists at all -- `candidatesTried` and the
 * caller's own `candidateDirections`/`intermediateDistancesMm`/
 * `maxSegments` together say exactly what was and was not tried.
 */
export function searchCompoundReleasePath<S extends DemoldSolid>(
  toolSolid: S,
  targetSolid: S,
  options: CompoundPathSearchOptions,
): CompoundPathSearchResult {
  const tool: DemoldSolid = toolSolid;
  let candidatesTried = 0;
  const owned: DemoldSolid[] = [];

  const tryFrom = (current: DemoldSolid, segmentsSoFar: readonly DemoldPathSegment[], remainingSegments: number): readonly DemoldPathSegment[] | null => {
    if (remainingSegments <= 0) return null;

    // A final clearing pull is always tried first at every depth -- a
    // path is never longer than it needs to be, and this also makes a
    // 0-intermediate-hop (ordinary single-vector) solution a genuine,
    // zero-cost-extra special case of this same search, not a separate
    // code path.
    for (const direction of options.candidateDirections) {
      candidatesTried += 1;
      const result = verifyDemoldTranslationByVector<DemoldSolid>(tool, current, direction, options.finalClearanceMm, options.toleranceMm, options.volumeToleranceMm3);
      if (result.removable) {
        return [...segmentsSoFar, { direction, distanceMm: options.finalClearanceMm }];
      }
    }

    if (remainingSegments <= 1) return null; // no budget left for an intermediate hop.

    for (const direction of options.candidateDirections) {
      for (const distanceMm of options.intermediateDistancesMm) {
        candidatesTried += 1;
        const result = verifyDemoldTranslationByVector<DemoldSolid>(tool, current, direction, distanceMm, options.toleranceMm, options.volumeToleranceMm3);
        if (!result.removable) continue;
        const [dx, dy, dz] = direction;
        const next = current.translate(dx * distanceMm, dy * distanceMm, dz * distanceMm);
        owned.push(next);
        const found = tryFrom(next, [...segmentsSoFar, { direction, distanceMm }], remainingSegments - 1);
        if (found !== null) return found;
      }
    }
    return null;
  };

  try {
    const path = tryFrom(targetSolid, [], options.maxSegments);
    return { path, candidatesTried };
  } finally {
    for (const solid of owned) solid.delete();
  }
}
