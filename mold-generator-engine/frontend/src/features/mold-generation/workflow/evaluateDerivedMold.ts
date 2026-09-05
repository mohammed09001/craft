import { MOLD_GEOMETRY_TOLERANCE_MM } from "../reference-mold-definition/orthogonalMold";
import { buildRegistrationDependencySnapshot, generateDerivedRegistration } from "../registration";
import { SprueGenerationService, type SprueDefinition, type SprueGenerationResult, type SprueOperationDefinition, type SprueSourceBody, type SprueUpdatedBody } from "../sprue-generation";
import type { DerivedMoldEvaluationInput, DerivedMoldEvaluationResult } from "./derivedMoldEvaluation.contracts";

/**
 * Per-Sprue memoization, keyed by operationId. A Sprue's generated result depends only on its own definition
 * (anchor position + profile) and `moldRevision` (which already encodes the cavity signature and every
 * upstream body's geometryVersion at the point this Sprue is generated). Reusing a cached result when that key
 * is unchanged skips an expensive Manifold Boolean pass for every Sprue a resize/move did not actually affect —
 * in practice every Sprue *before* the one being edited, since editing Sprue k never changes the bodies that
 * Sprues 0..k-1 see. This persists only for the lifetime of the Worker (or module, in the no-Worker fallback),
 * matching the existing `getManifoldModule()` singleton-cache convention.
 */
let sprueResultCache = new Map<string, { readonly key: string; readonly result: SprueGenerationResult }>();
function sprueCacheKey(moldRevision: string, definition: SprueOperationDefinition): string {
  return `${moldRevision}::${JSON.stringify(definition.anchor.position)}::${JSON.stringify(definition.profileDesign)}`;
}

function mergeBodies(bodies: readonly SprueSourceBody[], updated: readonly SprueUpdatedBody[]): readonly SprueSourceBody[] {
  const replacements = new Map(updated.map((body) => [body.id, body]));
  return bodies.map((body) => {
    const replacement = replacements.get(body.id);
    return replacement === undefined ? body : {
      ...body, bounds: replacement.bounds, centroid: replacement.centroid,
      mesh: replacement.mesh, triangleCount: replacement.triangleCount,
      volumeMm3: replacement.volumeMm3, watertight: replacement.watertight,
      geometryVersion: replacement.geometryVersion,
      sprueOperationId: replacement.sprueOperationId,
    };
  });
}

export async function evaluateDerivedMold(
  input: DerivedMoldEvaluationInput,
  onProgress: (stage: "sprues" | "registration", progress: number) => void = () => undefined,
): Promise<DerivedMoldEvaluationResult> {
  let bodies: readonly SprueSourceBody[] = (input.cavityResult?.bodies ?? input.definition.moldBodies ?? []).map((body) => ({
    ...body,
    geometryVersion: "geometryVersion" in body && typeof body.geometryVersion === "string" ? body.geometryVersion : `base:${body.id}`,
  }));
  const resolvedSprues: SprueDefinition[] = [];
  const warnings: string[] = [];
  const definitions = [...input.sprueDefinitions].sort((a, b) => a.creationOrder - b.creationOrder);
  const resolvedDefinitions = [];
  const service = new SprueGenerationService();
  const nextCache = new Map<string, { readonly key: string; readonly result: SprueGenerationResult }>();

  if (input.cavityResult === null) {
    for (const definition of definitions) resolvedDefinitions.push({ ...definition, validation: { status: "pending" as const, reasonCode: null, message: "Waiting for cavity geometry." } });
  }

  for (const [index, definition] of (input.cavityResult === null ? [] : definitions).entries()) {
    onProgress("sprues", definitions.length === 0 ? 1 : index / definitions.length);
    const moldRevision = `${input.cavityResult!.sourceSignature}:${bodies.map((body) => `${body.id}:${body.geometryVersion}`).join("|")}`;
    const key = sprueCacheKey(moldRevision, definition);
    const cached = sprueResultCache.get(definition.operationId);
    const result = cached !== undefined && cached.key === key ? cached.result : await service.generate({
      request: {
        operationId: definition.operationId,
        position: definition.anchor.position,
        profileDesign: definition.profileDesign,
        moldRevision,
      },
      targetBodies: bodies,
      cavity: input.cavityResult!.cavityTool.mesh,
      moldFrame: {
        frameId: `${input.definition.definitionId}:z-up`, units: "millimeters",
        origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 },
        yAxis: { x: 0, y: 1, z: 0 }, zAxis: { x: 0, y: 0, z: 1 },
      },
      geometryToleranceMm: MOLD_GEOMETRY_TOLERANCE_MM,
    });
    nextCache.set(definition.operationId, { key, result });
    if (result.status === "failure") {
      warnings.push(`${definition.operationId}: ${result.message}`);
      resolvedDefinitions.push({ ...definition, validation: { status: "invalid" as const, reasonCode: result.reasonCode, message: result.message } });
      continue;
    }
    bodies = mergeBodies(bodies, result.updatedBodies);
    resolvedSprues.push(result.sprue);
    resolvedDefinitions.push({ ...definition, validation: { status: "resolved" as const, reasonCode: null, message: null } });
  }
  if (input.cavityResult !== null) sprueResultCache = nextCache;

  onProgress("sprues", 1);
  onProgress("registration", 0);
  const snapshot = buildRegistrationDependencySnapshot({
    bodies, definition: input.definition, cuttingPlanes: input.cuttingPlanes,
    cavityTool: input.cavityResult?.cavityTool ?? null,
    cavityRevision: input.cavityResult?.sourceSignature ?? null,
    sprues: resolvedSprues, manufacturingProfile: null,
    ...(input.registrationSizingPolicy === undefined ? {} : { sizingPolicy: input.registrationSizingPolicy }),
  });
  const registration = await generateDerivedRegistration(snapshot);
  onProgress("registration", 1);
  return {
    requestId: input.requestId, sourceRevision: input.sourceRevision,
    sourceFingerprint: input.sourceFingerprint, sprueBodies: bodies,
    sprueDefinitions: resolvedDefinitions, resolvedSprues,
    registration, warnings,
  };
}
