import type { AppRouteId } from "@/contracts/route.contract";

export type NavigationItemId = "workspace";
export type NavigationIconName = "workspace";

export type NavigationItem = {
  id: NavigationItemId;
  label: string;
  routeId: AppRouteId;
  icon: NavigationIconName;
  accessibleLabel: string;
};
