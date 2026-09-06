import { type ReactNode, useMemo, useState } from "react";

import { ViewportToolbarSlotContext } from "@/features/viewport/viewportToolbarSlotContext";

type ViewportToolbarSlotProviderProps = {
  children: ReactNode;
};

export function ViewportToolbarSlotProvider({
  children,
}: ViewportToolbarSlotProviderProps) {
  const [toolbarSlotElement, setToolbarSlotElement] =
    useState<HTMLDivElement | null>(null);

  const value = useMemo(
    () => ({ toolbarSlotElement, setToolbarSlotElement }),
    [toolbarSlotElement],
  );

  return (
    <ViewportToolbarSlotContext.Provider value={value}>
      {children}
    </ViewportToolbarSlotContext.Provider>
  );
}
