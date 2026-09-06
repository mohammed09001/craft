import { createViewportLightingRig } from "@/features/viewport/runtime/viewportLightingRig";

/**
 * Creates a balanced CAD-style lighting setup.
 * Delegates to the documented 5-point viewportLightingRig.
 */
export function createLighting() {
  const rig = createViewportLightingRig();
  return rig.object;
}
