import type { EngineeringReportDefinition } from "../reportRegistry.types";
import {
  PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  PULL_DIRECTION_REPORT_TYPE,
} from "./pullDirectionReport.contracts";

export const pullDirectionEngineeringReportDefinition = {
  id: "pull-direction",
  type: PULL_DIRECTION_REPORT_TYPE,
  displayName: "Pull Direction",
  description:
    "Contract-ready placeholder for future pull direction analysis. No engineering algorithm is executed in Chapter 9 Stage 4.",
  category: "moldability",
  displayOrder: 10,
  visible: true,
  supportStatus: "coming-soon",
  version: PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  metadata: {
    lifecycleStage: "contract_ready",
    supportsMockData: true,
    hasAlgorithm: false,
    hasViewportVisualization: false,
  },
} as const satisfies EngineeringReportDefinition;
