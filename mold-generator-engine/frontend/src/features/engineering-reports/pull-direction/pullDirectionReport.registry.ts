import {
  PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  PULL_DIRECTION_REPORT_TYPE,
  type PullDirectionReport,
} from "./pullDirectionReport.contracts";
import { createMockPullDirectionReport } from "./pullDirectionReport.mock";

export const PULL_DIRECTION_REPORT_REGISTRY_ID = "pull-direction" as const;

export type PullDirectionReportRegistryEntry = Readonly<{
  id: typeof PULL_DIRECTION_REPORT_REGISTRY_ID;
  reportType: typeof PULL_DIRECTION_REPORT_TYPE;
  schemaVersion: typeof PULL_DIRECTION_REPORT_SCHEMA_VERSION;

  title: "Pull Direction";
  description: string;

  category: "mold_engineering";
  lifecycleStage: "contract_ready";

  supportsMockData: true;
  hasAlgorithm: false;
  hasViewportVisualization: false;

  createInitialReport: () => PullDirectionReport;
}>;

export const pullDirectionReportRegistryEntry: PullDirectionReportRegistryEntry =
  {
    id: PULL_DIRECTION_REPORT_REGISTRY_ID,
    reportType: PULL_DIRECTION_REPORT_TYPE,
    schemaVersion: PULL_DIRECTION_REPORT_SCHEMA_VERSION,

    title: "Pull Direction",
    description:
      "Defines the official contract for future pull direction analysis results. No engineering algorithm is executed in this stage.",

    category: "mold_engineering",
    lifecycleStage: "contract_ready",

    supportsMockData: true,
    hasAlgorithm: false,
    hasViewportVisualization: false,

    createInitialReport: createMockPullDirectionReport,
  };
