import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { MasterMoldPiecesBrowser } from "./MasterMoldPiecesBrowser";
import { useMasterMoldStore } from "./masterMold.store";
import { deriveMasterMoldUiState, hasRenderableToolingGeometry } from "./masterMold.contracts";
import type { MasterToolingSetState } from "./masterMold.contracts";
import type { MasterToolingSet } from "./engine/contracts";

// Execution 07 LOOP 08: the pieces browser renders only when renderable
// tooling geometry exists -- a blocked-only result must never look like
// generated geometry, while valid partial geometry stays inspectable.

function validSetEntry(moldPartId: string): MasterToolingSetState {
  const set = {
    moldPartId,
    moldPartName: `WM ${moldPartId}`,
    assembly: {
      pieces: [{ pieceId: `${moldPartId}-panel-1`, name: `${moldPartId} panel 1` }],
      registrationFeatures: [],
      coreMode: "split",
      releaseSequence: [],
    },
    warnings: [],
  };
  return {
    moldPartId,
    moldPartName: `WM ${moldPartId}`,
    status: "current",
    sourceSignature: "sig",
    contentVersion: "ctv",
    set: set as unknown as MasterToolingSet,
    failureMessage: null,
  };
}

function blockedSetEntry(moldPartId: string, message: string): MasterToolingSetState {
  return {
    moldPartId,
    moldPartName: moldPartId,
    status: "blocked",
    sourceSignature: "sig",
    contentVersion: "ctv",
    set: null,
    failureMessage: message,
  };
}

beforeEach(() => {
  useMasterMoldStore.getState().reset();
});

describe("Master Mold UI state machine (Execution 07 LOOP 08)", () => {
  it("derives all seven explicit states", () => {
    expect(deriveMasterMoldUiState({ status: "unavailable", sets: [], lastError: null })).toEqual({ kind: "idle" });
    expect(deriveMasterMoldUiState({ status: "generating", sets: [], lastError: null })).toEqual({ kind: "generating" });
    expect(deriveMasterMoldUiState({ status: "error", sets: [], lastError: "worker crashed" })).toEqual({ kind: "error", message: "worker crashed" });
    expect(deriveMasterMoldUiState({ status: "stale", sets: [], lastError: null })).toEqual({ kind: "stale" });
    const valid = [validSetEntry("a")];
    expect(deriveMasterMoldUiState({ status: "current", sets: valid, lastError: null })).toEqual({ kind: "success" });
    const partial = [validSetEntry("a"), blockedSetEntry("b", "undercut cannot release")];
    expect(deriveMasterMoldUiState({ status: "blocked", sets: partial, lastError: null })).toEqual({
      kind: "partial-success",
      validSetCount: 1,
      blockedSetCount: 1,
      blockedMessages: ["undercut cannot release"],
    });
    const blockedOnly = [blockedSetEntry("b", "undercut cannot release")];
    expect(deriveMasterMoldUiState({ status: "blocked", sets: blockedOnly, lastError: null })).toEqual({
      kind: "blocked",
      blockedMessages: ["undercut cannot release"],
    });
  });

  it("reports renderable geometry only from sets with real pieces", () => {
    expect(hasRenderableToolingGeometry([])).toBe(false);
    expect(hasRenderableToolingGeometry([blockedSetEntry("b", "no tooling")])).toBe(false);
    expect(hasRenderableToolingGeometry([validSetEntry("a")])).toBe(true);
  });
});

describe("MasterMoldPiecesBrowser gating (Execution 07 LOOP 08)", () => {
  it("does not render for a blocked-only result, even though sets exist", () => {
    act(() => {
      useMasterMoldStore.setState({ status: "blocked", sets: [blockedSetEntry("wm-1", "tooling could not be generated.")] });
    });
    render(<MasterMoldPiecesBrowser />);
    expect(screen.queryAllByLabelText("Master Mold pieces")).toHaveLength(0);
  });

  it("keeps valid pieces inspectable in a partial success, with blocked diagnostics", async () => {
    act(() => {
      useMasterMoldStore.setState({
        status: "blocked",
        sets: [validSetEntry("wm-1"), blockedSetEntry("wm-2", "undercut cannot release")],
      });
    });
    const { container } = render(<MasterMoldPiecesBrowser />);
    expect(screen.queryAllByLabelText("Master Mold pieces").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-master-mold-ui-state]")?.getAttribute("data-master-mold-ui-state")).toBe("partial-success");
    await userEvent.click(screen.getByRole("button", { name: "Master Mold pieces" }));
    expect(screen.getByText("undercut cannot release")).not.toBeNull();
  });

  it("does not render on a hard error even when prior sets exist", () => {
    act(() => {
      useMasterMoldStore.setState({ status: "error", lastError: "worker crashed", sets: [validSetEntry("wm-1")] });
    });
    render(<MasterMoldPiecesBrowser />);
    expect(screen.queryAllByLabelText("Master Mold pieces")).toHaveLength(0);
  });

  it("renders for a fully successful generation", () => {
    act(() => {
      useMasterMoldStore.setState({ status: "current", sets: [validSetEntry("wm-1")] });
    });
    const { container } = render(<MasterMoldPiecesBrowser />);
    expect(screen.queryAllByLabelText("Master Mold pieces").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-master-mold-ui-state]")?.getAttribute("data-master-mold-ui-state")).toBe("success");
  });
});
