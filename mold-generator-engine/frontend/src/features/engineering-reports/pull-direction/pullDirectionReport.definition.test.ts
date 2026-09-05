import { describe, expect, it } from "vitest";

import {
  PULL_DIRECTION_REPORT_SCHEMA_VERSION,
  PULL_DIRECTION_REPORT_TYPE,
  pullDirectionEngineeringReportDefinition,
} from "./index";

describe("PullDirection EngineeringReportDefinition", () => {
  it("is compatible with the central Engineering Report Registry shape", () => {
    expect(pullDirectionEngineeringReportDefinition.id).toBe("pull-direction");
    expect(pullDirectionEngineeringReportDefinition.type).toBe(
      PULL_DIRECTION_REPORT_TYPE,
    );
    expect(pullDirectionEngineeringReportDefinition.displayName).toBe(
      "Pull Direction",
    );
    expect(pullDirectionEngineeringReportDefinition.category).toBe(
      "moldability",
    );
    expect(pullDirectionEngineeringReportDefinition.supportStatus).toBe(
      "coming-soon",
    );
    expect(pullDirectionEngineeringReportDefinition.version).toBe(
      PULL_DIRECTION_REPORT_SCHEMA_VERSION,
    );
  });

  it("keeps Stage 4 contract-only with no algorithm or viewport visualization", () => {
    expect(pullDirectionEngineeringReportDefinition.metadata).toMatchObject({
      lifecycleStage: "contract_ready",
      supportsMockData: true,
      hasAlgorithm: false,
      hasViewportVisualization: false,
    });
  });
});
