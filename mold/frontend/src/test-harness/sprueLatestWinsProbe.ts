/**
 * Test-only browser probe for the bounded latest-wins Sprue coordinator
 * (Execution 09, Objective A, Path B).
 *
 * Same contract as cavityGeometryProbe.ts: never imported by the real app,
 * only served through e2e-harness.html for Playwright to invoke.  Runs
 * real `evaluateDerivedMold` against a deterministic cavity fixture and
 * a real Manifold-backed `SprueGenerationService` to prove per-Sprue
 * cache reuse in the actual browser runtime (no mocks, no Node-only
 * implementations).
 *
 * The probe runs three evaluations and counts generate calls via a
 * temporary prototype spy -- the same pattern the Vitest unit tests use
 * but executed inside the production build inside Chromium.
 */
import { generateMoldBodies, type CutPlaneData } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";
import { buildCavityGenerationInput } from "@/features/mold-generation/cavity-generation/cavityGeneration.input";
import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import { runCavityGenerationInWorker } from "@/features/mold-generation/cavity-generation/cavityGeneration.workerClient";
import { evaluateDerivedMold } from "@/features/mold-generation/workflow/evaluateDerivedMold";
import { designSprueProfile, type SprueOperationDefinition } from "@/features/mold-generation/sprue-generation";
import { SprueGenerationService } from "@/features/mold-generation/sprue-generation/SprueGenerationService";

export interface SprueProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  /** Number of sprue definitions supplied per call. */
  readonly sprueCount: number;
  /** Number of real `SprueGenerationService.generate` calls across all three
   * evaluations.  If the cache works, this is < 3 × sprueCount because
   * unchanged Sprues are reused. */
  readonly totalGenerateCalls: number;
  /** Number of generate calls in the second evaluation (same inputs as first). */
  readonly secondEvalGenerateCalls: number;
  /** Number of generate calls in the third evaluation (one Sprue changed). */
  readonly thirdEvalGenerateCalls: number;
  /** resolvedSprues length from the first evaluation. */
  readonly resolvedSprueCount: number;
  /** Whether the second evaluation reused all Sprues (0 generate calls). */
  readonly secondEvalAllCached: boolean;
  /** Whether the third evaluation regenerated only 1 Sprue (the changed one). */
  readonly thirdEvalSingleRegenerate: boolean;
  readonly blockerCount: number;
  readonly bodyCount: number;
}

const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const k2 = { min: { x: -10, y: -10, z: -10 }, max: { x: 20, y: 20, z: 20 } };
const cuttingPlane: CutPlaneData = {
  axis: "x", coordinate: 5, normal: { x: 1, y: 0, z: 0 },
  sourceSketchId: "middle", sourceFace: "left", order: 0,
};

function buildDefinition(): ReferenceMoldDefinition {
  const base: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId: "sprue-cache-probe",
    modelId: "sprue-cache-probe-model",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: k1,
    referenceMoldBlock: { clearanceMm: 10, bounds: k2 },
    usedFaces: ["left"],
  };
  return { ...base, moldBodies: generateMoldBodies(base, [cuttingPlane]) };
}

const baseProfile = designSprueProfile(null);
function sprueDef(operationId: string, order: number, mainDiameterMm: number): SprueOperationDefinition {
  return {
    operationId,
    anchor: { position: { x: 5, y: 5, z: 30 }, surfaceId: "reference-mold:top" },
    inwardDirection: { x: 0, y: 0, z: -1 },
    profileDesign: {
      ...baseProfile,
      profile: {
        ...baseProfile.profile,
        mainDiameterMm,
        entryNeckDiameterMm: Math.min(baseProfile.profile.entryNeckDiameterMm, mainDiameterMm),
      },
    },
    creationOrder: order,
    coordinateSpace: "mold-local",
    validation: { status: "pending", reasonCode: null, message: null },
  };
}

async function runSprueProbe(): Promise<SprueProbeResult> {
  try {
    const definition = buildDefinition();
    const cavityInput = buildCavityGenerationInput({
      sourcePartMesh: canonicalCube("sprue-cache-probe-model", k1),
      definition,
      cuttingPlanes: [],
      cavityClearanceMm: 0,
      qualityMode: "standard",
      generationVersion: 1,
    });
    const { result: cavityResult } = await runCavityGenerationInWorker(cavityInput);

    const spruesA = [sprueDef("A", 0, 2.5), sprueDef("B", 1, 3.5)];
    const spruesBprime = [sprueDef("A", 0, 2.5), sprueDef("B", 1, 5.5)];

    let generateCount = 0;
    const originalGenerate = SprueGenerationService.prototype.generate;
    (SprueGenerationService.prototype as { generate: typeof originalGenerate }).generate = function patched(...args: Parameters<typeof originalGenerate>) {
      generateCount++;
      return originalGenerate.apply(this, args);
    };

    const inputBase = {
      cavityResult,
      definition,
      cuttingPlanes: [],
      sourceRevision: 1,
      sourceFingerprint: "probe",
    };

    // 1st evaluation: both Sprues are fresh, must generate both.
    generateCount = 0;
    const first = await evaluateDerivedMold({ ...inputBase, requestId: "1", sprueDefinitions: spruesA });
    const firstGenCount = generateCount;

    // 2nd evaluation: identical inputs; cache must reuse both.
    generateCount = 0;
    await evaluateDerivedMold({ ...inputBase, requestId: "2", sprueDefinitions: spruesA });
    const secondGenCount = generateCount;

    // 3rd evaluation: B changed (larger main diameter); A must still be
    // reused and only B regenerated.
    generateCount = 0;
    await evaluateDerivedMold({ ...inputBase, requestId: "3", sprueDefinitions: spruesBprime });
    const thirdGenCount = generateCount;

    (SprueGenerationService.prototype as { generate: typeof originalGenerate }).generate = originalGenerate;

    return {
      ok: true,
      error: null,
      sprueCount: 2,
      totalGenerateCalls: firstGenCount + secondGenCount + thirdGenCount,
      secondEvalGenerateCalls: secondGenCount,
      thirdEvalGenerateCalls: thirdGenCount,
      resolvedSprueCount: first.resolvedSprues.length,
      secondEvalAllCached: secondGenCount === 0,
      thirdEvalSingleRegenerate: thirdGenCount === 1,
      blockerCount: first.warnings.length,
      bodyCount: first.sprueBodies.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      sprueCount: 0,
      totalGenerateCalls: 0,
      secondEvalGenerateCalls: 0,
      thirdEvalGenerateCalls: 0,
      resolvedSprueCount: 0,
      secondEvalAllCached: false,
      thirdEvalSingleRegenerate: false,
      blockerCount: 0,
      bodyCount: 0,
    };
  }
}

declare global {
  interface Window {
    __sprueLatestWinsProbe: () => Promise<SprueProbeResult>;
  }
}

window.__sprueLatestWinsProbe = runSprueProbe;
