import { createContext, useContext } from "react";

export type ViewportToolbarSlotContextValue = {
  toolbarSlotElement: HTMLDivElement | null;
  setToolbarSlotElement: (element: HTMLDivElement | null) => void;
};

export const ViewportToolbarSlotContext =
  createContext<ViewportToolbarSlotContextValue | null>(null);

// Called by the header, which owns and renders the actual slot element.
export function useSetViewportToolbarSlotElement() {
  const context = useContext(ViewportToolbarSlotContext);

  if (context === null) {
    throw new Error("ViewportToolbarSlotProvider is required.");
  }

  return context.setToolbarSlotElement;
}

// Read by the viewport, which portals its toolbar into the slot once mounted.
export function useViewportToolbarSlotElement() {
  const context = useContext(ViewportToolbarSlotContext);

  if (context === null) {
    throw new Error("ViewportToolbarSlotProvider is required.");
  }

  return context.toolbarSlotElement;
}
