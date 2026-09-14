/**
 * Test-only browser probe (Execution 05 Articles 05-10, mirrors
 * cavityGeometryProbe.ts's Path B for the same reason: the product UI drives
 * Master Mold through a WebGL-canvas-adjacent toolbar button, not a stable
 * Playwright-addressable DOM flow through the full cutting pipeline).
 *
 * Never imported by the real product -- reached only through
 * e2e-harness.html (see e2e/masterMoldGeneration.spec.ts). Drives the exact
 * same production path a real "Master Mold" click now runs -- the
 * `runMasterMoldEngine` pipeline (cast target builder, pour-face planner,
 * release analysis, one-piece attempt) executed through
 * `runMasterMoldGenerationInWorker`, which spins up the real
 * `masterMoldGeneration.worker.ts` Worker with a real `manifold-3d` WASM
 * kernel inside it -- against a deterministic fixture, and reports the
 * result on `window.__masterMoldProbe`.
 */
import type { MasterMoldProjectSnapshot } from "@/features/mold-generation/master-mold/engine/contracts";
import { GENERIC_RIGID_CAST_PROFILE } from "@/features/mold-generation/master-mold/engine/contracts";
import type { MasterMoldRequest, MasterMoldResult } from "@/features/mold-generation/master-mold/masterMold.contracts";
import { runMasterMoldGenerationInWorker } from "@/features/mold-generation/master-mold/masterMoldGeneration.workerClient";
import { getManifoldModule, payloadFromManifold, createBlankSolid, boundsFromManifold } from "@/features/mold-generation/geometry/manifold";
import { meshGeometryVersion } from "@/features/mold-generation/geometry/geometryFingerprint";

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

// A plain 30x30x12 mm stock block with the source part sitting fully above
// it (no recess): the deterministic Golden Case A fixture also proven by
// masterMoldEngine.test.ts -- one obvious pour face, one-piece release.
const STOCK = { min: { x: -10, y: -10, z: 0 }, max: { x: 10, y: 10, z: 12 } };
const PART = { min: { x: -3, y: -3, z: 13 }, max: { x: 3, y: 3, z: 15 } };

function boxPositions(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): number[] {
  return [
    min.x, min.y, min.z, max.x, min.y, min.z, max.x, max.y, min.z, min.x, max.y, min.z,
    min.x, min.y, max.z, max.x, min.y, max.z, max.x, max.y, max.z, min.x, max.y, max.z,
  ];
}

const BOX_INDICES = [
  0, 2, 1, 0, 3, 2,
  4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4,
  3, 7, 6, 3, 6, 2,
  0, 4, 7, 0, 7, 3,
  1, 2, 6, 1, 6, 5,
];

async function buildDeterministicRequest(): Promise<MasterMoldRequest> {
  const module = await getManifoldModule();
  const partSolid = createBlankSolid(module, PART);
  const partMesh = payloadFromManifold(partSolid);
  const partBounds = boundsFromManifold(partSolid);
  partSolid.delete();

  const snapshot: MasterMoldProjectSnapshot = {
    schemaVersion: 1,
    snapshotId: "e2e-master-mold-probe",
    sourceModelGeometryIdentity: "e2e-probe-model",
    sourcePartMesh: {
      modelId: "e2e-probe-model",
      positions: partMesh.positions,
      indices: partMesh.indices,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      localBounds: partBounds,
      geometryVersion: "e2e-probe:1",
      sourceSignature: "e2e-probe-sig:1",
    },
    committedMoldParts: [
      {
        id: "e2e-master-mold-probe-part",
        name: "E2E Master Mold Probe Part",
        mesh: { positions: boxPositions(STOCK.min, STOCK.max), indices: BOX_INDICES },
        bounds: STOCK,
        volumeMm3: (STOCK.max.x - STOCK.min.x) * (STOCK.max.y - STOCK.min.y) * (STOCK.max.z - STOCK.min.z),
        geometryVersion: meshGeometryVersion({ id: "e2e-master-mold-probe-part", mesh: { positions: boxPositions(STOCK.min, STOCK.max), indices: BOX_INDICES }, bounds: STOCK }),
      },
    ],
    moldPartOffset: { x: 0, y: 0, z: 0 },
    moldDefinitionId: "e2e-probe-def",
    moldDefinition: {
      schemaVersion: 1,
      definitionId: "e2e-probe-def",
      modelId: "e2e-probe-model",
      coordinateSystem: { units: "millimeters", upAxis: "Z" },
      selectionBoxBounds: PART,
      referenceMoldBlock: { clearanceMm: 10, bounds: STOCK },
      usedFaces: [],
    },
    cuttingPlanes: [],
    referenceMoldBlockBounds: STOCK,
    sprueIntents: [],
    registrationPolicy: null,
    printerBuildVolume: null,
    processProfile: GENERIC_RIGID_CAST_PROFILE,
    projectRevision: 1,
    projectFingerprint: "e2e-probe-fp",
  };

  return { operationId: "e2e-master-mold-probe", generationVersion: 1, snapshot, priorSets: [] };
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

declare global {
  interface Window {
    __masterMoldProbe: () => Promise<MasterMoldProbeResult>;
  }
}

window.__masterMoldProbe = runMasterMoldProbe;
