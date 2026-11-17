# Decisions

- D-001 Renderer: Qt Quick 3D with custom geometry from `MeshGeometryAdapter`. No custom Dawn/Metal/Vulkan renderer; no measurements yet that would justify one.
- D-002 Toolchain baseline: Qt 6.8.3 msvc2022_64, MSVC 14.44 (VS 2022 Build Tools 17.14), CMake 4.4.3, Ninja, C++20, Manifold v3.5.1 (commit cc8a7f6; same release as the reference's manifold-3d 3.5.1), Python 3.13.17 for the worker.
- D-003 Manifold built without TBB and CrossSection (single-threaded like the WASM reference; no Clipper2).
- D-004 Native STL size cap is 512 MiB (reference 25 MiB, a browser limit).
- D-005 Geometry-version tokens hash bounds as float64 rather than JSON text; stable on native, not string-equal to reference tokens.
- D-006 (superseded in session 3) Positive cavity clearance is now ported; the only intentional deviation is that a cavity-outer-breakthrough blocker is reported with the reference's observable code `cavity_boolean_failed`.
- D-009 Level-set SDF evaluation is single-threaded (Manifold built without TBB); cancellation is polled every 4096 SDF evaluations by throwing from the callback.
- D-007 Analysis cancel/timeout kills the worker process; it restarts lazily.
- D-008 QML lives in `native/app/ui` (qmlcache cannot handle `../` paths).
