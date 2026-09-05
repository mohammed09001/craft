import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createCompletedPullDirectionSessionReport } from "../../features/engineering-reports/pull-direction/pullDirectionReport.session";
import { PullDirectionCard } from "./PullDirectionCard";

describe("PullDirectionCard Stage 7 MVP display", () => {
  it("shows the completed MVP pull direction result clearly", () => {
    const report = createCompletedPullDirectionSessionReport({
      analysisSessionId: "stage-7-ui-test",
      modelId: "test-model",
      source: "frontend",
      coordinateSystem: "model",
      units: "mm",
    });

    render(<PullDirectionCard report={report} />);

    expect(screen.getByRole("heading", { name: "Pull Direction" })).toBeInTheDocument();
    expect(screen.getAllByText("Good").length).toBeGreaterThan(0);
    expect(screen.getByText("+Z")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
