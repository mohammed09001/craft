export type AppRouteId = "workspace" | "notFound";

export type AppRoute = {
  id: AppRouteId;
  path: string;
  label: string;
  navigationLabel?: string;
  accessibleLabel: string;
};
