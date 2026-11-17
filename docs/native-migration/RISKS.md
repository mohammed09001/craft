# Risks

- macOS: no build or test has ever run; Qt Quick 3D rendering, packaging, signing and notarization are unverified.
- Viewport: no visual/performance comparison with the Three.js viewport; frame rate and VRAM unmeasured; large-STL behaviour untested.
- Bundled Python runtime and installer are not built; the app finds Python only via CRAFT_PYTHON or the dev interpreter.
- Windows MSVC and Windows SDK live on C: (pre-existing) / D:; no new C: footprint was added by this work.
- Pre-existing frontend failure: `scripts/checkBundleBudget.test.mjs` does not load on Windows (shebang parse error).
- Two analysis implementations (TS pull-direction vs Python) remain unreconciled.
- Manifold GitHub fetch happens at configure time; offline builds need a pre-populated `FETCHCONTENT_BASE_DIR`.
- Distance-field cavity offset: 8.6 s at 129k triangles and 12.8 s at 489k (1 mm clearance, Release, 8 cores). The banded distance shortcut relies on the offset surface being sampled at lattice spacing h and band = clearance + 4h; it is verified against the reference on 7 cases, not proven for every geometry. Dense lattice cache costs about 16 bytes per grid cell (up to ~200 MB at the 12M-cell budget). Not compared with the WASM timing.

- R-Master-1 Master Mold results are only faithful for parts whose one-piece tooling releases; parts needing the multi-piece/localized-core planner, curved parting tools or the multi-label fallback will diverge from the reference (the engine says so via unportedPathsReached). Do not expose Master Mold in the UI as parity-complete.
- R-Master-2 Kernel triangulation can differ between the native and WASM builds for pin faces (D-029); anything keyed on triangle indices (sampled accessibility, mesh hashes) can move slightly.
