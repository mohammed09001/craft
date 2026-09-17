/**
 * Test-only browser probe (Execution 06, mirrors cavityGeometryProbe.ts's
 * Path B for the same reason: the product UI drives Master Mold through a
 * WebGL-canvas-adjacent toolbar button, not a stable Playwright-addressable
 * DOM flow through the full cutting pipeline).
 *
 * Never imported by the real product -- reached only through
 * e2e-harness.html (see e2e/masterMoldGeneration.spec.ts). Drives the exact
 * same production path a real "Master Mold" click now runs -- the
 * autonomous `runMasterMoldEngine` pipeline (planning mesh, candidate
 * directions, global accessibility, piece-count optimizer, virtual working
 * mold construction, per-piece tooling) executed through
 * `runMasterMoldGenerationInWorker`, which spins up the real
 * `masterMoldGeneration.worker.ts` Worker with a real `manifold-3d` WASM
 * kernel inside it -- against a deterministic seed built straight from the
 * imported-part geometry (no cutting planes, no mold definition), and
 * reports the result on `window.__masterMoldProbe`.
 */
import type { MasterMoldRequest, MasterMoldResult } from "@/features/mold-generation/master-mold/masterMold.contracts";
import { runMasterMoldGenerationInWorker } from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";
import { buildMasterMoldSeedSnapshot } from "@/features/mold-generation/master-mold/seed/masterMoldSeed";
import { getManifoldModule, payloadFromManifold, createBlankSolid, boundsFromManifold } from "@/features/mold-generation/geometry/manifold";

export interface MasterMoldProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly setCount: number | null;
  readonly releaseMode: string | null;
  readonly pieceCount: number | null;
  readonly pourFace: string | null;
  readonly pieceVolumeMm3: number | null;
  readonly watertight: boolean | null;
  readonly manifold: boolean | null;
}

// A plain 10x10x10 mm cube part: the deterministic Golden Case A fixture
// also proven by masterMoldEngine.test.ts -- minimum two-piece working mold
// with verified tooling, straight from the imported geometry.
const PART = { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } };

async function buildDeterministicRequest(): Promise<MasterMoldRequest> {
  const module = await getManifoldModule();
  const partSolid = createBlankSolid(module, PART);
  const partMesh = payloadFromManifold(partSolid);
  const partBounds = boundsFromManifold(partSolid);
  partSolid.delete();

  const seed = buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "e2e-probe-model",
      positions: partMesh.positions,
      indices: partMesh.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: partBounds,
      geometryVersion: "e2e-probe:1",
      sourceSignature: "e2e-probe-sig:1",
    },
    printerBuildVolume: null,
    projectRevision: "e2e-probe-rev",
  });

  return { operationId: "e2e-master-mold-probe", generationVersion: 1, seed, priorSets: [] };
}

async function buildHighPolyRequest(): Promise<MasterMoldRequest> {
  const module = await getManifoldModule();
  const partSolid = module.Manifold.sphere(15, 64);
  const partMesh = payloadFromManifold(partSolid);
  const partBounds = boundsFromManifold(partSolid);
  partSolid.delete();
  const seed = buildMasterMoldSeedSnapshot({
    sourcePartGeometry: {
      modelId: "e2e-high-poly-model",
      positions: partMesh.positions,
      indices: partMesh.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: partBounds,
      geometryVersion: "e2e-high-poly:1",
      sourceSignature: "e2e-high-poly-sig:1",
    },
    printerBuildVolume: null,
    projectRevision: "e2e-high-poly-rev",
  });
  return { operationId: "e2e-master-mold-high-poly", generationVersion: 1, seed, priorSets: [] };
}

async function runMasterMoldProbe(): Promise<MasterMoldProbeResult> {
  try {
    const request = await buildDeterministicRequest();
    const result: MasterMoldResult = await runMasterMoldGenerationInWorker(request);
    const set = result.sets[0]?.set ?? null;
    const piece = set?.assembly.pieces[0] ?? null;

    return {
      ok: true,
      error: null,
      setCount: result.sets.length,
      releaseMode: set?.releaseMode ?? null,
      pieceCount: set?.assembly.pieces.length ?? null,
      pourFace: set?.pourFaceDecision.selected ?? null,
      pieceVolumeMm3: piece?.volumeMm3 ?? null,
      watertight: piece?.watertight ?? null,
      manifold: piece?.manifold ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      setCount: null,
      releaseMode: null,
      pieceCount: null,
      pourFace: null,
      pieceVolumeMm3: null,
      watertight: null,
      manifold: null,
    };
  }
}

async function runHighPolyProbe(): Promise<MasterMoldProbeResult> {
  try {
    const result: MasterMoldResult = await runMasterMoldGenerationInWorker(await buildHighPolyRequest());
    const set = result.sets[0]?.set ?? null;
    const piece = set?.assembly.pieces[0] ?? null;
    return {
      ok: true, error: null, setCount: result.sets.length,
      releaseMode: set?.releaseMode ?? null, pieceCount: set?.assembly.pieces.length ?? null,
      pourFace: set?.pourFaceDecision.selected ?? null, pieceVolumeMm3: piece?.volumeMm3 ?? null,
      watertight: piece?.watertight ?? null, manifold: piece?.manifold ?? null,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), setCount: null, releaseMode: null, pieceCount: null, pourFace: null, pieceVolumeMm3: null, watertight: null, manifold: null };
  }
}

declare global {
  interface Window {
    __masterMoldProbe: () => Promise<MasterMoldProbeResult>;
    __masterMoldHighPolyProbe: () => Promise<MasterMoldProbeResult>;
  }
}

window.__masterMoldProbe = runMasterMoldProbe;
window.__masterMoldHighPolyProbe = runHighPolyProbe;
