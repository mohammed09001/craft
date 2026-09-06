import { useSegmentationModeStore } from "./segmentationMode.store";
import type { SegmentationLifecyclePhase } from "./domain/segmentation.contracts";

/**
 * Segmentation lifecycle phases in which an accepted plan/result exists and
 * should be visualized (preview planes, contextual mold preview, executed
 * bodies). Exported so every consumer shares one definition instead of each
 * re-deriving this list against `segmentationMode.store.ts`'s own phases.
 */
export const SEGMENTATION_VISUALIZATION_PHASES: readonly SegmentationLifecyclePhase[] =
  ["preview", "accepted", "executing", "valid"];

/** True only while the Segmentation Engine has a plan/result worth rendering. */
export function useIsSegmentationVisualizationActive(): boolean {
  const plan = useSegmentationModeStore((state) => state.plan);
  const phase = useSegmentationModeStore((state) => state.phase);
  return plan !== null && SEGMENTATION_VISUALIZATION_PHASES.includes(phase);
}
