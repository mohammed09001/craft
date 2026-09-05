import { useShallow } from "zustand/react/shallow";

import { useUiShellStore } from "@/state/ui-shell/ui-shell.store";

export const useThemeMode = () =>
  useUiShellStore((state) => state.themeMode);

export const useThemeActions = () =>
  useUiShellStore(
    useShallow((state) => ({
      setThemeMode: state.setThemeMode,
      toggleTheme: state.toggleTheme,
    })),
  );

export const useNavigationShellState = () =>
  useUiShellStore(
    useShallow((state) => ({
      isNavigationCollapsed: state.isNavigationCollapsed,
      isMobileNavigationOpen: state.isMobileNavigationOpen,
    })),
  );

export const useNavigationShellActions = () =>
  useUiShellStore(
    useShallow((state) => ({
      toggleNavigation: state.toggleNavigation,
      setNavigationCollapsed: state.setNavigationCollapsed,
      openMobileNavigation: state.openMobileNavigation,
      closeMobileNavigation: state.closeMobileNavigation,
    })),
  );

export const useViewportStatus = () =>
  useUiShellStore((state) => state.viewportStatus);

export const useViewportStatusActions = () =>
  useUiShellStore(
    useShallow((state) => ({
      setViewportStatus: state.setViewportStatus,
    })),
  );
