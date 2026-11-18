# Risks

- macOS: no build or test has ever run; Qt Quick 3D rendering, packaging, signing and notarization are unverified.
- Viewport: no visual/performance comparison with the Three.js viewport; frame rate and VRAM unmeasured; large-STL behaviour untested.
- Bundled Python runtime and installer are not built; the app finds Python only via CRAFT_PYTHON or the dev interpreter.
- Windows MSVC and Windows SDK live on C: (pre-existing) / D:; no new C: footprint was added by this work.
- Pre-existing frontend failure: `scripts/checkBundleBudget.test.mjs` does not load on Windows (shebang parse error).
- Two analysis implementations (TS pull-direction vs Python) remain unreconciled.
- Manifold GitHub fetch happens at configure time; offline builds need a pre-populated `FETCHCONTENT_BASE_DIR`.
- Distance-field cavity offset: 8.6 s at 129k triangles and 12.8 s at 489k (1 mm clearance, Release, 8 cores). The banded distance shortcut relies on the offset surface being sampled at lattice spacing h and band = clearance + 4h; it is verified against the reference on 7 cases, not proven for every geometry. Dense lattice cache costs about 16 bytes per grid cell (up to ~200 MB at the 12M-cell budget). Not compared with the WASM timing.

- R-Master-1 Master Mold now follows every reference path the engine can reach (planar, height-field retry, grid and multi-label fallbacks, one-piece, localized core, multi-panel). Residual risk: the reference multi-label construction never succeeded on any fixture, so its success path is unverified against the reference (only failures match, with exact error text); the volumetric constructor mode is unported (engine never reaches it). Do not expose Master Mold in the UI as parity-complete until real-part coverage grows.
- R-Reports-1 The Python detailed mold analysis is pure Python and slow on large parts: 20 faces take milliseconds but a closed 10,800-face box took 561 s. The native job has a 20-minute timeout and can be cancelled, but real STLs with tens of thousands of faces will exceed that. Needs an engine-side performance fix (or a native reimplementation) before this is usable on production parts; not a bridge problem.
- R-Reports-2 The report registry marks Pull Direction "Coming Soon" (the reference data) while the same panel now shows a real Python result for it; the labels are the reference's and have not been reconciled.
- R-Reports-3 Not visually verified: the new Inspector section loads and binds (app_smoke, app workflow tests) but its layout was not inspected on screen.
- R-Master-2 Kernel triangulation can differ between the native and WASM builds for pin faces (D-029); anything keyed on triangle indices (sampled accessibility, mesh hashes) can move slightly.
