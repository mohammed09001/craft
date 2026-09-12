/**
 * Test-only browser probe (Master Mold Execution 01, mirrors
 * cavityGeometryProbe.ts's Path B for the same reason: the product UI drives
 * Master Mold through a WebGL-canvas-adjacent toolbar button, not a stable
 * Playwright-addressable DOM flow through the full cutting/cavity pipeline).
 *
 * Never imported by the real product -- reached only through
 * e2e-harness.html (see e2e/masterMoldGeneration.spec.ts). Invokes the exact
 * same production path a real "Master Mold" click drives --
 * `runMasterMoldGenerationInWorker`, which spins up the real
 * `masterMoldGeneration.worker.ts` Worker and runs a real `manifold-3d` WASM
 * Boolean subtraction plus a real `three-mesh-bvh` open-direction analysis
 * inside it -- against a deterministic fixture, and reports the result on
 * `window.__masterMoldProbe` for the browser test to read.
 *
 * It must not, and does not, mock Manifold or three-mesh-bvh, replace either
 * with a fake implementation, duplicate the production algorithm, or call a
 * Node-only implementation: every imported symbol below is the real
 * production module also used by the shipped app.
 */
import { cubeMesh } from "@/features/mold-generation/cavity-generation/cavityGeneration.testFixtures";
import type { MasterMoldRequest, MasterMoldResult } from "@/features/mold-generation/master-mold/masterMold.contracts";
import { runMasterMoldGenerationInWorker } from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";

export interface MasterMoldProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly bodyCount: number | null;
  readonly status: string | null;
  readonly direction: string | null;
  readonly volumeMm3: number | null;
  readonly watertight: boolean | null;
  readonly manifold: boolean | null;
}

// A deterministic 10x6x4 mm box target, identical to the fixture already
// proven correct by masterMoldGeometry.generator.test.ts ("wraps a simple
// box target..."). The expected volume (stockVolume - targetVolume with a
// 3mm wall and 3mm bottom) is not invented for this probe.
const BOUNDS = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 4 } };

function buildDeterministicRequest(): MasterMoldRequest {
  return {
    operationId: "e2e-master-mold-probe",
    generationVersion: 1,
    parameters: { wallThicknessMm: 3, bottomThicknessMm: 3, geometryToleranceMm: 1e-3 },
    targets: [
      {
        source: {
          finalMoldPartId: "e2e-master-mold-probe-part",
          finalMoldPartName: "E2E Master Mold Probe Part",
          finalMoldGeometryVersion: "e2e-probe:1",
        },
        mesh: cubeMesh(BOUNDS),
        bounds: BOUNDS,
        volumeMm3: (BOUNDS.max.x - BOUNDS.min.x) * (BOUNDS.max.y - BOUNDS.min.y) * (BOUNDS.max.z - BOUNDS.min.z),
      },
    ],
  };
}

async function runMasterMoldProbe(): Promise<MasterMoldProbeResult> {
  try {
    const request = buildDeterministicRequest();
    const result: MasterMoldResult = await runMasterMoldGenerationInWorker(request);
    const body = result.bodies[0] ?? null;

    return {
      ok: true,
      error: null,
      bodyCount: result.bodies.length,
      status: body?.status ?? null,
      direction: body?.direction ?? null,
      volumeMm3: body?.volumeMm3 ?? null,
      watertight: body?.watertight ?? null,
      manifold: body?.manifold ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      bodyCount: null,
      status: null,
      direction: null,
      volumeMm3: null,
      watertight: null,
      manifold: null,
    };
  }
}

declare global {
  interface Window {
    __masterMoldProbe: () => Promise<MasterMoldProbeResult>;
  }
}

window.__masterMoldProbe = runMasterMoldProbe;
