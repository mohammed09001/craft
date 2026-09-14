import { buildGeometryTolerancePolicy, type GeometryTolerancePolicy } from "../geometry/geometryTolerance";

/**
 * Execution 05 Article 04: the tolerance math itself is neutral
 * (`geometry/geometryTolerance.ts` -- scale-aware numeric tolerances with no
 * product semantics). This module keeps Cavity's own versioned policy label
 * (it participates in Cavity's upstream input signature) and Cavity-named
 * API for Cavity-domain callers; it owns no algorithm of its own.
 */

export const CAVITY_TOLERANCE_POLICY_VERSION = "cavity-adaptive-v2";

export type CavityGeometryTolerancePolicy = GeometryTolerancePolicy;

export const buildCavityGeometryTolerancePolicy = buildGeometryTolerancePolicy;
