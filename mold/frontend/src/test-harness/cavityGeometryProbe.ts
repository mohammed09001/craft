/**
 * Test-only browser probe (Execution 06 Objective C, Path B).
 *
 * This module is never imported by the real product (main.tsx / App.tsx /
 * the router) -- it is reached only through e2e-harness.html, a separate
 * build entry point Playwright navigates to directly (see
 * e2e/cavityGeometry.spec.ts). Its job is to invoke the exact same
 * production Cavity-generation path a real "Create Cavity" click drives --
 * `runCavityGenerationInWorker`, which spins up the real `cavityGeneration
 * .worker.ts` Worker and runs a real `manifold-3d` WASM Boolean subtraction
 * inside it -- against a deterministic fixture, and report the result on
 * `window.__cavityProbe` for the browser test to read.
 *
 * It must not, and does not, mock Manifold, replace it with a fake
 * implementation, duplicate the production Boolean algorithm, or call a
 * Node-only implementation: every imported symbol below is the real
 * production module also used by the shipped app.
 */
import { generateMoldBodies } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import type {
  CutPlaneData,
} from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import type { ReferenceMoldDefinition } from "@/features/mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";
import { buildCavityGenerationInput } from "@/features/mold-generation/cavity-generation/cavityGeneration.input";
import { canonicalCube } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import { runCavityGenerationInWorker } from "@/features/mold-generation/cavity-generation/cavityGeneration.workerClient";

export interface CavityProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly originalVolumeMm3: number | null;
  readonly removedVolumeMm3: number | null;
  readonly resultVolumeMm3: number | null;
  readonly affectedBodyCount: number | null;
  readonly resultBodyCount: number | null;
  readonly allBodiesWatertightAndManifold: boolean | null;
  readonly blockerCount: number | null;
}

// A 30x30x30 reference mold block (K2) split once at x=5 around a 10x10x10
// selection box (K1) sitting at the origin -- the identical deterministic
// fixture already proven correct by
// cavityGeneration.integration.test.ts ("runs Stage A then Stage B...").
// Reusing it here means the expected numbers (removed=1000, result=26000)
// are not invented for this probe.
const k1 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const k2 = {
  min: { x: -10, y: -10, z: -10 },
  max: { x: 20, y: 20, z: 20 },
};
const cuttingPlane: CutPlaneData = {
  axis: "x",
  coordinate: 5,
  normal: { x: 1, y: 0, z: 0 },
  sourceSketchId: "middle",
  sourceFace: "left",
  order: 0,
};

function buildDeterministicDefinition(): ReferenceMoldDefinition {
  const base: ReferenceMoldDefinition = {
    schemaVersion: 1,
    definitionId: "e2e-cavity-probe",
    modelId: "e2e-cavity-probe-model",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: k1,
    referenceMoldBlock: { clearanceMm: 10, bounds: k2 },
    usedFaces: ["left"],
  };

  return { ...base, moldBodies: generateMoldBodies(base, [cuttingPlane]) };
}

async function runCavityProbe(): Promise<CavityProbeResult> {
  try {
    const definition = buildDeterministicDefinition();
    const input = buildCavityGenerationInput({
      sourcePartMesh: canonicalCube("e2e-cavity-probe-model", k1),
      definition,
      cuttingPlanes: [],
      cavityClearanceMm: 0,
      qualityMode: "standard",
      generationVersion: 1,
    });

    const { result } = await runCavityGenerationInWorker(input);
    // The real Worker path (evaluateCavityGeneration) nests this under
    // diagnostics.subtraction; only the direct-call unit-test path leaves it
    // at the top level. Check both, exactly as splitFace.store.ts does.
    const diagnostics = result.diagnostics?.subtraction ?? result.subtractionDiagnostics;

    return {
      ok: true,
      error: null,
      originalVolumeMm3: diagnostics?.originalVolumeMm3 ?? null,
      removedVolumeMm3: diagnostics?.removedVolumeMm3 ?? null,
      resultVolumeMm3: diagnostics?.resultVolumeMm3 ?? null,
      affectedBodyCount: diagnostics?.affectedBodyCount ?? null,
      resultBodyCount: result.bodies.length,
      allBodiesWatertightAndManifold: result.bodies.every(
        (body) => body.watertight && body.cavityValidation.manifold,
      ),
      blockerCount: result.blockers.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      originalVolumeMm3: null,
      removedVolumeMm3: null,
      resultVolumeMm3: null,
      affectedBodyCount: null,
      resultBodyCount: null,
      allBodiesWatertightAndManifold: null,
      blockerCount: null,
    };
  }
}

declare global {
  interface Window {
    __cavityProbe: () => Promise<CavityProbeResult>;
  }
}

window.__cavityProbe = runCavityProbe;
