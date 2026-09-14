import { useEffect, useId, useMemo, useState } from "react";

import { MasterMoldIcon } from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useMasterMoldStore } from "./masterMold.store";
import { buildMasterMoldProjectSnapshot } from "./masterMoldSnapshot";
import { castTargetInputVersion } from "./engine/castTargetIdentity";
import type { MasterSourcePartMesh } from "./engine/contracts";

/**
 * Master Mold's toolbar entry -- an independent peer to Create Cavity
 * (Execution 05 Articles 05/12). Assembles the authoritative project
 * snapshot from project truth (committed mold stock, canonical part, Sprue /
 * Registration intents, printer volume) and drives the Master Mold Engine
 * through the store. It never calls, reads, waits for, or synthesizes
 * Create Cavity's own generation.
 */
export function MasterMoldAction({
  sourcePartMesh,
}: {
  readonly sourcePartMesh?: MasterSourcePartMesh | null;
}) {
  const workflow = useSplitFaceStore((s) => s.workflow);
  const definition = useSplitFaceStore((s) => s.definition);
  const cuttingPlanes = useSplitFaceStore((s) => s.cuttingPlanes);
  const sprueDefinitions = useSplitFaceStore((s) => s.sprueDefinitions);
  const moldDocument = useSplitFaceStore((s) => s.document);
  const lastCommittedResult = useSplitFaceStore((s) => s.lastCommittedResult);
  const evaluationPhase = useSplitFaceStore((s) => s.evaluation.phase);
  const segmentationRegenerationPending = useSplitFaceStore((s) => s.segmentationRegenerationCount > 0);
  const printerBuildVolume = usePrinterBuildVolumeStore((s) => s.dimensions);

  const generate = useMasterMoldStore((s) => s.generate);
  const markMasterMoldStale = useMasterMoldStore((s) => s.markMasterMoldStale);
  const invalidateMasterMoldParts = useMasterMoldStore((s) => s.invalidateMasterMoldParts);
  const resetMasterMold = useMasterMoldStore((s) => s.reset);
  const reportGenerationFailure = useMasterMoldStore((s) => s.reportGenerationFailure);
  const status = useMasterMoldStore((s) => s.status);
  const sets = useMasterMoldStore((s) => s.sets);
  const workerError = useMasterMoldStore((s) => s.lastError);

  const [generating, setGenerating] = useState(false);
  const bannerId = useId();

  // The snapshot is derived, deterministic project truth -- rebuilt whenever
  // any of its authoritative inputs change (Article 12).
  const snapshot = useMemo(
    () =>
      definition === null || sourcePartMesh === undefined || sourcePartMesh === null
        ? null
        : buildMasterMoldProjectSnapshot({
            sourcePartMesh,
            definition,
            cuttingPlanes,
            sprueDefinitions,
            printerBuildVolume,
            projectRevision: moldDocument.revision,
            projectFingerprint: moldDocument.fingerprint,
          }),
    [sourcePartMesh, definition, cuttingPlanes, sprueDefinitions, printerBuildVolume, moldDocument.revision, moldDocument.fingerprint],
  );

  // Propagate staleness the moment the authoritative project inputs change
  // identity -- never wait for the next Generate click to discover it
  // (Article 12). Granular per part: a set whose cast-target input
  // signature (committed stock, source part, Sprue/Registration intents,
  // process profile) is unchanged stays current -- an unaffected sibling
  // must not flicker to stale for an edit that never reached it (Article
  // 13). Sprue intents are project-global, so a Sprue edit refreshes every
  // part's input signature (whole-collection invalidation for Sprues).
  //
  // Deliberately skipped while `evaluation.phase === "evaluating"`:
  // document.revision bumps synchronously the instant an edit is accepted,
  // well before the async Worker evaluation resolves and the committed
  // result catches up. Waiting for the evaluation to settle means the
  // committed state is authoritative one way or another by the time this
  // runs.
  useEffect(() => {
    if (evaluationPhase === "evaluating") return;
    if (snapshot === null) return;

    const documentIdentity = { revision: moldDocument.revision, fingerprint: moldDocument.fingerprint };
    const store = useMasterMoldStore.getState();
    if (store.sourceDocumentIdentity === null || store.sets.length === 0) return;

    const committedMatchesDocument =
      lastCommittedResult !== null &&
      lastCommittedResult.sourceRevision === moldDocument.revision &&
      lastCommittedResult.sourceFingerprint === moldDocument.fingerprint;

    const changedPartIds = snapshot.committedMoldParts
      .filter((part) => {
        const entry = store.sets.find((candidate) => candidate.moldPartId === part.id);
        return entry === undefined || entry.sourceSignature !== castTargetInputVersion(snapshot, part);
      })
      .map((part) => part.id);

    // A brand-new required part (never seen by Master Mold before) has no
    // set to diff against -- a coarser whole-collection invalidation applies
    // (Article 13).
    const hasNewPart = snapshot.committedMoldParts.some((part) => !store.sets.some((entry) => entry.moldPartId === part.id));
    if (hasNewPart || !committedMatchesDocument) {
      markMasterMoldStale(documentIdentity);
      return;
    }

    if (changedPartIds.length > 0) invalidateMasterMoldParts(changedPartIds);
  }, [markMasterMoldStale, invalidateMasterMoldParts, moldDocument.revision, moldDocument.fingerprint, lastCommittedResult, evaluationPhase, snapshot]);

  // `definition` becomes null exactly when there is no longer a committed
  // mold-part basis to speak of at all -- model replacement, orientation
  // change, a Cut by Face edit (toggleFace/removeSplitFace), or clearing
  // every cutting plane all null it in the same update as the edit itself.
  // That is a stronger invalidation than `stale`: old Master Mold part IDs
  // cannot even be looked up against whatever gets committed next, so this
  // fully resets rather than flags. Deliberately NOT keyed on `workflow`
  // alone -- merely opening/reopening the Constructed Cutting Plan session
  // (or Cancelling out of it without editing anything) leaves `definition`
  // untouched, and must not destroy a valid Master Mold result.
  useEffect(() => {
    if (definition === null) {
      resetMasterMold();
    }
  }, [definition, resetMasterMold]);

  if (workflow !== "partsReady") {
    return null;
  }

  const generatingPending = status === "generating" || generating;
  const complete = status === "current";
  const stale = status === "stale";
  const blocked = status === "blocked";
  const blockedMessages = sets
    .filter((entry) => entry.status === "blocked")
    .map((entry) => entry.failureMessage ?? (entry.set !== null ? entry.set.warnings[0] : null) ?? "tooling could not be generated.")
    .filter((message): message is string => message !== null);
  const lastError = workerError ?? (blockedMessages.length > 0 ? blockedMessages[0]! : null);

  // Multi-part partial failure must be communicated (which part failed)
  // without ever discarding or hiding an already-valid sibling -- the valid
  // sets keep rendering; this only adds the message.
  const partialFailure = blocked && blockedMessages.length > 0 && blockedMessages.length < sets.length;
  const partialFailureMessage = partialFailure
    ? `${blockedMessages.length} of ${sets.length} Master Mold part(s) could not be generated; the rest remain valid. ${blockedMessages[0]}`
    : null;

  const staleMessage = stale ? "Master Mold needs regeneration: the mold parts changed since it was generated." : null;
  const bannerMessage = lastError !== null ? (partialFailureMessage ?? lastError) : staleMessage;
  const bannerRole = lastError !== null ? "alert" : "status";

  const handleClick = async () => {
    if (snapshot === null || generatingPending || segmentationRegenerationPending) {
      return;
    }

    setGenerating(true);

    try {
      await generate({ snapshot }, { revision: moldDocument.revision, fingerprint: moldDocument.fingerprint });
    } catch (error) {
      reportGenerationFailure(error instanceof Error ? error.message : "Master Mold could not generate tooling from the project snapshot.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <span className={toolbarStyles.flyoutWithBanner}>
      <button
        aria-describedby={bannerMessage !== null ? bannerId : undefined}
        aria-label="Master Mold"
        aria-pressed={complete}
        className={`${toolbarStyles.iconButton} ${complete ? toolbarStyles.primaryButton : ""}`}
        disabled={generatingPending || segmentationRegenerationPending || snapshot === null}
        onClick={() => void handleClick()}
        title={
          generatingPending
            ? "Generating Master Mold…"
            : blocked && lastError !== null
              ? `Master Mold: ${lastError}`
              : stale
                ? "Master Mold: needs regeneration (mold parts changed)"
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
