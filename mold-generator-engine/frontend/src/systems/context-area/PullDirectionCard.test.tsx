import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMockPullDirectionReport } from "../../features/engineering-reports/pull-direction";
import { PullDirectionCard } from "./PullDirectionCard";

describe("PullDirectionCard", () => {
  it("renders the not-analyzed placeholder state without requiring an algorithm", () => {
    render(<PullDirectionCard report={null} />);

    const card = screen.getByRole("region", {
      name: "Pull Direction",
    });

    expect(within(card).getByRole("heading", { name: "Pull Direction" }))
      .toBeInTheDocument();

    expect(within(card).getAllByText("Review").length).toBeGreaterThan(0);
    expect(within(card).getByText("Best Direction")).toBeInTheDocument();
    expect(within(card).getByText("Candidates")).toBeInTheDocument();
    expect(within(card).getByText("Confidence")).toBeInTheDocument();
    expect(within(card).getAllByText("Not available").length).toBeGreaterThan(0);
  });

  it("renders the mock PullDirectionReport contract state", () => {
    const report = createMockPullDirectionReport();

    render(<PullDirectionCard report={report} />);

    const card = screen.getByRole("region", {
      name: "Pull Direction",
    });

    expect(within(card).getAllByText("Review").length).toBeGreaterThan(0);
    expect(within(card).getByText("0")).toBeInTheDocument();
    expect(within(card).getAllByText("Not available").length).toBeGreaterThan(0);
  });
});
