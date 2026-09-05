import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { GlobalHeader, MOBILE_NAVIGATION_BUTTON_ID } from "@/systems/global-header";
import { NavigationZone } from "@/systems/navigation";
import {
  ENGINEERING_WORKSPACE_ID,
  EngineeringWorkspace,
} from "@/systems/engineering-workspace";
import { StatusArea } from "@/systems/status-area";
import { useNavigationShellActions, useNavigationShellState } from "@/state/ui-shell";
import { SkipLink } from "@/design-system/primitives";

import styles from "@/app/shell/AppShell.module.css";

function focusControl(controlId: string) {
  document.getElementById(controlId)?.focus();
}

export function AppShell() {
  const { isNavigationCollapsed, isMobileNavigationOpen } =
    useNavigationShellState();
  const { closeMobileNavigation } = useNavigationShellActions();

  useEffect(() => {
    if (!isMobileNavigationOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      closeMobileNavigation();
      focusControl(MOBILE_NAVIGATION_BUTTON_ID);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMobileNavigation, isMobileNavigationOpen]);

  const shellClasses = [
    styles.shell,
    isNavigationCollapsed ? styles.navigationCollapsed : "",
  ]
    .filter(Boolean)
    .join(" ");

  const navigationDrawerClasses = [
    styles.navigationRegion,
    isMobileNavigationOpen ? styles.mobileRegionOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  const closeNavigationDrawer = () => {
    closeMobileNavigation();
    focusControl(MOBILE_NAVIGATION_BUTTON_ID);
  };

  return (
    <div className={shellClasses}>
      <SkipLink targetId={ENGINEERING_WORKSPACE_ID}>
        Skip to engineering workspace
      </SkipLink>
      <div className={styles.headerRegion}>
        <GlobalHeader />
      </div>
      <div className={navigationDrawerClasses}>
        <NavigationZone onRouteSelected={closeNavigationDrawer} />
      </div>
      <EngineeringWorkspace>
        <Outlet />
      </EngineeringWorkspace>
      <div className={styles.statusRegion}>
        <StatusArea />
      </div>

      {isMobileNavigationOpen && (
        <button
          aria-label="Close navigation"
          className={styles.backdrop}
          onClick={closeNavigationDrawer}
          type="button"
        />
      )}
    </div>
  );
}
