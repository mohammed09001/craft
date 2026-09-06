import type { AppRoute } from "@/contracts/route.contract";

export const APP_ROUTES = {
  workspace: {
    id: "workspace",
    path: "/workspace",
    label: "Engineering Workspace",
    navigationLabel: "Workspace",
    accessibleLabel: "Open engineering workspace",
  },
  notFound: {
    id: "notFound",
    path: "*",
    label: "Page not found",
    accessibleLabel: "Page not found",
  },
} as const satisfies Record<string, AppRoute>;

export const ROOT_ROUTE_PATH = "/";
