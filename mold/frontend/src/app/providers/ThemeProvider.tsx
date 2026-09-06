import { useInsertionEffect, type ReactNode } from "react";

import { useThemeMode } from "@/state/ui-shell";

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeMode = useThemeMode();

  useInsertionEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return children;
}
