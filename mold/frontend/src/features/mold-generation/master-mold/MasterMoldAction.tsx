import { useEffect, useId, useState } from "react";

import { cavityBodyGeometryVersion } from "../cavity-generation/cavityGeneration.signature";
import type { CanonicalPartGeometry } from "../cavity-generation/cavityGeneration.contracts";
import { MasterMoldIcon } from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { synthesizeFinalMoldTarget } from "../workflow";
import { useMasterMoldStore, type MasterMoldFinalBodyInput } from "./masterMold.store";

/**
 * Master Mold's toolbar entry -- an independent peer to Create Cavity, not
 * gated behind it (Article 02/09). If Create Cavity has already produced a
 * current committed result this reuses it directly; otherwise it synthesizes
 * the same final-mold-target geometry itself via the shared workflow seam,
 * so the user is never forced to press "Create Cavity" first.
 */
export function MasterMoldAction({
  sourcePartMesh,
}: {
  readonly sourcePartMesh?: CanonicalPartGeometry | null;
}) {
  const workflow = useSplitFaceStore((s) => s.workflow);
  const definition = useSplitFaceStore((s) => s.definition);
  const cuttingPlanes = useSplitFaceStore((s) => s.cuttingPlanes);
  const cavityClearanceMm = useSplitFaceStore((s) => s.cavity.clearanceMm);
  const qualityMode = useSplitFaceStore((s) => s.cavity.qualityMode);
  const sprueDefinitions = useSplitFaceStore((s) => s.sprueDefinitions);
  const moldDocument = useSplitFaceStore((s) => s.document);
  const lastCommittedResult = useSplitFaceStore((s) => s.lastCommittedResult);
  const evaluationPhase = useSplitFaceStore((s) => s.evaluation.phase);
  const segmentationRegenerationPending = useSplitFaceStore((s) => s.segmentationRegenerationCount > 0);

  const generate = useMasterMoldStore((s) => s.generate);
  const markMasterMoldStale = useMasterMoldStore((s) => s.markMasterMoldStale);
  const invalidateMasterMoldParts = useMasterMoldStore((s) => s.invalidateMasterMoldParts);
  const resetMasterMold = useMasterMoldStore((s) => s.reset);
  const status = useMasterMoldStore((s) => s.status);
  const bodies = useMasterMoldStore((s) => s.bodies);
  const workerError = useMasterMoldStore((s) => s.lastError);

  const [preparing, setPreparing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const bannerId = useId();

  // Article 01/07: propagate staleness the moment the authoritative
  // final-mold document changes identity -- never wait for the next
  // Generate click to discover it. When the freshly committed result
  // already matches this document identity, each part's own geometry hash
  // (the same cavityBodyGeometryVersion generate() itself fingerprints
  // against) tells us exactly which Master Mold bodies it actually touched,
  // so only those go stale -- an unrelated sibling part must not flicker to
  // stale for an edit that never reached it.
  //
  // Deliberately skipped while `evaluation.phase === "evaluating"`:
  // document.revision bumps synchronously the instant an edit is accepted
  // (acceptSprueIntent et al.), well before the async Worker evaluation
  // resolves and lastCommittedResult catches up. Reacting to that transient
  // mismatch would either coarse-mark an untouched sibling stale (the
  // fallback below) or misdiff against not-yet-updated data -- and unlike
  // the coarse mark, a wrong granular verdict is never later corrected, since
  // nothing else revives a body back to "current" outside of generate()
  // itself. Waiting for the evaluation to settle means lastCommittedResult
  // is authoritative one way or another by the time this runs.
  useEffect(() => {
    if (evaluationPhase === "evaluating") return;

    const documentIdentity = { revision: moldDocument.revision, fingerprint: moldDocument.fingerprint };
    const existingBodies = useMasterMoldStore.getState().bodies;
    const committedMatchesDocument =
      lastCommittedResult !== null &&
      lastCommittedResult.sourceRevision === moldDocument.revision &&
      lastCommittedResult.sourceFingerprint === moldDocument.fingerprint;

    if (!committedMatchesDocument || existingBodies.length === 0) {
      markMasterMoldStale(documentIdentity);
      return;
    }

    const changedPartIds = lastCommittedResult.bodies
      .filter((body) => {
        const existing = existingBodies.find((b) => b.source.finalMoldPartId === body.id);
        if (existing === undefined) return false;
        return existing.source.finalMoldGeometryVersion !== cavityBodyGeometryVersion(body);
      })
      .map((body) => body.id);

    if (changedPartIds.length > 0) {
      invalidateMasterMoldParts(changedPartIds);
    }
  }, [markMasterMoldStale, invalidateMasterMoldParts, moldDocument.revision, moldDocument.fingerprint, lastCommittedResult, evaluationPhase]);

  // Article 01: `definition` becomes null exactly when there is no longer a
  // committed final-mold basis to speak of at all -- model replacement,
  // orientation change, a Cut by Face edit (toggleFace/removeSplitFace), or
  // clearing every cutting plane all null it in the same update as the edit
  // itself. That is a stronger invalidation than `stale`: old Master Mold
  // part IDs cannot even be looked up against whatever gets committed next,
  // so this fully resets rather than flags. Deliberately NOT keyed on
  // `workflow` alone -- merely opening/reopening the Constructed Cutting
  // Plan session (or Cancelling out of it without editing anything) leaves
  // `definition` untouched, and must not destroy a valid Master Mold result
  // (Article 05: "switching between them must not corrupt either result").
  useEffect(() => {
    if (definition === null) {
      resetMasterMold();
    }
  }, [definition, resetMasterMold]);

  if (workflow !== "partsReady") {
    return null;
  }

  const mesh = sourcePartMesh ?? null;
  const generating = status === "generating" || preparing;
  const complete = status === "current";
  const stale = status === "stale";
  const blocked = status === "blocked";
  const blockedMessages = bodies.filter((body) => body.status === "blocked").map((body) => body.failureMessage).filter((message): message is string => message !== null);
  const lastError = synthesisError ?? workerError ?? (blockedMessages.length > 0 ? blockedMessages[0]! : null);

  // Article 06: multi-part partial failure must be communicated (which part
  // failed) without ever discarding or hiding an already-valid sibling --
  // the failing bodies stay out of the viewport (Article 01's rendering
  // gate) while the valid ones keep rendering; this only adds the message.
  const partialFailure = blocked && blockedMessages.length > 0 && blockedMessages.length < bodies.length;
  const partialFailureMessage = partialFailure
    ? `${blockedMessages.length} of ${bodies.length} Master Mold part(s) could not be generated; the rest remain valid. ${blockedMessages[0]}`
    : null;

  const staleMessage = stale ? "Master Mold needs regeneration: the final mold changed since it was generated." : null;
  const bannerMessage = lastError !== null ? (partialFailureMessage ?? lastError) : staleMessage;
  const bannerRole = lastError !== null ? "alert" : "status";

  const handleClick = async () => {
    if (mesh === null || definition === null || generating || segmentationRegenerationPending) {
      return;
    }

    setPreparing(true);
    setSynthesisError(null);

    try {
      // `lastCommittedResult` already exists right after the cutting commit,
      // before Create Cavity has ever run (`stages.cavityResult` is null
      // then) -- that's the base "Committed Cutting Result", not a final
      // mold part, so only reuse it once it genuinely reflects cavity
      // geometry. Otherwise synthesize it directly (Article 02): Master
      // Mold must not require the user to press Create Cavity first.
      const resultIsCurrent =
        lastCommittedResult !== null &&
        lastCommittedResult.stages.cavityResult !== null &&
        lastCommittedResult.sourceRevision === moldDocument.revision &&
        lastCommittedResult.sourceFingerprint === moldDocument.fingerprint;

      const targetBodies = resultIsCurrent
        ? lastCommittedResult.bodies
        : (
            await synthesizeFinalMoldTarget({
              sourcePartMesh: mesh,
              definition,
              cuttingPlanes,
              cavityClearanceMm,
              qualityMode,
              generationVersion: moldDocument.revision,
              requestId: `master-mold-target:${moldDocument.revision}:${moldDocument.fingerprint}`,
              sourceRevision: moldDocument.revision,
              sourceFingerprint: moldDocument.fingerprint,
              sprueDefinitions,
            })
          ).bodies;

      const finalMoldBodies: MasterMoldFinalBodyInput[] = targetBodies.map((body) => ({
        id: body.id,
        name: body.name,
        mesh: body.mesh,
        bounds: body.bounds,
        volumeMm3: body.volumeMm3,
      }));

      await generate(finalMoldBodies, { revision: moldDocument.revision, fingerprint: moldDocument.fingerprint });
    } catch (error) {
      setSynthesisError(error instanceof Error ? error.message : "Master Mold could not obtain the final-mold geometry.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <span className={toolbarStyles.flyoutWithBanner}>
      <button
        aria-describedby={bannerMessage !== null ? bannerId : undefined}
        aria-label="Master Mold"
        aria-pressed={complete}
        className={`${toolbarStyles.iconButton} ${complete ? toolbarStyles.primaryButton : ""}`}
        disabled={generating || segmentationRegenerationPending || mesh === null}
        onClick={() => void handleClick()}
        title={
          generating
            ? "Generating Master Mold…"
            : blocked && lastError !== null
              ? `Master Mold: ${lastError}`
              : stale
                ? "Master Mold: needs regeneration (final mold changed)"
                : "Master Mold"
        }
        type="button"
      >
        <MasterMoldIcon />
      </button>
      {bannerMessage !== null && (
        <div className={toolbarStyles.reopenBlockedBanner} id={bannerId} role={bannerRole}>
          {bannerMessage}
        </div>
      )}
    </span>
  );
}
