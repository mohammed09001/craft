import { useEffect, type PointerEvent } from "react";

import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import type { CanonicalPartGeometry } from "../cavity-generation";
import { useSegmentationStore } from "../segmentation/segmentation.store";
import { AxisExtensionPicker } from "../shared/AxisExtensionPicker";
import { CutByFaceIcon, SegmentationIcon } from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import type { Bounds3 } from "../split-face/splitFace.contracts";
import { useSplitFaceStore } from "../split-face/splitFace.store";
import panelStyles from "./CuttingSessionPanel.module.css";
import { useCuttingWorkflowStore, useIsActiveSegmentationPlanValid } from "./cuttingWorkflow.store";

interface CuttingSessionPanelProps {
  readonly modelId: string | undefined;
  readonly selectionBoxBounds: Bounds3 | undefined;
  readonly canonicalPartGeometry: CanonicalPartGeometry | null;
}

/**
 * The single unified Constructed Cutting Plan panel: the complete temporary
 * cutting session. Every tab reuses its own existing engine unmodified --
 * Cut by Face reads and writes the singleton splitFace store directly
 * (exactly as it always has: it has never had a separate draft, because
 * until this panel existed it never needed a Cancel that could roll it back
 * independently of a committed result -- see cuttingWorkflow.store.ts's
 * preSessionSplitFaceSnapshot, which now covers it too), and Segmentation
 * reads useSegmentationStore -- none of that geometry/state ownership
 * changed, only which component hosts the controls and who decides when to
 * commit/cancel.
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
  const isSegmentationPlanValid = useIsActiveSegmentationPlanValid();

  const cuttingPlaneCount = useSplitFaceStore((s) => s.cuttingPlanes.length);

  // Sprue/Cavity-availability inputs (isViewportToolAvailable reads this
  // shared context) must track whichever tab actually owns interaction
  // right now -- Cut by Face and Segmentation both drive the singleton
  // directly (see this component's own doc comment).
  const setToolContext = useViewportToolStore((s) => s.setContext);
  const activeTabForContext = state.kind === "sessionOpen" ? state.activeTab : null;
  const singletonWorkflow = useSplitFaceStore((s) => s.workflow);
  const singletonEvaluationPhase = useSplitFaceStore((s) => s.evaluation.phase);
  const singletonHasReferenceGeometry = useSplitFaceStore(
    (s) => s.definition !== null || s.lastCommittedResult !== null,
  );
  const singletonHasCuttingPlanes = useSplitFaceStore((s) => s.cuttingPlanes.length > 0);

  useEffect(() => {
    if (activeTabForContext === null) return;
    setToolContext({
      workflow: singletonWorkflow,
      evaluationPhase: singletonEvaluationPhase,
      hasReferenceGeometry: singletonHasReferenceGeometry,
      hasCuttingPlanes: singletonHasCuttingPlanes,
    });
  }, [
    activeTabForContext,
    setToolContext,
    singletonEvaluationPhase,
    singletonHasCuttingPlanes,
    singletonHasReferenceGeometry,
    singletonWorkflow,
  ]);

  if (state.kind !== "sessionOpen") return null;
  const { activeTab, commitPhase } = state;
  const isCommitting = commitPhase === "committing";

  function stopViewportPointerInteraction(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  const canConfirmSegmentation =
    useSegmentationStore.getState().phase === "preview" && isSegmentationPlanValid;

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
    (activeTab === "segmentation" && !canConfirmSegmentation);

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
          aria-label="Segmentation"
          aria-selected={activeTab === "segmentation"}
          className={`${panelStyles.tab} ${activeTab === "segmentation" ? panelStyles.tabActive : ""}`}
          disabled={isCommitting}
          onClick={() => setActiveTab("segmentation")}
          role="tab"
          title="Segmentation"
          type="button"
        >
          <SegmentationIcon />
        </button>
      </div>

      <span aria-hidden="true" className={toolbarStyles.separator} />

      <div aria-label={`${activeTab} tab content`} className={panelStyles.tabContent} role="tabpanel">
        {activeTab === "cutByFace" && (
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
        )}

        {activeTab === "segmentation" && <AxisExtensionPicker />}
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
    </div>
  );
}
