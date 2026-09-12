import { useEffect } from "react";

import type { ModelSelectionStatus } from "@/features/viewport/modelSelection.store";
import { useModelImportStatus } from "@/features/viewport/modelImport.store";
import {
  getPartOrientationCapability,
} from "@/features/viewport/partOrientation.store";
import { useViewportToolStore } from "@/features/viewport/viewportTool.store";
import { isViewportToolAvailable } from "@/features/viewport/viewportTool.capabilities";
import { CavityAction } from "../cavity-generation/CavityAction";
import type { CanonicalPartGeometry } from "../cavity-generation/cavityGeneration.contracts";
import { useCuttingWorkflowStore } from "../cutting-workflow";
import { MasterMoldAction } from "../master-mold/MasterMoldAction";
import {
  ConstructIcon,
  EraserIcon,
  FlipIcon,
  MoldScaleIcon,
  PointerIcon,
  RedoIcon,
  SprueIcon,
  UndoIcon,
} from "../shared/MoldToolbarIcons";
import toolbarStyles from "../shared/MoldToolbar.module.css";
import { useSplitFaceStore } from "./splitFace.store";
import styles from "./SplitFaceControls.module.css";

/**
 * The main toolbar. Stays mounted and interactive for the entire lifetime
 * of a loaded object, including while CuttingSessionPanel (the side panel
 * opened by the Constructed Cutting Plan button) is open -- the panel is an
 * extension of this toolbar, not a replacement for it (see the investigation
 * behind removing the old blanket `if (isSessionOpen) return null`, which
 * used to hide this whole toolbar for the session's duration).
 *
 * Pointer, Eraser, Undo, and Redo live here exclusively (not duplicated in
 * the panel) and always act on the singleton -- both session tabs either
 * edit it directly (Cut by Face) or drive their own dedicated engine
 * (Segmentation), so the singleton's history/interaction remains the one
 * authority here, exactly as while idle. Flip, Sprue, Create Cavity, and
 * the Constructed Cutting Plan trigger remain singleton-only, post-commit
 * tools -- disabled (not hidden) while a session is open, since none of
 * them apply to a session that hasn't been committed yet.
 */
export function SplitFaceControls({
  selection,
  canonicalPartGeometry = null,
}: {
  readonly selection: ModelSelectionStatus;
  readonly canonicalPartGeometry?: CanonicalPartGeometry | null;
}) {
  const state = useSplitFaceStore();
  const isSessionOpen = useCuttingWorkflowStore(
    (s) => s.state.kind === "sessionOpen",
  );
  const isSessionCommitting = useCuttingWorkflowStore(
    (s) => s.state.kind === "sessionOpen" && s.state.commitPhase === "committing",
  );
  const openSession = useCuttingWorkflowStore((s) => s.openSession);
  const modelStatus = useModelImportStatus();
  const activeTool = useViewportToolStore(
    (toolState) => toolState.activeTool,
  );
  const setActiveTool = useViewportToolStore(
    (toolState) => toolState.setActiveTool,
  );
  const setToolContext = useViewportToolStore((toolState) => toolState.setContext);
  const toolContext = useViewportToolStore((toolState) => toolState.context);
  const isToolAvailable = (tool: Parameters<typeof isViewportToolAvailable>[0]) => isViewportToolAvailable(tool, toolContext);
  const orientationCapability = getPartOrientationCapability();

  useEffect(() => {
    // Mold Scale owns the canonical singleton clearance. A cutting session
    // owns the singleton's editing lifecycle or a planning lifecycle
    // (Segmentation), so never allow the global command to remain active
    // across that boundary.
    if (isSessionOpen && activeTool === "mold-scale") setActiveTool("pointer");
  }, [activeTool, isSessionOpen, setActiveTool]);

  // Undo/Redo always drive the singleton -- both session tabs (Cut by Face
  // and Segmentation) edit the singleton or its own dedicated engine (see
  // CuttingSessionPanel's own doc comment), so the singleton's own history
  // is the only session-local edit history, exactly as it is while idle.
  const undo = state.undo;
  const redo = state.redo;
  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;

  useEffect(() => {
    // An open cutting session owns the shared viewportTool context
    // exclusively while it's active (CuttingSessionPanel sets it from
    // whichever tab/draft is active) -- this effect must not overwrite
    // that with the singleton's own state. Runs on every render regardless
    // of the null render below (hooks execute in declaration order, before
    // any early return) -- unaffected by removing the old session-wide
    // early return, since this guard was always separate from it.
    if (isSessionOpen) return;
    setToolContext({
      workflow: state.workflow,
      evaluationPhase: state.evaluation.phase,
      hasReferenceGeometry: state.definition !== null || state.lastCommittedResult !== null,
      hasCuttingPlanes: state.cuttingPlanes.length > 0,
    });
  }, [
    isSessionOpen,
    setToolContext,
    state.cuttingPlanes.length,
    state.definition,
    state.evaluation.phase,
    state.lastCommittedResult,
    state.workflow,
  ]);

  const hasSelection =
    selection.isModelSelected &&
    selection.selectedModelId !== undefined &&
    selection.selectionBoxBounds !== undefined;

  // The toolbar itself stays visible for the entire lifetime of a loaded
  // object -- it must not disappear just because nothing is selected yet.
  // Individual controls below disable themselves (via hasSelection or their
  // own tool-availability checks) rather than the whole toolbar vanishing.
  // A real selection cannot exist without a loaded model, so either signal
  // proves the object is loaded.
  if (modelStatus.phase !== "ready" && !hasSelection) {
    return null;
  }

  const generatingParts = state.workflow === "generatingParts";
  const generatingSprue = state.sprueStatus === "generating";

  return (
    <>
      <div
        aria-busy={generatingSprue}
        aria-label="Model tools"
        className={toolbarStyles.controls}
        data-viewport-position="upper-center"
        role="toolbar"
      >
        <button
            aria-label="Flip"
            aria-pressed={activeTool === "orientation"}
            className={`${toolbarStyles.iconButton} ${
              activeTool === "orientation" ? toolbarStyles.primaryButton : ""
            }`}
            disabled={!orientationCapability.available || isSessionOpen}
            onClick={() =>
              setActiveTool(
                activeTool === "orientation" ? "pointer" : "orientation",
              )
            }
            title={
              isSessionOpen
                ? "Flip is unavailable while a cutting session is open."
                : (orientationCapability.reason ?? "Use arrow keys to flip the part.")
            }
            type="button"
          >
            <FlipIcon />
          </button>

        <button
          aria-label="Mold Scale"
          aria-pressed={activeTool === "mold-scale"}
          className={`${toolbarStyles.iconButton} ${
            activeTool === "mold-scale" ? toolbarStyles.primaryButton : ""
          }`}
          disabled={isSessionOpen || !isToolAvailable("mold-scale")}
          onClick={() =>
            setActiveTool(activeTool === "mold-scale" ? "pointer" : "mold-scale")
          }
          title={isSessionOpen ? "Mold Scale is unavailable while a cutting session is open." : "Mold Scale"}
          type="button"
        >
          <MoldScaleIcon />
        </button>

        <span
          aria-hidden="true"
          className={toolbarStyles.separator}
        />

        <button
          aria-label="Constructed Cutting Plan"
          className={`${toolbarStyles.iconButton} ${toolbarStyles.commandButton}`}
          disabled={
            !hasSelection ||
            generatingParts ||
            state.cavity.status === "generating" ||
            generatingSprue ||
            isSessionOpen
          }
          onClick={openSession}
          title="Constructed Cutting Plan"
          type="button"
        >
          <ConstructIcon />
        </button>

        <span
          aria-hidden="true"
          className={toolbarStyles.separator}
        />

        <div aria-label="Interaction" className={toolbarStyles.group}>
          <button
            aria-label="Pointer tool"
            aria-pressed={activeTool === "pointer"}
            className={`${toolbarStyles.iconButton} ${activeTool === "pointer" ? toolbarStyles.primaryButton : ""}`}
            disabled={!isToolAvailable("pointer")}
            onClick={() => setActiveTool("pointer")}
            title="Pointer tool"
            type="button"
          >
            <PointerIcon />
          </button>

          <button
            aria-label="Eraser tool"
            aria-pressed={activeTool === "eraser"}
            className={`${toolbarStyles.iconButton} ${activeTool === "eraser" ? toolbarStyles.primaryButton : ""}`}
            disabled={!isToolAvailable("eraser")}
            onClick={() => setActiveTool("eraser")}
            title="Eraser tool"
            type="button"
          >
            <EraserIcon />
          </button>

          <button
            aria-label="Sprue"
            aria-pressed={activeTool === "sprue"}
            className={
              activeTool === "sprue"
                ? `${toolbarStyles.iconButton} ${toolbarStyles.primaryButton}`
                : toolbarStyles.iconButton
            }
            disabled={!isToolAvailable("sprue")}
            onClick={() =>
              setActiveTool(activeTool === "sprue" ? "pointer" : "sprue")
            }
            title="Sprue"
            type="button"
          >
            <SprueIcon />
          </button>
        </div>

        <CavityAction sourcePartMesh={canonicalPartGeometry} />
        <MasterMoldAction sourcePartMesh={canonicalPartGeometry} />

        <span
          aria-hidden="true"
          className={toolbarStyles.separator}
        />

        <div
          aria-label="History"
          className={toolbarStyles.group}
        >
          <button
            aria-label="Undo"
            className={toolbarStyles.iconButton}
            disabled={!canUndo || generatingParts || generatingSprue || isSessionCommitting}
            onClick={undo}
            title="Undo"
            type="button"
          >
            <UndoIcon />
          </button>

          <button
            aria-label="Redo"
            className={toolbarStyles.iconButton}
            disabled={!canRedo || generatingParts || generatingSprue || isSessionCommitting}
            onClick={redo}
            title="Redo"
            type="button"
          >
            <RedoIcon />
          </button>
        </div>
      </div>

      {state.error && (
        <div
          className={styles.errorBanner}
          role="alert"
        >
          {state.error}
        </div>
      )}
    </>
  );
}
