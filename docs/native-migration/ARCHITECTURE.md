# Architecture

Layers (no upward dependencies, QML holds no engineering logic):

| Layer | Path | Depends on Qt |
|---|---|---|
| Contracts, tolerance, mesh analysis, grounding, view math, picking | `native/core` | no |
| File formats (STL) | `native/io` | no |
| Mold algorithms (reference block, Cut by Face, part solid, cavity) | `native/core/mold` | no |
| Kernel seam `IMeshGeometryEngine` + native Manifold 3.5.1 | `native/engines/mesh` | no |
| Python analysis bridge (QProcess, JSON lines) | `native/engines/analysis-bridge` | Core |
| Analysis kernels (the pull-direction candidate loop in C++, loaded by the Python worker through ctypes) | `native/engines/analysis-kernels` | Core |
| Engineering data -> Qt Quick 3D buffers, camera | `native/viewport` | Quick3D |
| Controller, scene model, jobs, paths, logging, QML | `native/app` | Quick3D |

Conventions kept from the reference: millimeters, Z-up, mold bottom at Z=0, reference tolerance
policy `geometry-adaptive-v2`, same error codes and messages where ported.

Heavy work runs on the thread pool (`JobRunner.h`) with cancellation tokens; results carry a
generation number and stale results are dropped. Renderer: Qt Quick 3D (see DECISIONS D-001).

## craft.analysis protocol v1
JSON Lines over the worker's stdin/stdout; no sockets. Worker -> host: `hello`, `progress`, `result`,
`error`. Host -> worker: `request {protocolVersion, jobId, command, params}`; commands `ping`,
`import_analysis {sourcePath, modelId, geometryVersion}`, `shutdown`. Results echo `modelId` and
`geometryVersion`; the host rejects results for a replaced model. Cancel and timeout kill the
worker; it restarts on the next job. Runtime resolution: `CRAFT_PYTHON`, bundled
`python/` + `analysis/`, then the development interpreter. The bundled runtime is packaged and verified on Windows (PACKAGING.md); on macOS it is not.
