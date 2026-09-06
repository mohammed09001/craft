import { PanelLeftClose, PanelLeftOpen, SquareDashedMousePointer } from "lucide-react";
import { NavLink } from "react-router-dom";

import { APP_ROUTES } from "@/app/router/routes";
import { NAVIGATION_ITEMS } from "@/app/router/navigation";
import { IconButton, Tooltip, VisuallyHidden } from "@/design-system/primitives";
import {
  useNavigationShellActions,
  useNavigationShellState,
} from "@/state/ui-shell";

import styles from "@/systems/navigation/NavigationZone.module.css";

type NavigationZoneProps = {
  onRouteSelected?: () => void;
};

const navigationIcons = {
  workspace: SquareDashedMousePointer,
};

export function NavigationZone({ onRouteSelected }: NavigationZoneProps) {
  const { isNavigationCollapsed, isMobileNavigationOpen } =
    useNavigationShellState();
  const { toggleNavigation } = useNavigationShellActions();

  return (
    <nav
      aria-label="Primary navigation"
      aria-hidden={!isMobileNavigationOpen ? undefined : false}
      className={styles.navigation}
      id="app-navigation"
    >
      <div className={styles.header}>
        <span className={styles.title}>
          {isNavigationCollapsed ? "Nav" : "Navigation"}
        </span>
        <IconButton
          aria-controls="app-navigation"
          aria-expanded={!isNavigationCollapsed}
          className={styles.collapseButton}
          label={
            isNavigationCollapsed ? "Expand navigation" : "Collapse navigation"
          }
          onClick={toggleNavigation}
        >
          {isNavigationCollapsed ? (
            <PanelLeftOpen aria-hidden="true" size={18} />
          ) : (
            <PanelLeftClose aria-hidden="true" size={18} />
          )}
        </IconButton>
      </div>

      <ul className={styles.list}>
        {NAVIGATION_ITEMS.map((item) => {
          const route = APP_ROUTES[item.routeId];
          const ItemIcon = navigationIcons[item.icon];
          const linkContent = (
            <>
              <ItemIcon aria-hidden="true" className={styles.itemIcon} size={18} />
              {isNavigationCollapsed ? (
                <VisuallyHidden>{item.label}</VisuallyHidden>
              ) : (
                <span className={styles.itemLabel}>{item.label}</span>
              )}
            </>
          );

          return (
            <li key={item.id}>
              {isNavigationCollapsed ? (
                <Tooltip text={item.label}>
                  <NavLink
                    aria-label={item.accessibleLabel}
                    className={({ isActive }) =>
                      isActive ? `${styles.link} ${styles.active}` : styles.link
                    }
                    onClick={onRouteSelected}
                    to={route.path}
                  >
                    {linkContent}
                  </NavLink>
                </Tooltip>
              ) : (
                <NavLink
                  aria-label={item.accessibleLabel}
                  className={({ isActive }) =>
                    isActive ? `${styles.link} ${styles.active}` : styles.link
                  }
                  onClick={onRouteSelected}
                  to={route.path}
                >
                  {linkContent}
                </NavLink>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
