import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

import { AppProviders } from "@/app/providers/AppProviders";
import { useSetViewportToolbarSlotElement } from "@/features/viewport";

type RenderAppOptions = {
  route?: string;
  withToolbarSlot?: boolean;
};

// Stands in for the real slot GlobalHeader renders, for tests that mount a
// toolbar-portaling component (e.g. Viewport) without the real header --
// production always has a header, so this mirrors that invariant instead of
// making the component itself carry a headerless fallback path.
function TestHeaderToolbarSlot() {
  const setToolbarSlotElement = useSetViewportToolbarSlotElement();
  return <div ref={setToolbarSlotElement} />;
}

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
