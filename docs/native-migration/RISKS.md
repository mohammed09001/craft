# Risks

- macOS: no build or test has ever run; Qt Quick 3D rendering, packaging, signing and notarization are unverified.
- Viewport: no visual/performance comparison with the Three.js viewport; frame rate and VRAM unmeasured; large-STL behaviour untested.
- Bundled Python runtime and installer are not built; the app finds Python only via CRAFT_PYTHON or the dev interpreter.
- Windows MSVC and Windows SDK live on C: (pre-existing) / D:; no new C: footprint was added by this work.
- Pre-existing frontend failure: `scripts/checkBundleBudget.test.mjs` does not load on Windows (shebang parse error).
- Two analysis implementations (TS pull-direction vs Python) remain unreconciled.
- Manifold GitHub fetch happens at configure time; offline builds need a pre-populated `FETCHCONTENT_BASE_DIR`.
- Distance-field cavity offset (parts over 50k triangles, multi-component parts, extreme aspect ratios) is single-threaded here: about 146 s at 129k triangles and 268 s at 489k (1 mm clearance, Release). Not compared with the WASM timing. It is cancellable but slow; parallel SDF evaluation is the obvious fix.
