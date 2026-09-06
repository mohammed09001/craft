import type { NavigationItem } from "@/contracts/navigation.contract";

export const NAVIGATION_ITEMS = [
  {
    id: "workspace",
    label: "Workspace",
    routeId: "workspace",
    icon: "workspace",
    accessibleLabel: "Open engineering workspace",
  },
] as const satisfies readonly NavigationItem[];
