# Viewport System

The viewport system owns the interactive 3D surface inside the engineering
workspace. It uses direct Three.js behind a lazy-loaded runtime so the app shell,
navigation, context area, and status area do not import Three.js.

## Public Boundary

The public contract exports only viewport lifecycle status, model import status,
palette, runtime options, and runtime control types. Three.js objects, renderer,
scene, camera, controls, geometry, materials, bounds, and file buffers remain
inside `features/viewport/runtime`.

## Local STL Import

Stage 3 and Stage 4 support local STL loading only. Files are read in the
browser from a file picker or drag/drop inside the viewport. They are not
uploaded to a backend, API, WebSocket, cloud store, or asset manager.

Only `.stl` is supported. STEP, STP, OBJ, GLTF, GLB, FBX, 3MF, PLY, IGES,
assemblies, multiple models, repair, export, and mold generation remain outside
the local import scope.

## Model Lifecycle And Inspection

Model state is serializable Zustand state only: phase, file name, file size,
human-readable file size, format, triangle count, geometry vertex count, and
user-safe messages. The lifecycle is `no-model`, `validating`, `loading`,
`ready`, `invalid`, and `error`. `ready` is emitted only after file reading
succeeds, STL parsing succeeds, geometry validates, inspection data is computed,
grounding and adaptive grid sizing are prepared, the mesh and grid are committed
to the scene, camera fit runs, and a render is requested.

The Context Panel model summary is intentionally lightweight. It reports STL format,
file size, triangle count from `position.count / 3`, and geometry vertex count.
It does not compute unique vertices, dimensions, bounding-box UI, volume,
surface area, topology, repair, selection, picking, or CAD metadata.

Viewport status remains separate: `initializing`, `ready`, `unsupported`,
`error`, and `context-lost`. Viewport `ready` is emitted only after the first
successful runtime render.

## Validation And Size Policy

The UI accepts exactly one `.stl` file. Empty files and files larger than
25 MiB are rejected before parsing. MIME type varies by browser and is not used
as the sole source of truth. Read errors, parse errors, missing vertices, empty
geometry, invalid bounding boxes, non-finite coordinates, and non-displayable
zero-size geometry produce safe user-facing messages.

## Parsing Strategy

The runtime uses the official Three.js `STLLoader` that ships with the installed
Three.js version. Parsing runs on the main thread because the browser file-size
limit is small and this stage avoids adding a worker framework, generic loader
registry, or plugin architecture.

STL generally does not contain reliable unit metadata. The viewport does not
apply unit detection or conversion.

## Replacement And Disposal

The runtime keeps one imported model under an explicit Imported Model Root.
Replacement is atomic: the existing model and grid stay in the scene until the
new STL has been read, parsed, validated, measured for inspection, grounded,
matched with an adaptive grid, and converted into a mesh. After success, the old
model geometry and materials are disposed, the old grid is disposed, the new mesh
and grid are installed, camera fit runs, and demand rendering is invalidated.

If replacement fails while a valid model is already ready, the existing model
and its inspection state remain ready. The replacement error is stored and shown
separately so Fit View and Reset View continue to work on the current model.

Each load has a request id. Stale reads are ignored so older results cannot
replace newer selections. Pending reads are aborted on unmount, and model
geometry/materials are disposed without touching lights, renderer, camera, or
controls.

## Model Grounding And Adaptive Grid

Stage 9 uses Z-up coordinates with the ground plane on XY at `z = 0`. Imported
STL geometry is not centered by mutating vertices. Instead, the Imported Model
Root receives a display/runtime translation that centers the source bounds on X
and Y and places the source minimum Z on the ground plane. The runtime does not
rotate, scale, repair, or rewrite the source geometry.

The engineering grid is sized once per successful model load from the grounded
model footprint. Minor spacing follows a `1/2/5 x 10^n` sequence and major
spacing is five minor steps. Theme changes update existing grid material colors
without recalculating grid size. Failed replacement preserves the current model,
grounding transform, and grid.

The Stage 2 visual fixture has been removed from the production runtime. Empty
model state is DOM UI over the grid, not fallback Three.js geometry.

## Whole-Model Selection

Stage 5 treats the currently loaded STL as one selectable engineering object.
Selection state in Zustand is serializable only: whether the current model is
selected, the logical model id, and short accessibility announcements. Three.js
objects, raycasters, DOM nodes, materials, and intersection data stay inside the
viewport runtime.

Picking uses one runtime `Raycaster` and one reusable `Vector2` for normalized
device coordinates. Pointer coordinates come from `canvas.getBoundingClientRect()`
and CSS client coordinates; they are not multiplied by device pixel ratio. The
runtime raycasts only against the current imported model target, not the whole
scene.

Pointer gestures use a 4 CSS pixel click-versus-drag threshold. A primary
left-button pointer up below that threshold selects the model if it is hit, or
clears selection if empty space is hit. Rotate and pan drags do not select on
release, and right or middle buttons do not select. `Escape` clears selection
unless focus is inside editable controls or modal/dialog content.

Hover performs throttled raycasting only for cursor feedback. It does not create
hover materials and does not request a render for cursor-only changes.

The selection highlight is owned by the selection runtime. It clones the current
mesh material for selected presentation, restores the original material on clear
or replacement, and disposes only the owned selection clones. Geometry is never
mutated for selection.

Successful STL replacement clears the old selection and starts the new model
unselected. Failed replacement keeps the current model and any current
selection. Runtime disposal removes pointer and keyboard listeners, cancels any
pending hover animation frame, clears hover cursor state, restores materials,
and disposes owned highlight materials.

Stage 5 intentionally does not include face, edge, vertex, triangle, box, lasso,
multi-selection, selection filters, model tree, transform gizmos, metadata
editing, or geometry repair.

## Point-To-Point Distance Measurement

Stage 6 adds one active tool beyond the default `select` mode:
`measure-distance`. The active tool state is intentionally a small union, not a
tool registry or plugin system. In `select`, whole-model selection keeps the
Stage 5 behavior. In `measure-distance`, valid primary clicks on the current STL
surface set measurement points instead of selecting or clearing the model.

The measurement workflow stores only serializable state in Zustand: active tool,
phase, first point, second point, distance, labels, and short announcements.
Three.js raycasters, vectors, intersections, marker meshes, line geometry,
materials, scene nodes, camera, canvas, and controls remain inside the viewport
runtime. Measurement points are stored as model-local coordinates so Fit View,
Reset View, camera movement, resize, collapse, and expand do not require
distance recalculation.

The first valid surface click creates the first marker and waits for the second
point. The second valid surface click creates the second marker, a line between
the points, and a Euclidean straight-line distance. The UI labels the unit as
`Model Units` because STL files do not provide reliable unit metadata. A new
valid surface click while the measurement is complete starts a replacement
measurement; only one measurement exists at a time.

The measurement tool reuses the Stage 5 click-versus-drag threshold and pointer
normalization helpers. Drags, rotate/pan gestures, empty clicks, right and
middle buttons and file drag/drop do not create points.
`Escape` cancels an unfinished draft and keeps the tool active; from the
first-point state or from a completed measurement it returns to `select` while
leaving a completed measurement visible. `Clear Measurement` removes points,
distance, markers, and line without changing the active tool or selection.

Measurement markers and line are owned by the measurement runtime. Their
geometry and materials are disposed by clear, replacement cleanup, and runtime
disposal. The measurement subsystem does not mutate model geometry or model
material and does not dispose model resources. Successful STL replacement clears
the current measurement; failed replacement preserves the current model and
measurement.

Stage 6 intentionally does not include angle, area, volume, radius, diameter,
wall thickness, snapping, editable points, multiple measurements, measurement
history, unit conversion, model tree, or backend persistence.

## Fit View And Reset View

After a successful STL load, the runtime computes bounding volumes, centers the
model horizontally, places its minimum Z on the grid plane, updates the existing
OrbitControls target, adjusts perspective camera distance and near/far planes,
updates the projection matrix, and requests a render. The runtime does not
create a new renderer, scene, camera, controls, or canvas during camera fit.

Fit View reuses the current camera view direction when refitting the ready
model. Reset View uses the same camera and controls but restores a fixed Z-up
three-quarter inspection direction. Both actions are disabled until a model is
ready and both use demand-render invalidation.

## Demand Rendering And Theme Integration

Rendering remains demand-driven. Palette changes mutate the existing renderer
clear color and engineering grid materials, then invalidate one render. Theme
changes do not recreate the renderer, scene, camera, controls, canvas, loaded
model, or adaptive grid size, and do not trigger camera fit.

## Verification

Run the frontend checks from `frontend/`:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Visual verification should confirm empty state, no fixture geometry, no viewport
metadata card, import and drag/drop, Context Panel model summary, grounded model
placement, adaptive grid sizing, Fit View, Reset View, replacement,
replacement-error preservation, whole-model selection, empty-click clear, Escape
clear, hover cursor feedback, selected context/status, Measure Distance,
measurement markers and line, Model Units distance HUD, dark/light themes,
rotate/pan/zoom, resize/collapse/expand, and exactly one canvas.

## Chapter 7 – Stage 10: User-Triggered Automatic Model Orientation

Stage 10 adds a user-triggered `Orient Model` command inside the Context Panel only.

Behavior:
- STL import and replacement keep the source file orientation.
- Orientation never runs automatically during import or replacement.
- `Orient Model` evaluates a fixed deterministic set of axis-aligned 90-degree candidate rotations.
- The selected rotation is applied to the Imported Model Root/display root only.
- Source geometry vertices are not mutated.
- Model scale, metadata, units, normals, and STL data are not changed.
- After orientation, the model is grounded back to the XY ground plane at `z = 0`.
- The model is recentered on X/Y.
- Adaptive Grid is recalculated from the oriented model footprint.
- Fit View and Reset View operate on the oriented world bounds.
- Repeated `Orient Model` activation is idempotent and does not accumulate relative rotation.
- Failed orientation preparation keeps the current model transform, grid, camera, selection, and measurement state unchanged.

Measurement behavior:
- Distance measurement points are stored in model-local coordinates.
- Measurement overlay is attached to the current model target.
- Therefore successful orientation preserves existing measurement overlays instead of clearing them.

Out of scope:
- No automatic import orientation.
- No arbitrary-angle optimization.
- No physics simulation.
- No Center of Mass.
- No moldability, parting, undercut, draft, or STL repair analysis.
- No manual rotation controls or transform gizmo.

## Chapter 7 – Stage 11: Engine Integration Readiness And Frontend Evolution Contract

Stage 11 closes the frontend foundation without connecting a real engine.

Rules:
- New engine features must enter through an engine integration boundary.
- React components must not call engine implementations directly.
- Viewport runtime must not know how engines compute their results.
- Context Panel actions remain command-driven rather than ad-hoc DOM forwarding.
- Engine outputs should be represented as serializable job statuses, result contracts, and future viewport result layers.
- Visual redesign should happen in layout, CSS modules, theme tokens, and UI composition without rewriting import, selection, measurement, grounding, orientation, or camera runtimes.
- Future features must be removable through clear boundaries: contract, adapter, store, context action, viewport layer, tests, and documentation.

Chapter 8 should connect the currently available engine first through this boundary. Later engines should reuse the same integration path instead of creating direct one-off links into React components or viewport runtime.
