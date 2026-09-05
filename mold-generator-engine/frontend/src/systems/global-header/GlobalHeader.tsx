import { Menu, Moon, Sun } from "lucide-react";

import { IconButton } from "@/design-system/primitives";
import { useSetViewportToolbarSlotElement } from "@/features/viewport";
import {
  useNavigationShellActions,
  useNavigationShellState,
  useThemeActions,
  useThemeMode,
} from "@/state/ui-shell";
import { HeaderImportButton } from "@/systems/global-header/HeaderImportButton";

import styles from "@/systems/global-header/GlobalHeader.module.css";

export const MOBILE_NAVIGATION_BUTTON_ID = "open-mobile-navigation";

export function GlobalHeader() {
  const themeMode = useThemeMode();
  const { toggleTheme } = useThemeActions();
  const { openMobileNavigation } = useNavigationShellActions();
  const { isMobileNavigationOpen } = useNavigationShellState();
  const setToolbarSlotElement = useSetViewportToolbarSlotElement();
  const nextThemeLabel =
    themeMode === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <header className={styles.header}>
      <div className={styles.brandGroup}>
        <IconButton
          aria-controls="app-navigation"
          aria-expanded={isMobileNavigationOpen}
          className={styles.mobileControl}
          id={MOBILE_NAVIGATION_BUTTON_ID}
          label="Open navigation"
          onClick={openMobileNavigation}
        >
          <Menu aria-hidden="true" size={18} />
        </IconButton>
        <div className={styles.brandMark} aria-hidden="true">
          MC
        </div>
        <div className={styles.brandText}>
          <span className={styles.productName}>Mold Craft</span>
          <span className={styles.workspaceName}>Engineering Workspace</span>
        </div>
      </div>

      <div className={styles.toolbarGroup}>
        <HeaderImportButton />
        <div className={styles.toolbarSlot} ref={setToolbarSlotElement} />
      </div>

      <div className={styles.controls}>
        <IconButton label={nextThemeLabel} onClick={toggleTheme}>
          {themeMode === "dark" ? (
            <Sun aria-hidden="true" size={18} />
          ) : (
            <Moon aria-hidden="true" size={18} />
          )}
        </IconButton>
      </div>
    </header>
  );
}
