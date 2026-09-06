import type { ReactNode } from "react";

import { ThemeProvider } from "@/app/providers/ThemeProvider";
import { ViewportCommandProvider } from "@/features/viewport/ViewportCommandProvider";
import { ViewportToolbarSlotProvider } from "@/features/viewport/ViewportToolbarSlotProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <ViewportCommandProvider>
        <ViewportToolbarSlotProvider>{children}</ViewportToolbarSlotProvider>
      </ViewportCommandProvider>
    </ThemeProvider>
  );
}
