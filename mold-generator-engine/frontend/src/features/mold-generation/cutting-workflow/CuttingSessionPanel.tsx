import { useEffect, type PointerEvent } from "react";

import type { ViewportToolContext } from "@/features/viewport/viewportTool.capabilities";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import type { CanonicalPartGeometry } from "../cavity-generation";
import { useSegmentationModeStore } from "../segmentation/segmentationMode.store";
import { AxisExtensionPicker } from "../shared/AxisExtensionPicker";
import {
  CutByFaceIcon,
  ManualIcon,
  OneMoldIcon,
  PartitioningIcon,
} from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import panelStyles from "./CuttingSessionPanel.module.css";
import type { MoreMoldsReopenBlockedReason } from "./cuttingWorkflow.contracts";
import {
  useCuttingWorkflowStore,
  useIsActiveSegmentationPlanValid,
  useIsManualDraftActive,
  useManualDraftStore,
} from "./cuttingWorkflow.store";

const REOPEN_BLOCKED_MESSAGES: Record<MoreMoldsReopenBlockedReason, string> = {
  unsupported_schema_version: "This committed result was created by an unsupported version and can no longer be reopened for editing.",
  missing_provenance_detail: "This committed result is missing the details needed to reopen it for editing.",
  stale_model_geometry: "The imported model has changed since this result was created, so it can no longer be reopened for editing.",
  missing_cutting_definitions: "This committed result has no cutting definitions to restore.",
  incompatible_printer_dimensions: "Printer dimensions have changed since this result was created, so it can no longer be reopened for editing.",
  model_unavailable: "No imported model is available to reopen this result against.",
};

interface CuttingSessionPanelProps {
  readonly modelId: string | undefined;
  readonly selectionBoxBounds: Bounds3 | undefined;
  readonly canonicalPartGeometry: CanonicalPartGeometry | null;
}

/**
 * The single unified Constructed Cutting Plan panel: the complete temporary
 * cutting session, replacing the old ConstructedCuttingPlanFlyout +
 * SegmentationModeBar + MoreMoldsToolbar three-component fragmentation.
 * Every tab reuses its own existing engine unmodified -- Cut by Face reads
 * and writes the singleton splitFace store directly (exactly as it always
 * has: it has never had a separate draft, because until this panel existed
 * it never needed a Cancel that could roll it back independently of a
 * committed result -- see cuttingWorkflow.store.ts's
 * preSessionSplitFaceSnapshot, which now covers it too), One Mold reads
 * useSegmentationModeStore, and More Molds reads automaticDraft/manualDraft
 * -- none of that geometry/state ownership changed, only which component
 * hosts the controls and who decides when to commit/cancel.
 */
export function CuttingSessionPanel({
  modelId,
  selectionBoxBounds,
  canonicalPartGeometry,
}: CuttingSessionPanelProps) {
  const state = useCuttingWorkflowStore((s) => s.state);
  const setActiveTab = useCuttingWorkflowStore((s) => s.setActiveTab);
  const commitActiveTab = useCuttingWorkflowStore((s) => s.commitActiveTab);
  const cancelSession = useCuttingWorkflowStore((s) => s.cancelSession);
  const lastCommitBlockedReason = useCuttingWorkflowStore((s) => s.lastCommitBlockedReason);
  const lastReopenBlockedReason = useCuttingWorkflowStore((s) => s.lastReopenBlockedReason);
  const isSegmentationPlanValid = useIsActiveSegmentationPlanValid();

  const cuttingPlaneCount = useSplitFaceStore((s) => s.cuttingPlanes.length);

  const switchToAutomatic = useCuttingWorkflowStore((s) => s.switchToAutomatic);
  const switchToManual = useCuttingWorkflowStore((s) => s.switchToManual);
  const isManualActive = useIsManualDraftActive();
  const manualCuttingPlaneCount = useManualDraftStore((s) => s.cuttingPlanes.length);

  // Sprue/Cavity-availability inputs (isViewportToolAvailable reads this
  // shared context) must track whichever tab actually owns interaction
  // right now -- Cut by Face and One Mold both drive the singleton
  // directly (see this component's own doc comment), Manual owns its own
  // draft, and Automatic has no reference-geometry concept of its own
  // (nothing is committed for it yet), so it gets an explicit "not ready"
  // context rather than leaving the shared context stale at whatever the
  // previously-active tab last wrote.
  const setToolContext = useViewportToolStore((s) => s.setContext);
  const activeTabForContext = state.kind === "sessionOpen" ? state.activeTab : null;
  const moreMoldsActiveDraftForContext =
    state.kind === "sessionOpen" && state.activeTab === "moreMolds" ? state.moreMoldsActiveDraft : null;
  const singletonWorkflow = useSplitFaceStore((s) => s.workflow);
  const singletonEvaluationPhase = useSplitFaceStore((s) => s.evaluation.phase);
  const singletonHasReferenceGeometry = useSplitFaceStore(
    (s) => s.definition !== null || s.lastCommittedResult !== null,
  );
  const singletonHasCuttingPlanes = useSplitFaceStore((s) => s.cuttingPlanes.length > 0);
  const manualWorkflowForContext = useManualDraftStore((s) => s.workflow);
  const manualEvaluationPhaseForContext = useManualDraftStore((s) => s.evaluation.phase);
  const manualHasReferenceGeometryForContext = useManualDraftStore(
    (s) => s.definition !== null || s.lastCommittedResult !== null,
  );
  const manualHasCuttingPlanesForContext = useManualDraftStore((s) => s.cuttingPlanes.length > 0);

  useEffect(() => {
    if (activeTabForContext === null) return;
    const context: ViewportToolContext =
      activeTabForContext === "moreMolds" && moreMoldsActiveDraftForContext !== "manual"
        ? { workflow: "modelReady", evaluationPhase: "idle", hasReferenceGeometry: false, hasCuttingPlanes: false }
        : activeTabForContext === "moreMolds"
          ? {
              workflow: manualWorkflowForContext,
              evaluationPhase: manualEvaluationPhaseForContext,
              hasReferenceGeometry: manualHasReferenceGeometryForContext,
              hasCuttingPlanes: manualHasCuttingPlanesForContext,
            }
          : {
              workflow: singletonWorkflow,
              evaluationPhase: singletonEvaluationPhase,
              hasReferenceGeometry: singletonHasReferenceGeometry,
              hasCuttingPlanes: singletonHasCuttingPlanes,
            };
    setToolContext(context);
  }, [
    activeTabForContext,
    manualEvaluationPhaseForContext,
    manualHasCuttingPlanesForContext,
    manualHasReferenceGeometryForContext,
    manualWorkflowForContext,
    moreMoldsActiveDraftForContext,
    setToolContext,
    singletonEvaluationPhase,
    singletonHasCuttingPlanes,
    singletonHasReferenceGeometry,
    singletonWorkflow,
  ]);

  if (state.kind !== "sessionOpen") return null;
  const { activeTab, moreMoldsActiveDraft, commitPhase } = state;
  const isCommitting = commitPhase === "committing";

  function stopViewportPointerInteraction(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  const canConfirmOneMold =
    useSegmentationModeStore.getState().phase === "preview" && isSegmentationPlanValid;

  async function handleDone() {
    await commitActiveTab(
      modelId,
      selectionBoxBounds,
      canonicalPartGeometry?.sourceSignature ?? null,
    );
  }

  const doneDisabled =
    isCommitting ||
    (activeTab === "cutByFace" && cuttingPlaneCount === 0) ||
    (activeTab === "oneMold" && !canConfirmOneMold) ||
    (activeTab === "moreMolds" && moreMoldsActiveDraft === "automatic" && !isSegmentationPlanValid);

  return (
    <div
      aria-label="Constructed Cutting Plan"
      className={panelStyles.panel}
      onPointerDown={stopViewportPointerInteraction}
    >
      <div aria-label="Cutting method" className={panelStyles.tabs} role="tablist">
        <button
          aria-label="Cutting by Face"
          aria-selected={activeTab === "cutByFace"}
          className={`${panelStyles.tab} ${activeTab === "cutByFace" ? panelStyles.tabActive : ""}`}
          disabled={isCommitting}
          onClick={() => setActiveTab("cutByFace")}
          role="tab"
          title="Cutting by Face"
          type="button"
        >
          <CutByFaceIcon />
        </button>
        <button
          aria-label="Segmentation as One Mold"
          aria-selected={activeTab === "oneMold"}
          className={`${panelStyles.tab} ${activeTab === "oneMold" ? panelStyles.tabActive : ""}`}
          disabled={isCommitting}
          onClick={() => setActiveTab("oneMold")}
          role="tab"
          title="Segmentation as One Mold"
          type="button"
        >
          <OneMoldIcon />
        </button>
        <button
          aria-label="Segmentation as More Molds"
          aria-selected={activeTab === "moreMolds"}
          className={`${panelStyles.tab} ${activeTab === "moreMolds" ? panelStyles.tabActive : ""}`}
          disabled={isCommitting}
          onClick={() => setActiveTab("moreMolds")}
          role="tab"
          title="Segmentation as More Molds"
          type="button"
        >
          <PartitioningIcon />
        </button>
      </div>

      <span aria-hidden="true" className={toolbarStyles.separator} />

      <div aria-label={`${activeTab} tab content`} className={panelStyles.tabContent} role="tabpanel">
        {activeTab === "cutByFace" && (
          <>
            <div aria-label="Cutting" className={toolbarStyles.group}>
              <span
                aria-label={`${cuttingPlaneCount} split planes`}
                className={panelStyles.badge}
                role="status"
                title={`${cuttingPlaneCount} split planes`}
              >
                {cuttingPlaneCount}
              </span>
            </div>
          </>
        )}

        {activeTab === "oneMold" && (
          <>
            <AxisExtensionPicker />
          </>
        )}

        {activeTab === "moreMolds" && (
          <>
            <div aria-label="Strategy" className={toolbarStyles.group}>
              <button
                aria-label="Automatic"
                aria-pressed={moreMoldsActiveDraft === "automatic"}
                className={`${toolbarStyles.iconButton} ${moreMoldsActiveDraft === "automatic" ? toolbarStyles.primaryButton : ""}`}
                disabled={isCommitting}
                onClick={switchToAutomatic}
                title="Automatic"
                type="button"
              >
                <PartitioningIcon />
              </button>
              <button
                aria-label="Manual"
                aria-pressed={moreMoldsActiveDraft === "manual"}
                className={`${toolbarStyles.iconButton} ${moreMoldsActiveDraft === "manual" ? toolbarStyles.primaryButton : ""}`}
                disabled={isCommitting}
                onClick={switchToManual}
                title="Manual"
                type="button"
              >
                <ManualIcon />
              </button>
            </div>

            {!isManualActive && (
              <>
                <span aria-hidden="true" className={toolbarStyles.separator} />
                <AxisExtensionPicker />
              </>
            )}

            {isManualActive && (
              <>
                <span aria-hidden="true" className={toolbarStyles.separator} />
                <div aria-label="Manual cutting" className={toolbarStyles.group}>
                  <span
                    aria-label={`${manualCuttingPlaneCount} split planes`}
                    className={panelStyles.badge}
                    role="status"
                    title={`${manualCuttingPlaneCount} split planes`}
                  >
                    {manualCuttingPlaneCount}
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className={panelStyles.footer}>
        <button
          className={panelStyles.textButton}
          disabled={isCommitting}
          onClick={cancelSession}
          type="button"
        >
          Cancel
        </button>

        <button
          className={`${panelStyles.textButton} ${panelStyles.textButtonPrimary}`}
          disabled={doneDisabled}
          onClick={() => void handleDone()}
          title={
            isSegmentationPlanValid
              ? undefined
              : "The current extension plane position is invalid -- move it to a valid location before committing."
          }
          type="button"
        >
          Done
        </button>
      </div>

      {lastCommitBlockedReason !== null && (
        <div className={panelStyles.blockedBanner} role="alert">
          {lastCommitBlockedReason}
        </div>
      )}
      {lastReopenBlockedReason !== null && (
        <div className={panelStyles.blockedBanner} role="alert">
          {REOPEN_BLOCKED_MESSAGES[lastReopenBlockedReason]}
        </div>
      )}
    </div>
  );
}
