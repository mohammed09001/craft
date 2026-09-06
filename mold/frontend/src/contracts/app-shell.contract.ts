import type { ThemeMode } from "@/contracts/theme.contract";

export type ShellRegion =
  | "global-header"
  | "navigation"
  | "engineering-workspace"
  | "status-area";

export type ShellLayoutPreferences = {
  themeMode: ThemeMode;
  isNavigationCollapsed: boolean;
};

export type ShellVisibilityState = ShellLayoutPreferences & {
  isMobileNavigationOpen: boolean;
};
