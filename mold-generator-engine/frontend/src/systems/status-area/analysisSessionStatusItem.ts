import type { StatusItem } from "@/contracts/status.contract";
import type { AnalysisSessionUiStatus } from "@/features/engine-integration";

export function createAnalysisSessionStatusItem(
  status: AnalysisSessionUiStatus = "Idle",
): StatusItem {
  return {
    id: "analysis-session-status",
    label: "Analysis Session",
    value: status,
    tone: "neutral",
    accessibleText: `Analysis Session ${status}`,
  };
}
