import { Navigate, Route, Routes } from "react-router-dom";

import { AppErrorBoundary } from "@/app/error-boundary";
import { ROOT_ROUTE_PATH, APP_ROUTES } from "@/app/router/routes";
import { AppShell } from "@/app/shell/AppShell";
import { NotFoundPage } from "@/pages/not-found";
import { WorkspacePage } from "@/pages/workspace";

export function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={<Navigate replace to={APP_ROUTES.workspace.path} />}
          />
          <Route
            path={APP_ROUTES.workspace.path}
            element={<WorkspacePage />}
          />
          <Route path={APP_ROUTES.notFound.path} element={<NotFoundPage />} />
        </Route>
        <Route
          path={ROOT_ROUTE_PATH}
          element={<Navigate replace to={APP_ROUTES.workspace.path} />}
        />
      </Routes>
    </AppErrorBoundary>
  );
}
