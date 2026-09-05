import type { StatusItem } from "@/contracts/status.contract";
import type { ModelImportStatus, ViewportStatus } from "@/features/viewport";
import { getMoldGenerationEngineBridgeStatus } from "@/features/engine-integration";


export const STATUS_ITEMS = [
  {
    id: "frontend-ready",
    label: "Frontend",
    value: "Ready",
    tone: "success",
    accessibleText: "Frontend Ready",
  },
  {
    id: "standalone-ui",
    label: "Mode",
    value: "Standalone UI",
    tone: "info",
    accessibleText: "Standalone UI",
  },

] as const satisfies readonly StatusItem[];

export function createEngineIntegrationStatusItem(): StatusItem {
  const bridgeStatus = getMoldGenerationEngineBridgeStatus();

  return {
    id: "engine-integration-status",
    label: "Engine",
    value: "Mold Generation Bridge Ready",
    tone: "info",
    accessibleText: `Engine ${bridgeStatus.engine} ${bridgeStatus.capability} ${bridgeStatus.phase}`,
  };
}

const VIEWPORT_STATUS_VALUE: Record<ViewportStatus["phase"], string> = {
  initializing: "Initializing",
  ready: "Ready",
  unsupported: "Unsupported",
  error: "Error",
  "context-lost": "Context Lost",
};

const VIEWPORT_STATUS_TONE: Record<ViewportStatus["phase"], StatusItem["tone"]> =
  {
    initializing: "info",
    ready: "success",
    unsupported: "warning",
    error: "warning",
    "context-lost": "warning",
  };

export function createViewportStatusItem(
  viewportStatus: ViewportStatus,
): StatusItem {
  const value = VIEWPORT_STATUS_VALUE[viewportStatus.phase];

  return {
    id: "viewport-status",
    label: "Viewport",
    value,
    tone: VIEWPORT_STATUS_TONE[viewportStatus.phase],
    accessibleText: `Viewport ${value}`,
  };
}

const MODEL_STATUS_VALUE: Record<ModelImportStatus["phase"], string> = {
  "no-model": "No Model Loaded",
  validating: "Validating",
  loading: "Loading",
  ready: "Ready",
  invalid: "Invalid",
  error: "Error",
};

const MODEL_STATUS_TONE: Record<ModelImportStatus["phase"], StatusItem["tone"]> =
  {
    "no-model": "neutral",
    validating: "info",
    loading: "info",
    ready: "success",
    invalid: "warning",
    error: "warning",
  };

function formatModelStatusValue(modelStatus: ModelImportStatus) {
  const value = MODEL_STATUS_VALUE[modelStatus.phase];

  if (modelStatus.fileName === undefined || modelStatus.phase === "no-model") {
    return value;
  }

  const fileName =
    modelStatus.fileName.length > 28
      ? `${modelStatus.fileName.slice(0, 25)}...`
      : modelStatus.fileName;
  const detailParts = [
    modelStatus.format,
    modelStatus.fileSizeLabel,
    modelStatus.triangleCountLabel === undefined
      ? undefined
      : `${modelStatus.triangleCountLabel} ${
          modelStatus.triangleCount === 1 ? "triangle" : "triangles"
        }`,
  ].filter((detail): detail is string => detail !== undefined);
  const details = detailParts.length === 0 ? "" : ` (${detailParts.join(", ")})`;

  return `${value}: ${fileName}${details}`;
}

export function createModelStatusItem(
  modelStatus: ModelImportStatus,
): StatusItem {
  const value = formatModelStatusValue(modelStatus);

  return {
    id: "model-status",
    label: "Model",
    value,
    tone: MODEL_STATUS_TONE[modelStatus.phase],
    accessibleText: `Model ${value}`,
  };
}
