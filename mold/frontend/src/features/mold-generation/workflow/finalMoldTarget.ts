import { runCavityGenerationInWorker } from "../cavity-generation/cavityGeneration.workerClient";
import type { CanonicalPartGeometry, CavityQualityMode } from "../cavity-generation/cavityGeneration.contracts";
import type { ReferenceMoldDefinition } from "../reference-mold-definition";
import type { MoldBodyData } from "../reference-mold-definition/orthogonalMold";
import { AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY, type RegistrationSizingPolicy } from "../registration/registrationSizing.policy";
import type { SprueOperationDefinition } from "../sprue-generation";
import type { CuttingPlaneRecord } from "../split-face";
import { runDerivedMoldEvaluation } from "./derivedMoldEvaluation.workerClient";

/**
 * Which Registration sizing policy the committed Registration stage should
 * use, selected from authoritative committed provenance
 * (`definition.segmentationLineage`) -- never guessed downstream. Shared by
 * `splitFace.store`'s `createCavity` and Master Mold's own target synthesis
 * below so there is exactly one place this rule is expressed.
 */
export function registrationSizingPolicyFor(
  definition: ReferenceMoldDefinition,
): { readonly registrationSizingPolicy: RegistrationSizingPolicy } | Record<string, never> {
  return definition.segmentationLineage === true ? { registrationSizingPolicy: AUTOMATIC_SEGMENTATION_REGISTRATION_SIZING_POLICY } : {};
}

export interface SynthesizeFinalMoldTargetOptions {
  readonly sourcePartMesh: CanonicalPartGeometry;
  readonly definition: ReferenceMoldDefinition;
  readonly cuttingPlanes: readonly CuttingPlaneRecord[];
  readonly cavityClearanceMm: number;
  readonly qualityMode: CavityQualityMode;
  readonly generationVersion: number;
  readonly requestId: string;
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
  readonly sprueDefinitions: readonly SprueOperationDefinition[];
  readonly onProgress?: (stage: "validating" | "cavity" | "sprues" | "registration", progress: number) => void;
}

export interface FinalMoldTargetSynthesis {
  readonly bodies: readonly MoldBodyData[];
  readonly warnings: readonly string[];
}

/**
 * Article 02's `FinalMoldTarget` seam: the same authoritative
 * geometry-generation capability `createCavity` uses (cavity Boolean
 * subtraction, then sprue + registration), callable directly so Master Mold
 * can obtain final-mold part geometry without requiring the user to press
 * "Create Cavity" first and without duplicating any cavity/registration/
 * sprue logic. Deliberately does not touch `splitFace.store`'s cavity/
 * registration/document/undo state -- callers own presenting or caching
 * whatever they do with the result.
 */
export async function synthesizeFinalMoldTarget(
  options: SynthesizeFinalMoldTargetOptions,
): Promise<FinalMoldTargetSynthesis> {
  // Dynamic import for the same reason `createCavity` uses one: keeps
  // cavityGeneration.input.ts's "three" (Matrix4) dependency out of the
  // eagerly-loaded main bundle. This module is statically imported by
  // splitFace.store.ts (via workflow/index.ts) for registrationSizingPolicyFor,
  // so a static import here would defeat that split entirely.
  const { buildCavityGenerationInput } = await import("../cavity-generation/cavityGeneration.input");

  const input = buildCavityGenerationInput({
    sourcePartMesh: options.sourcePartMesh,
    definition: options.definition,
    cuttingPlanes: options.cuttingPlanes,
    cavityClearanceMm: options.cavityClearanceMm,
    qualityMode: options.qualityMode,
    generationVersion: options.generationVersion,
  });

  const execution = await runCavityGenerationInWorker(input, {
    onProgress: (_stage, progress) => options.onProgress?.("cavity", progress),
  });

  const derived = await runDerivedMoldEvaluation(
    {
      requestId: options.requestId,
      sourceRevision: options.sourceRevision,
      sourceFingerprint: options.sourceFingerprint,
      cavityResult: execution.result,
      definition: options.definition,
      cuttingPlanes: options.cuttingPlanes,
      sprueDefinitions: options.sprueDefinitions,
      ...registrationSizingPolicyFor(options.definition),
    },
    (stage, progress) => options.onProgress?.(stage, progress),
  );

  return {
    bodies: derived.registration.bodies ?? derived.sprueBodies,
    warnings: derived.warnings,
  };
}
