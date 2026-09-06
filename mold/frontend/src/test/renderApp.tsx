import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

import { AppProviders } from "@/app/providers/AppProviders";
import { TestHeaderToolbarSlot } from "@/test/TestHeaderToolbarSlot";

type RenderAppOptions = {
  route?: string;
  withToolbarSlot?: boolean;
};

export function renderWithAppProviders(
  ui: ReactElement,
  { route = "/workspace", withToolbarSlot = false }: RenderAppOptions = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProviders>
        {withToolbarSlot && <TestHeaderToolbarSlot />}
        {ui}
      </AppProviders>
    </MemoryRouter>,
  );
}
