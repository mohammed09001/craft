import { boundsFromManifold, getManifoldModule, manifoldFromPayload, payloadFromManifold } from "../../geometry/manifold";
import { buildGeometryTolerancePolicy } from "../../geometry/geometryTolerance";
import { hashStableValues } from "../../geometry/geometryFingerprint";
import type { MasterMoldDirection } from "../masterMold.contracts";
import { axisOf } from "../masterMoldDirection.analyzer";
import type {
  MasterCastTarget,
  MasterMoldEngineResult,
  MasterMoldFailure,
  MasterMoldProjectSnapshot,
  MasterSurfaceAccessibility,
  MasterToolingPiece,
  MasterToolingSet,
} from "./contracts";
import { buildMasterCastTargets, castTargetInputVersion } from "./castTarget";
import { planPourFace } from "./pourFace";
import { analyzeSurfaceAccessibility } from "./releaseAnalysis";
import { flipDirection, planMultiPieceTooling } from "./multiPiecePlanner";
import {
  caseEnvelopeFor,
  constructCasePiece,
  fitsBuildVolume,
  pieceFromConstructed,
  toolingParametersFromSnapshot,
  toolingTolerancePolicy,
  validateAssembledNegative,
} from "./toolingConstruction";
import { verifyDemoldTranslation } from "../masterMoldDemold.verifier";

/**
 * Execution 05 Article 05: the Master Mold Engine.
 *
 * Runs the complete physical case-tooling pipeline against authoritative
 * project truth only:
 *
 *   Project Snapshot
 *     → Cast Target Builder          (Article 06)
 *     → Pour-Face Planner            (Article 07)
 *     → Surface Accessibility        (Article 08 Stage A)
 *     → One-Piece Release Attempt    (Article 08 Stage B)
 *     → Multi-Piece Planner          (Article 09)
 *     → Tooling Construction         (Article 10)
 *     → Tooling Registration         (Article 10)
 *     → Release Sequence             (Articles 08/09)
 *     → Validation                   (Articles 09/10)
 *     → MasterToolingSet[]
 *
 * The engine is invocable with project truth even when Create Cavity has
 * never run; it shares nothing with the Cavity domain (Section 7.2).
 */

export const ENGINE_LIMITS = {
  /** Centralized demold sweep margin multiplier for one-piece attempts. */
  onePieceSweepSafetyFactor: 1.1,
} as const;

export async function runMasterMoldEngine(
  snapshot: MasterMoldProjectSnapshot,
  priorSets: readonly MasterToolingSet[] = [],
): Promise<MasterMoldEngineResult> {
  const started = Date.now();
  const toolingSets: MasterToolingSet[] = [];
  const failures: MasterMoldFailure[] = [];
  const parameters = toolingParametersFromSnapshot(snapshot);

  const castOutcome = await buildMasterCastTargets(snapshot);
  failures.push(...castOutcome.failures);

  const negativeToolPayload = await buildNegativeToolPayload(snapshot);
  const priorByPart = new Map(priorSets.map((set) => [set.moldPartId, set] as const));

  for (const castTarget of castOutcome.targets) {
    // Article 13 incremental regeneration: a prior set whose cast-target
    // INPUT signature is unchanged (and that was current) is reused
    // verbatim -- no Boolean work, no re-planning.
    const part = snapshot.committedMoldParts.find((candidate) => candidate.id === castTarget.moldPartId);
    const prior = part === undefined ? undefined : priorByPart.get(part.id);
    if (
      part !== undefined &&
      prior !== undefined &&
      // A prior set whose cast-target INPUT signature is unchanged is
      // revalidated by this very check -- staleness overlays from upstream
      // intent edits do not force recomputation when the inputs prove the
      // deterministic pipeline would produce the identical set (Article 13).
      prior.sourceSignature === castTargetInputVersion(snapshot, part)
    ) {
      toolingSets.push(prior);
      continue;
    }

    try {
      const set = await buildToolingSetForTarget(snapshot, castTarget, negativeToolPayload, parameters);
      if (set !== null) toolingSets.push(set);
    } catch (error) {
      failures.push({
        moldPartId: castTarget.moldPartId,
        reason: "tooling_construction_failed",
        message: `${castTarget.moldPartName}: ${error instanceof Error ? error.message : "tooling construction failed."}`,
      });
    }
  }

  return {
    snapshotId: snapshot.snapshotId,
    toolingSets,
    failures,
    elapsedMs: Date.now() - started,
  };
}

/** Master's own part-negative tool (part + profile-supplied release clearance), the functional cavity geometry pour/release planners must respect. */
async function buildNegativeToolPayload(snapshot: MasterMoldProjectSnapshot): Promise<{ readonly mesh: ReturnType<typeof payloadFromManifold>; readonly bounds: ReturnType<typeof boundsFromManifold> }> {
  const module = await getManifoldModule();
  const policy = buildGeometryTolerancePolicy(snapshot.referenceMoldBlockBounds, 0);
  const partPayload = {
    positions: snapshot.sourcePartMesh.positions.map((value, index) => {
      switch (index % 3) {
        case 0: return value + snapshot.moldPartOffset.x;
        case 1: return value + snapshot.moldPartOffset.y;
        default: return value + snapshot.moldPartOffset.z;
      }
    }),
    indices: [...snapshot.sourcePartMesh.indices],
  };
  const solid = manifoldFromPayload(module, partPayload, policy.booleanToleranceMm);
  try {
    const mesh = payloadFromManifold(solid);
    return { mesh, bounds: boundsFromManifold(solid) };
  } finally {
    solid.delete();
  }
}

async function buildToolingSetForTarget(
  snapshot: MasterMoldProjectSnapshot,
  castTarget: MasterCastTarget,
  negativeTool: { readonly mesh: ReturnType<typeof payloadFromManifold>; readonly bounds: ReturnType<typeof boundsFromManifold> },
  parameters: ReturnType<typeof toolingParametersFromSnapshot>,
): Promise<MasterToolingSet | null> {
  const warnings: string[] = [...castTarget.warnings];

  // Article 07: Pour Face — an explicit, independent engine decision.
  const pourFaceDecision = planPourFace({
    castTarget,
    negativeToolMesh: negativeTool.mesh,
    negativeToolBounds: negativeTool.bounds,
    caseWallThicknessMm: parameters.caseWallThicknessMm,
    caseBaseThicknessMm: parameters.caseBaseThicknessMm,
    geometryToleranceMm: parameters.geometryToleranceMm,
    userOverride: null,
  });
  warnings.push(...pourFaceDecision.fillabilityWarnings);
  if (pourFaceDecision.selected === null) {
    throw new Error("no valid pour face: every candidate was rejected by hard constraints.");
  }
  const pourFace = pourFaceDecision.selected;

  // Article 08 Stage A: surface accessibility (visibility + grouped undercuts).
  const accessibility = analyzeSurfaceAccessibility(castTarget);

  // Article 08 Stage B: exact one-piece release attempt.
  const onePiece = await attemptOnePiece(castTarget, pourFace, parameters);
  let releaseMode: MasterToolingSet["releaseMode"];
  let pieces: readonly MasterToolingPiece[];
  let releaseSequence: MasterToolingSet["assembly"]["releaseSequence"];
  let partingSurfaces: MasterToolingSet["partingSurfaces"] = [];

  if (onePiece !== null) {
    releaseMode = "one-piece";
    pieces = onePiece.pieces;
    releaseSequence = onePiece.releaseSequence;
    // Build-volume feedback loop (Article 10): an oversized one-piece case
    // feeds back into the planner for further splitting, never into Final
    // Mold Segmentation.
    if (snapshot.printerBuildVolume !== null && !pieces.every((piece) => fitsBuildVolume(piece, snapshot))) {
      warnings.push("one-piece case exceeds the printer build volume; multi-piece partition attempted.");
      const multi = await planMultiPieceTooling(castTarget, pourFace, parameters, negativeTool.mesh);
      if (multi.plan !== null && multi.plan.pieces.every((piece) => fitsBuildVolume(piece, snapshot))) {
        releaseMode = "multi-piece";
        pieces = multi.plan.pieces;
        releaseSequence = multi.plan.releaseSequence;
        partingSurfaces = [multi.plan.partingSurface];
      } else {
        return sacrificialOutcome(snapshot, castTarget, pourFaceDecision, accessibility, warnings, "multi-piece partition could not satisfy the printer build volume.");
      }
    }
  } else {
    // One-piece failure is planning evidence, never product failure (Article 08 exit gate).
    const multi = await planMultiPieceTooling(castTarget, pourFace, parameters, negativeTool.mesh);
    if (multi.plan === null) {
      // Article 11: reusable_plan_not_found → sacrificial recommendation as a
      // structured outcome. Automatic sacrificial generation is never chosen
      // silently.
      return sacrificialOutcome(snapshot, castTarget, pourFaceDecision, accessibility, warnings, `no verified reusable tooling plan (${multi.rejectionReason ?? "unverified"}).`);
    }
    releaseMode = "multi-piece";
    pieces = multi.plan.pieces;
    releaseSequence = multi.plan.releaseSequence;
    partingSurfaces = [multi.plan.partingSurface];
  }

  const fingerprint = hashStableValues({
    snapshotId: snapshot.snapshotId,
    castTargetVersion: castTarget.geometryVersion,
    pourFace: pourFaceDecision,
    releaseMode,
    pieces: pieces.map((piece) => ({ id: piece.pieceId, geometry: piece.mesh, bounds: piece.bounds })),
    releaseSequence,
  });

  return {
    moldPartId: castTarget.moldPartId,
    moldPartName: castTarget.moldPartName,
    castTargetVersion: castTarget.geometryVersion,
    sourceSignature: sourceSignatureOf(snapshot, castTarget),
    pourFaceDecision,
    accessibility,
    releaseMode,
    partingSurfaces,
    assembly: { pieces, registrationFeatures: [], releaseSequence },
    warnings,
    fingerprint: `master-tooling-set:${fingerprint}`,
  };
}

/** Input-only identity backing Article 13's per-part reuse (no Boolean work). */
function sourceSignatureOf(snapshot: MasterMoldProjectSnapshot, castTarget: MasterCastTarget): string {
  const part = snapshot.committedMoldParts.find((candidate) => candidate.id === castTarget.moldPartId);
  if (part === undefined) return `orphan:${castTarget.moldPartId}`;
  return castTargetInputVersion(snapshot, part);
}

function sacrificialOutcome(
  snapshot: MasterMoldProjectSnapshot,
  castTarget: MasterCastTarget,
  pourFaceDecision: MasterToolingSet["pourFaceDecision"],
  accessibility: MasterSurfaceAccessibility,
  warnings: string[],
  reason: string,
): MasterToolingSet {
  return {
    moldPartId: castTarget.moldPartId,
    moldPartName: castTarget.moldPartName,
    castTargetVersion: castTarget.geometryVersion,
    sourceSignature: sourceSignatureOf(snapshot, castTarget),
    pourFaceDecision,
    accessibility,
    releaseMode: "sacrificial-recommended",
    partingSurfaces: [],
    assembly: { pieces: [], registrationFeatures: [], releaseSequence: [] },
    warnings: [...warnings, `reusable_plan_not_found → sacrificial_release_recommended: ${reason}`],
    fingerprint: `master-tooling-set:sacrificial:${castTarget.geometryVersion}`,
  };
}

/** Article 08 Stage B: build the one-piece case and exactly verify release + assembled negative. */
async function attemptOnePiece(
  castTarget: MasterCastTarget,
  pourFace: MasterMoldDirection,
  parameters: ReturnType<typeof toolingParametersFromSnapshot>,
): Promise<{ readonly pieces: readonly MasterToolingPiece[]; readonly releaseSequence: MasterToolingSet["assembly"]["releaseSequence"] } | null> {
  const module = await getManifoldModule();
  const caseBounds = caseEnvelopeFor(castTarget.bounds, pourFace, parameters.caseWallThicknessMm, parameters.caseBaseThicknessMm);
  const policy = toolingTolerancePolicy(caseBounds);
  const volumeTolerance = Math.max(policy.affectedVolumeToleranceMm3, castTarget.volumeMm3 * 1e-3);
  const axis = axisOf(pourFace);
  const sweepClearanceMm =
    (caseBounds.max[axis] - caseBounds.min[axis]) * ENGINE_LIMITS.onePieceSweepSafetyFactor;

  const targetSolid = manifoldFromPayload(module, castTarget.mesh, policy.booleanToleranceMm);
  let constructed;
  try {
    constructed = await constructCasePiece({ castTarget, pourFace, parameters, coreToolMesh: null, coreMode: "split" });
  } catch {
    targetSolid.delete();
    return null;
  }

  try {
    // The piece is the moving body: the open-face case withdraws opposite
    // its cavity mouth so the mouth's rim sweeps clear of the target.
    const releaseDirection = flipDirection(pourFace);
    const sweep = verifyDemoldTranslation(targetSolid, constructed.solid, releaseDirection, sweepClearanceMm, policy.surfaceToleranceMm, volumeTolerance);
    if (!sweep.removable) return null;

    const assembled = await validateAssembledNegative([constructed.solid], castTarget, pourFace, parameters);
    if (assembled.overlapVolumeMm3 > volumeTolerance || assembled.residualVoidVolumeMm3 < -volumeTolerance || assembled.residualVoidVolumeMm3 > castTarget.volumeMm3) return null;

    const piece = pieceFromConstructed("piece-1", `${castTarget.moldPartName} Master Case`, constructed, releaseDirection, ["one-piece"]);
    return {
      pieces: [piece],
      releaseSequence: [
        { stepIndex: 0, pieceId: piece.pieceId, direction: releaseDirection, clearanceDistanceMm: sweepClearanceMm, collisionVerified: true },
      ],
    };
  } finally {
    constructed.solid.delete();
    targetSolid.delete();
  }
}
