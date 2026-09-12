import { hashCavityValues } from "../cavity-generation/cavityGeneration.signature";
import type {
  MasterMoldDirection,
  MasterMoldParameters,
  MasterMoldSourceFingerprint,
} from "./masterMold.contracts";

/**
 * Deterministic fingerprint for one Master Mold body: identical
 * (finalMoldGeometryVersion, parameters, directionOverride) always produces
 * the same value, so unchanged siblings can be reused across regeneration
 * (Article 07) instead of recomputed.
 */
export function buildMasterMoldSourceFingerprint(
  finalMoldGeometryVersion: string,
  parameters: MasterMoldParameters,
  directionOverride: MasterMoldDirection | null,
): MasterMoldSourceFingerprint {
  const parametersSignature = hashCavityValues(parameters);
  const value = hashCavityValues({
    finalMoldGeometryVersion,
    parametersSignature,
    directionOverride,
  });

  return {
    finalMoldGeometryVersion,
    parametersSignature,
    directionOverride,
    value: `master-mold:${value}`,
  };
}

export function isMasterMoldBodyCurrent(
  fingerprint: MasterMoldSourceFingerprint,
  candidate: MasterMoldSourceFingerprint,
): boolean {
  return fingerprint.value === candidate.value;
}
