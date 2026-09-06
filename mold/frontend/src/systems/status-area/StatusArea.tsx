import type { StatusItem } from "@/contracts/status.contract";
import { StatusIndicator } from "@/design-system/primitives";
import {
  useDistanceMeasurementStatus,
  useModelImportStatus,
  useModelSelectionStatus,
} from "@/features/viewport";
import { useViewportStatus } from "@/state/ui-shell";
import { createAnalysisSessionStatusItem } from "@/systems/status-area/analysisSessionStatusItem";
import {
  createEngineIntegrationStatusItem,
  createModelStatusItem,
  createViewportStatusItem,
  STATUS_ITEMS,
} from "@/systems/status-area/status-items";

import styles from "@/systems/status-area/StatusArea.module.css";

export function StatusArea() {
  const viewportStatus = useViewportStatus();
  const modelStatus = useModelImportStatus();
  const measurementStatus = useDistanceMeasurementStatus();
  const selectionStatus = useModelSelectionStatus();

  const measurementValue =
    measurementStatus.distanceLabel ??
    (measurementStatus.activeTool === "measure-distance" ? "Active" : "None");

  const statusItems = [
    ...STATUS_ITEMS,
    createEngineIntegrationStatusItem(),
    createAnalysisSessionStatusItem(),
    createViewportStatusItem(viewportStatus),
    createModelStatusItem(modelStatus),
    {
      id: "measurement-status",
      label: "Measurement",
      value: measurementValue,
      tone:
        measurementStatus.phase === "complete" ||
        measurementStatus.activeTool === "measure-distance"
          ? "info"
          : "neutral",
      accessibleText: `Measurement ${measurementValue}`,
    } satisfies StatusItem,
    {
      id: "selection-status",
      label: "Selection",
      value: selectionStatus.isModelSelected ? "Model Selected" : "None",
      tone: selectionStatus.isModelSelected ? "info" : "neutral",
      accessibleText: selectionStatus.isModelSelected
        ? "Selection Model Selected"
        : "Selection None",
    } satisfies StatusItem,
  ];

  return (
    <footer
      aria-label="Application status"
      className={styles.statusArea}
      role="status"
    >
      {statusItems.map((item) => (
        <span
          aria-label={item.accessibleText}
          className={styles.statusItem}
          key={item.id}
        >
          <StatusIndicator tone={item.tone} />
          <span className={styles.label}>{item.label}</span>
          {item.value !== undefined && (
            <span className={styles.value}>{item.value}</span>
          )}
        </span>
      ))}
    </footer>
  );
}
