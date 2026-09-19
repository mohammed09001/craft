import { useEffect, useId, useMemo, useRef, useState } from "react";

import { MasterMoldIcon } from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import { useCuttingWorkflowStore } from "../cutting-workflow";
import { usePrinterBuildVolumeStore } from "@/features/viewport/printerBuildVolume.store";
import { useMasterMoldStore } from "./masterMold.store";
import { deriveMasterMoldUiState } from "./masterMold.contracts";
import { buildMasterMoldSeedSnapshot, DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES, masterSeedStalenessIdentity, masterSourceGeometryVersion, type MasterSeedGeometryInput } from "./seed/masterMoldSeed";
import { GENERIC_RIGID_CAST_PROFILE } from "./engine/contracts";
import type { MasterMoldProgressStageName } from "./engine/contracts";

/**
 * Execution 06 Article 01: Master Mold's toolbar entry -- a direct,
 * autonomous peer to Create Cavity. The button is enabled as soon as a valid
 * model is imported; it never requires Cut by Face, Segmentation, a committed
 * mold definition, cutting planes, or Create Cavity. On click it assembles
 * the Master-owned seed snapshot from the canonical imported part and neutral
 * project context and drives the autonomous engine through the store.
 *
 * Store boundary (Article 01): this component never reads or mutates
 * `splitFace.definition`, cutting planes, segmentation drafts, or Cavity
 * state. The only Split Face-domain signal it consumes is the boolean
 * "a cutting session is open", used for the deterministic conflict policy
 * (Master Mold is disabled with a clear reason until the session closes --
 * it never reads uncommitted draft geometry).
 */

/** User-facing progress labels (Article 15); internal stage names stay in the engine contract. */
const PROGRESS_LABELS: Readonly<Record<MasterMoldProgressStageName, string>> = {
  analyzing_geometry: "Analyzing part…",
  building_accessibility: "Finding release regions…",
  optimizing_working_mold: "Choosing mold-piece count…",
  constructing_working_mold: "Building working mold…",
  planning_master_tooling: "Planning Master cases…",
  verifying_release: "Verifying release…",
  finalizing: "Finalizing…",
};

/** Master-owned structural input -- deliberately not the Cavity domain's canonical-geometry type (Article 16). */
export interface MasterMoldSourceGeometryInput {
  readonly modelId: string;
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly transform: readonly number[];
  readonly localBounds: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } };
  readonly geometryVersion: string;
  readonly sourceSignature: string;
}

export function MasterMoldAction({
  sourcePartGeometry,
}: {
  readonly sourcePartGeometry?: MasterMoldSourceGeometryInput | null;
}) {
  const isSessionOpen = useCuttingWorkflowStore((s) => s.state.kind === "sessionOpen");
  const printerBuildVolume = usePrinterBuildVolumeStore((s) => s.dimensions);

  const generate = useMasterMoldStore((s) => s.generate);
  const markMasterMoldStale = useMasterMoldStore((s) => s.markMasterMoldStale);
  const resetMasterMold = useMasterMoldStore((s) => s.reset);
  const reportGenerationFailure = useMasterMoldStore((s) => s.reportGenerationFailure);
  const status = useMasterMoldStore((s) => s.status);
  const sets = useMasterMoldStore((s) => s.sets);
  const progressStage = useMasterMoldStore((s) => s.progressStage);
  const summary = useMasterMoldStore((s) => s.summary);
  const workerError = useMasterMoldStore((s) => s.lastError);
  const seedIdentity = useMasterMoldStore((s) => s.seedIdentity);

  const [generating, setGenerating] = useState(false);
  const bannerId = useId();

  // Live staleness identity over Master-relevant inputs only (Article 14):
  // source geometry signature (positions + transform), build volume,
  // process profile, and preferences. Create Cavity state is not an input.
  const liveIdentity = useMemo(() => {
    if (sourcePartGeometry === undefined || sourcePartGeometry === null) return null;
    return masterSeedStalenessIdentity({
      sourceGeometryVersion: masterSourceGeometryVersion({
        geometryVersion: sourcePartGeometry.geometryVersion,
        localBounds: sourcePartGeometry.localBounds,
        transform: sourcePartGeometry.transform,
      }),
      printerBuildVolume,
      processProfile: GENERIC_RIGID_CAST_PROFILE,
      userPreferences: DEFAULT_MASTER_MOLD_PLANNING_PREFERENCES,
    });
  }, [sourcePartGeometry, printerBuildVolume]);

  // Propagate staleness the moment Master-relevant inputs change identity
  // (Article 14). While a generation is in flight this propagation is
  // skipped -- Execution 07 LOOP 09 pairs that skip with the store's
  // guaranteed commit-time identity check: generate() compares the result's
  // seed identity against this live identity (read through a ref, so it is
  // the CURRENT identity at commit time) and flags a mid-flight input
  // change stale in the same transaction that commits the geometry.
  const liveIdentityRef = useRef(liveIdentity);
  useEffect(() => {
    liveIdentityRef.current = liveIdentity;
  }, [liveIdentity]);
  useEffect(() => {
    if (liveIdentity === null || seedIdentity === null) return;
    if (status === "generating") return;
    if (liveIdentity === seedIdentity.identity) return;
    markMasterMoldStale({ identity: liveIdentity, sourceProjectRevision: String(sourcePartGeometry?.sourceSignature ?? "") });
  }, [liveIdentity, seedIdentity, status, markMasterMoldStale, sourcePartGeometry]);

  // No imported geometry means nothing to plan from at all: fully reset.
  useEffect(() => {
    if (sourcePartGeometry === null || sourcePartGeometry === undefined) {
      resetMasterMold();
    }
  }, [sourcePartGeometry, resetMasterMold]);

  const generatingPending = status === "generating" || generating;
  // Execution 07 LOOP 08: the UI state comes from the shared derivation --
  // this component never invents its own partial/blocked semantics.
  const uiState = useMemo(
    () => deriveMasterMoldUiState({ status, sets, lastError: workerError }),
    [status, sets, workerError],
  );
  const complete = uiState.kind === "success";
  const stale = uiState.kind === "stale";
  const firstBlockedMessage =
    uiState.kind === "partial-success" || uiState.kind === "blocked"
      ? uiState.blockedMessages[0] ?? null
      : null;
  const lastError = uiState.kind === "error"
    ? uiState.message ?? "Master Mold generation failed."
    : firstBlockedMessage;

  // Multi-piece partial failure must be communicated (which piece failed)
  // without ever discarding or hiding an already-valid sibling.
  const partialFailureMessage = uiState.kind === "partial-success"
    ? `${uiState.blockedSetCount} of ${uiState.validSetCount + uiState.blockedSetCount} working mold part(s) could not be tooled; the rest remain valid. ${uiState.blockedMessages[0] ?? ""}`
    : null;

  const staleMessage = stale ? "Master Mold needs regeneration: the part or printer context changed since it was generated." : null;
  const bannerMessage = lastError !== null ? (partialFailureMessage ?? lastError) : staleMessage;
  const bannerRole = lastError !== null ? "alert" : "status";

  const progressLabel = progressStage !== null ? PROGRESS_LABELS[progressStage.stage] : null;

  const summaryMessage = useMemo(() => {
    if (summary === null || !complete) return null;
    if (!summary.allReleasesVerified) return null;
    const lines = [
      `Working mold: ${summary.workingMoldPieceCount} part${summary.workingMoldPieceCount === 1 ? "" : "s"}`,
      `Master tooling: ${summary.masterToolingPieceCount} printable piece${summary.masterToolingPieceCount === 1 ? "" : "s"}`,
      `${summary.onePieceCases} one-piece case${summary.onePieceCases === 1 ? "" : "s"}, ${summary.multiPieceCases} multi-panel`,
      summary.warningCount > 0 ? `${summary.warningCount} recommendation${summary.warningCount === 1 ? "" : "s"}` : "All release sequences verified",
    ];
    return lines.join(" · ");
  }, [summary, complete]);

  const handleClick = async () => {
    if (sourcePartGeometry === null || sourcePartGeometry === undefined || generatingPending || isSessionOpen) {
      return;
    }

    setGenerating(true);

    try {
      const seed = buildMasterMoldSeedSnapshot({
        sourcePartGeometry: sourcePartGeometry as MasterSeedGeometryInput,
        printerBuildVolume,
        projectRevision: sourcePartGeometry.sourceSignature,
      });
      await generate({
        seed,
        // Execution 07 LOOP 09: the store re-reads this at commit time, so a
        // source/transform/build-volume change during generation cannot
        // resurrect obsolete geometry as current.
        liveIdentity: () => liveIdentityRef.current,
      });
    } catch (error) {
      reportGenerationFailure(error instanceof Error ? error.message : "Master Mold could not generate tooling from the imported part.");
    } finally {
      setGenerating(false);
    }
  };

  if (sourcePartGeometry === null || sourcePartGeometry === undefined) {
    return null;
  }

  return (
    <span className={toolbarStyles.flyoutWithBanner}>
      <button
        aria-describedby={bannerMessage !== null || progressLabel !== null ? bannerId : undefined}
        aria-label="Master Mold"
        aria-pressed={complete}
        className={`${toolbarStyles.iconButton} ${complete ? toolbarStyles.primaryButton : ""}`}
        disabled={generatingPending || isSessionOpen}
        onClick={() => void handleClick()}
        title={
          generatingPending
            ? (progressLabel ?? "Generating Master Mold…")
            : isSessionOpen
              ? "Master Mold is unavailable while a cutting session is open."
              : lastError !== null
                ? `Master Mold: ${lastError}`
                : stale
                  ? "Master Mold: needs regeneration (the part or printer context changed)"
                  : "Master Mold"
        }
        type="button"
      >
        <MasterMoldIcon />
      </button>
      {(progressLabel !== null || summaryMessage !== null || bannerMessage !== null) && (
        <div className={toolbarStyles.reopenBlockedBanner} id={bannerId} role={bannerMessage !== null ? bannerRole : "status"}>
          {progressLabel ?? summaryMessage ?? bannerMessage}
        </div>
      )}
    </span>
  );
}
