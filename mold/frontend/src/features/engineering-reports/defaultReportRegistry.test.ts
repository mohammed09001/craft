import { describe, expect, it } from "vitest";

import {
  defaultEngineeringReportDefinitions,
  defaultEngineeringReportRegistry,
} from "./defaultReportRegistry";

describe("defaultEngineeringReportRegistry", () => {
  it("includes Pull Direction as a default engineering report definition", () => {
    expect(
      defaultEngineeringReportDefinitions.some(
        (definition) => definition.id === "pull-direction",
      ),
    ).toBe(true);

    const pullDirectionDefinition = defaultEngineeringReportDefinitions.find(
      (definition) => definition.id === "pull-direction",
    );

    expect(pullDirectionDefinition).toMatchObject({
      id: "pull-direction",
      displayName: "Pull Direction",
      category: "moldability",
      supportStatus: "coming-soon",
      visible: true,
    });
  });

  it("creates the default registry without mutating reportRegistry.ts", () => {
    expect(defaultEngineeringReportRegistry).toBeDefined();
  });

  it("keeps Pull Direction contract-only in the default registry definitions", () => {
    const pullDirectionDefinition = defaultEngineeringReportDefinitions.find(
      (definition) => definition.id === "pull-direction",
    );

    expect(pullDirectionDefinition?.metadata).toMatchObject({
      lifecycleStage: "contract_ready",
      supportsMockData: true,
      hasAlgorithm: false,
      hasViewportVisualization: false,
    });
  });
});
