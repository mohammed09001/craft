/**
 * Test-only bridge for the REAL `/workspace` app page (Master Mold
 * Execution 04, Article 08).
 *
 * The existing Master Mold/Cavity probes (masterMoldGenerationProbe.ts,
 * masterMoldRealisticWorkflowProbe.ts) run in the isolated e2e-harness.html
 * page and never touch the real app shell or its buttons at all -- they
 * prove the Worker/Boolean pipeline, not the real toolbar wiring.
 *
 * Real face selection is a WebGL-canvas raycast with no stable,
 * non-brittle Playwright-addressable DOM path (see those probes' own doc
 * comments) -- that part is unavoidably out of reach for a browser test.
 * Everything downstream of it is not: this hook exposes the same
 * `useSplitFaceStore`/`useModelBoundsStore` singletons the real app uses,
 * so a Playwright test can drive just the face-selection step through the
 * store (`enterSelection`/`toggleFace`/`createMoldParts`, using the real
 * imported model's own `groundedWorldBounds`) and then click the REAL
 * "Create Cavity" and "Master Mold" toolbar buttons for everything else --
 * proving the actual production React wiring (CavityAction/MasterMoldAction
 * handleClick, the real Worker, the real viewport) fires correctly end to
 * end in the real app, not a synthetic harness page.
 *
 * Attached only when `import.meta.env.MODE === "e2e"` (see main.tsx) --
 * verifyProductionArtifact.mjs's exclusion of e2e-only globals from a
 * normal `npm run build` still holds, since this module is never imported
 * outside that mode.
 */
import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import { useMasterMoldStore } from "@/features/mold-generation/master-mold/masterMold.store";
import { useModelBoundsStore } from "@/features/viewport/modelBounds.store";

declare global {
  interface Window {
    __e2eWorkspaceStores: {
      readonly useSplitFaceStore: typeof useSplitFaceStore;
      readonly useModelBoundsStore: typeof useModelBoundsStore;
      readonly useMasterMoldStore: typeof useMasterMoldStore;
    };
  }
}

window.__e2eWorkspaceStores = { useSplitFaceStore, useModelBoundsStore, useMasterMoldStore };
