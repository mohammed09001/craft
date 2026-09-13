import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "@/app/App";
import { AppProviders } from "@/app/providers/AppProviders";

import "@/design-system/tokens/tokens.css";
import "@/design-system/foundations/global.css";

// Test-only: exposes the real app's store singletons for Playwright's
// real-workspace Master Mold E2E (see e2eWorkspaceStoreHooks.ts's doc
// comment). Only present in the explicit `e2e` build mode, never in a
// normal production build.
if (import.meta.env.MODE === "e2e") {
  void import("@/test-harness/e2eWorkspaceStoreHooks");
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
