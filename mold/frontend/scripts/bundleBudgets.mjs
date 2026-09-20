// Craft Execution 07, Path B: explicit project-specific bundle budgets.
//
// The remaining >500 kB chunk (`three.module`) was investigated and
// confirmed to be pure third-party vendor code (three.js core, no app code
// mixed in -- see the Execution 07 final report), already isolated behind
// the genuine dynamic-import boundary that loads the viewport runtime.
// Splitting it further would require either brittle deep imports into
// Three's undocumented internals or duplicating the Three runtime across
// chunks, both forbidden. So instead of loosening Vite's generic
// chunkSizeWarningLimit with no independent gate, these budgets become the
// real regression contract, enforced by scripts/checkBundleBudget.mjs.
//
// Baseline at the observed starting SHA (87585c2):
//   eager `app` entry       ~384.49 kB minified
//   largest lazy/shared JS  ~546.71 kB minified (three.module, pure vendor)
//
// Budgets allow a small (~6%) regression margin over that baseline --
// enough to absorb routine dependency bumps without masking a real
// regression such as an accidental static import dragging Three (or
// another heavy dependency) back into the eager path.
//
// Re-baselined at SHA 94d4020 (Execution 08's 28-loop Master Mold effort):
// the eager app entry reached ~410.71 kB of real, verified planning/search
// logic (region graphs, adjacency welding, beam/finalist diversity, etc.),
// fully consuming the original 410 kB budget's margin -- first caught by
// running the real CI build for the first time in this session (the push
// had been network-blocked until now). 415 kB restores a comparable small
// margin over this new observed baseline, not an open-ended increase.
export const EAGER_APP_BUDGET_KB = 415;
export const LAZY_SHARED_BUDGET_KB = 575;

export const EAGER_APP_BUDGET_BYTES = EAGER_APP_BUDGET_KB * 1000;
export const LAZY_SHARED_BUDGET_BYTES = LAZY_SHARED_BUDGET_KB * 1000;
