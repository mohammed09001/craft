import { useSetViewportToolbarSlotElement } from "@/features/viewport";

// Stands in for the real slot GlobalHeader renders, for tests that mount a
// toolbar-portaling component (e.g. Viewport) without the real header --
// production always has a header, so this mirrors that invariant instead of
// making the component itself carry a headerless fallback path.
export function TestHeaderToolbarSlot() {
  const setToolbarSlotElement = useSetViewportToolbarSlotElement();
  return <div ref={setToolbarSlotElement} />;
}
