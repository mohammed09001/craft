import { describe, expect, it } from "vitest";

import { createAnalysisSessionStatusItem } from "./analysisSessionStatusItem";

describe("analysisSessionStatusItem", () => {
  it("creates an Idle Analysis Session status item by default", () => {
    expect(createAnalysisSessionStatusItem()).toEqual({
      id: "analysis-session-status",
      label: "Analysis Session",
      value: "Idle",
      tone: "neutral",
      accessibleText: "Analysis Session Idle",
    });
  });

  it("can create a non-idle Analysis Session status item", () => {
    expect(createAnalysisSessionStatusItem("Running")).toEqual({
      id: "analysis-session-status",
      label: "Analysis Session",
      value: "Running",
      tone: "neutral",
      accessibleText: "Analysis Session Running",
    });
  });
});
