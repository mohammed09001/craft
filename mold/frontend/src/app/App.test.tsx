import { act, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";

import { App } from "@/app/App";
import { AppErrorBoundary } from "@/app/error-boundary";
import { UI_SHELL_STORAGE_KEY, useUiShellStore } from "@/state/ui-shell";
import { renderWithAppProviders } from "@/test/renderApp";

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{location.pathname}</div>;
}

function ThrowingComponent(): ReactElement {
  throw new Error("Test render failure");
}

describe("App shell", () => {
  it("renders the Stage 1 shell landmarks", () => {
    renderWithAppProviders(<App />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Engineering workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Application status" }),
    ).toBeInTheDocument();
  });

  it("redirects the root route to the workspace", async () => {
    renderWithAppProviders(
      <>
        <App />
        <LocationProbe />
      </>,
      { route: "/" },
    );

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/workspace");
    });
  });

  it("renders the workspace viewport foundation", () => {
    renderWithAppProviders(<App />, { route: "/workspace" });

    expect(
      screen.getByRole("region", {
        name: "Interactive 3D viewport",
      }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    expect(screen.getByText("No Model Loaded")).toBeInTheDocument();
  });

  it("renders not found for an unknown route", () => {
    renderWithAppProviders(<App />, { route: "/missing" });

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to workspace" }),
    ).toBeInTheDocument();
  });

  it("keeps the navigation usable when collapsed", async () => {
    const user = userEvent.setup();
    renderWithAppProviders(<App />);

    const collapseButton = screen.getByRole("button", {
      name: "Collapse navigation",
    });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");

    await user.click(collapseButton);

    const expandButton = screen.getByRole("button", {
      name: "Expand navigation",
    });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("link", { name: "Open engineering workspace" }),
    ).toBeInTheDocument();
  });

  it("toggles and persists the theme preference", async () => {
    const user = userEvent.setup();
    renderWithAppProviders(<App />);

    await user.click(
      screen.getByRole("button", { name: "Switch to light theme" }),
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });
    expect(localStorage.getItem(UI_SHELL_STORAGE_KEY)).toContain(
      '"themeMode":"light"',
    );
  });

  it("does not persist mobile drawer state", () => {
    renderWithAppProviders(<App />);

    act(() => {
      useUiShellStore.getState().openMobileNavigation();
    });

    const storedValue = localStorage.getItem(UI_SHELL_STORAGE_KEY);

    expect(storedValue).not.toContain("isMobileNavigationOpen");
  });

  it("marks the active navigation link", () => {
    renderWithAppProviders(<App />, { route: "/workspace" });

    expect(
      screen.getByRole("link", { name: "Open engineering workspace" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("provides accessible names for icon controls", () => {
    renderWithAppProviders(<App />);

    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse navigation" }),
    ).toBeInTheDocument();
  });

  it("renders an app-level error fallback", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    renderWithAppProviders(
      <AppErrorBoundary>
        <ThrowingComponent />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", {
        name: "The interface could not continue.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();

    consoleError.mockRestore();
  });
});

describe("UI shell store persistence", () => {
  it("partializes persisted shell preferences", () => {
    useUiShellStore.getState().openMobileNavigation();
    useUiShellStore.getState().setNavigationCollapsed(true);

    const storedValue = localStorage.getItem(UI_SHELL_STORAGE_KEY);

    expect(storedValue).toContain("isNavigationCollapsed");
    expect(storedValue).not.toContain("isMobileNavigationOpen");
  });
});
