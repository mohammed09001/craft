import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MoldAppearanceToggle } from "./MoldAppearanceToggle";
import { useMoldAppearanceStore } from "./moldAppearance.store";

describe("MoldAppearanceToggle", () => {
  beforeEach(() => {
    useMoldAppearanceStore.getState().reset();
  });

  it("does not render before the mold appearance control is available", () => {
    render(<MoldAppearanceToggle visible={false} />);

    expect(
      screen.queryByRole("button", {
        name: "Enable glass mold appearance",
      }),
    ).not.toBeInTheDocument();
  });

  it("renders as an icon-only accessibility-labelled button", () => {
    render(<MoldAppearanceToggle visible />);

    const button = screen.getByRole("button", {
      name: "Enable glass mold appearance",
    });

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("data-mold-appearance", "solid");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button).not.toHaveTextContent("Glass");
  });

  it("toggles between solid and glass mold appearance", () => {
    render(<MoldAppearanceToggle visible />);

    const enableButton = screen.getByRole("button", {
      name: "Enable glass mold appearance",
    });

    fireEvent.click(enableButton);

    expect(useMoldAppearanceStore.getState().mode).toBe("glass");

    const disableButton = screen.getByRole("button", {
      name: "Disable glass mold appearance",
    });

    expect(disableButton).toHaveAttribute("aria-pressed", "true");
    expect(disableButton).toHaveAttribute(
      "data-mold-appearance",
      "glass",
    );

    fireEvent.click(disableButton);

    expect(useMoldAppearanceStore.getState().mode).toBe("solid");
  });
});
