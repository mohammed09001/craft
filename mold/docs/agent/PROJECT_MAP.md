# Project Map

Architectural navigation guide for coding agents working in this repository.
This is not a file index — it exists to answer "where do I start?" and "what
else does this touch?" before making a change. For per-task state, discover it
live from Git (`git branch --show-current`, `git rev-parse HEAD`,
`git status --short`) rather than trusting a committed snapshot — no committed
document should claim to be "the current" branch/HEAD/working-tree state, since
that claim goes stale the moment a new session or clone reads it. For operating
rules, see `AGENTS.md`.

## Repository Overview

The repository currently contains **two largely independent codebases**:

1. **`frontend/`** — a React/TypeScript/Vite single-page app that performs
   its own in-browser 3D geometry work (Three.js for rendering, the
   `manifold-3d` WASM library for boolean solid operations).
2. **`src/`** — a Python 3.13 core engine (`mold_generator_engine`) that runs
   a staged moldability-analysis pipeline, plus a smaller `engineering_analysis`
   and `engineering_reports` package.

**These are not runtime-connected yet.** The frontend's `engine-integration`
feature is a typed, contracts-only boundary for a *future* bridge — it
contains no subprocess call, HTTP call, or WebSocket client today. Treat
"frontend work" and "Python engine work" as separate domains unless a task
explicitly spans both.

## High-Level Architecture

```
frontend/src/
  app/            → shell, routing, providers (composition root)
  systems/        → layout regions (header, nav, context panel, status, workspace)
  features/       → viewport, mold-generation, engine-integration, engineering-reports
  state/          → cross-cutting UI-shell state
  design-system/  → tokens, primitives, global CSS
  contracts/      → shared app-level TypeScript contracts

src/
  mold_generator_engine/  → the Python analysis + generation pipeline
  engineering_analysis/   → session orchestration layer (dto/pipeline/tasks)
  engineering_reports/    → shared report contracts (Python side)
```

Within `frontend/src`, dependency flow is intended to be one-directional:
`app` → `systems` → `features` → (`state`, `design-system`, `contracts`).
Features expose a public surface through an `index.ts`; internals (e.g.
`viewport/runtime/*`) are not meant to be imported directly from outside the
feature.

## Frontend Domains

### `features/viewport`
- **Responsibility:** owns the interactive 3D surface — Three.js scene,
  camera, renderer, STL import/parsing, model grounding, selection,
  measurement, and the adaptive grid. Wraps all Three.js objects behind a
  lazy-loaded runtime so the rest of the app never imports Three.js directly.
- **Key directories:** `features/viewport/` (public store/contracts),
  `features/viewport/runtime/` (Three.js internals, not for outside import).
- **Entry points:** `Viewport.tsx`, `useViewportRuntime.ts`,
  `runtime/createThreeViewportRuntime.ts`; see `README.md` in this folder
  for the current STL-import scope and lifecycle contract.
- **Work here when:** changing rendering, camera behavior, model import/
  validation, selection/measurement, or grounding/orientation.
- **Interacts with:** `mold-generation` (renders its geometry results),
  `engine-integration` (surfaces analysis status), `systems/context-area`
  and `systems/status-area` (read viewport/model state).

### `features/mold-generation`
- **Responsibility:** the frontend's own client-side mold-generation
  pipeline, built on `manifold-3d` booleans and Three.js geometry. This is
  where the actual mold shape is derived from the imported model.
- **Key subdirectories, in rough pipeline order:**
  - `reference-mold-definition/` — defines the reference mold block and its
    orthogonal geometry/appearance.
  - `split-face/` — parting-face definition/removal tooling.
  - `cavity-generation/` — cavity boolean generation, distance-field/offset
    engine, signed-distance/BVH queries, tolerance policy. The largest and
    most geometry-heavy subdirectory.
  - `sprue-generation/` — sprue profile, neck, and placement geometry.
  - `registration/` — reconciles/derives the final mold registration from
    cavity + sprue results; produces the artifact `workflow` reports on.
  - `geometry/` — shared `manifold-3d` boolean wrapper.
  - `workflow/` — orchestrates the above into a single evaluation
    (`evaluateDerivedMold.ts`, `moldEvaluationCoordinator.ts`); defines the
    `MoldEvaluationStage` sequence (`base → cavity → sprues → registration →
    validation`).
- **Entry points:** `workflow/evaluateDerivedMold.ts` for the orchestrated
  flow; each subdirectory's `index.ts` for its public surface.
- **Work here when:** changing mold geometry logic, cavity/sprue/registration
  behavior, or the evaluation sequencing itself.
- **Interacts with:** `viewport` (source model, render target),
  `engineering-reports` (pull-direction evaluation feeds mold decisions).
- **Note:** `*.bak` files are gitignored scratch snapshots some editing
  sessions leave beside active files in this tree — never active code, never
  tracked, and not guaranteed to exist in any given checkout. Do not import
  them, and do not track new ones.

### `features/engine-integration`
- **Responsibility:** the *placeholder* boundary for future frontend↔Python
  communication. Defines typed command/job/artifact contracts and a status
  bridge, but currently performs no real engine execution.
- **Key entry points:** `engineIntegration.contracts.ts`,
  `chapter5EngineBridge.ts`, `analysisSession.*`, `draft-analysis/`
  (pull-direction/draft classification logic that runs client-side today).
- **Work here when:** adding a new typed capability boundary, or eventually
  wiring a real frontend↔Python call — read this feature's `README.md`
  first; it states explicit rules (no direct Python/backend calls from
  React components, all engine results are typed artifacts).
- **Interacts with:** `systems/status-area` (bridge-ready indicator),
  `engineering-reports` (draft-analysis feeds pull-direction reports).

### `features/engineering-reports`
- **Responsibility:** a registry of "engineering report" definitions shown
  to the user, plus the one implemented report (`pull-direction/`) with its
  own multi-stage evaluation pipeline (candidate generation, filtering,
  ranking, scoring, presentation).
- **Key entry points:** `reportRegistry.ts`, `defaultReportRegistry.ts`;
  `pull-direction/pullDirectionAnalysisEngine.ts` and
  `pull-direction/evaluation/pullDirectionEvaluationPipeline.ts`.
- **Work here when:** changing what reports exist, or the pull-direction
  scoring/evaluation logic specifically. See `pull-direction/README.md` and
  its `STAGE_5*_CLOSURE.md` notes for the report's own history.
- **Interacts with:** `engine-integration/draft-analysis` (data source),
  `systems/context-area` (renders report cards).

### `systems/*`
- **Responsibility:** fixed layout regions composed by `app/shell`:
  `global-header`, `navigation`, `context-area` (right-side inspector /
  report panel), `status-area` (bottom status line), `engineering-workspace`
  (composes viewport + surrounding systems for the main page).
- **Work here when:** changing layout chrome, what the context/status panels
  display, or how workspace regions are arranged. Business logic should stay
  in `features/`; systems mostly present feature state.

### `app/`, `contracts/`, `state/`, `design-system/`
- **Responsibility:** composition root (`app/shell`, `app/router`,
  `app/providers`), shared cross-feature TypeScript contracts
  (`contracts/*.contract.ts`), the one cross-cutting store
  (`state/ui-shell`), and visual tokens/primitives/global CSS
  (`design-system/`).
- **Work here when:** adding a route, changing app-wide providers/theme, or
  touching shared UI-shell state (active view, global status) rather than
  feature-local state.

## Core Engine Domains (Python, `src/mold_generator_engine`)

- **`pipeline/import_analysis`** — first stage; validates/analyzes an
  imported model. Entry: `service.py`, `builder.py`.
- **`pipeline/initial_moldability`** — early moldability screening. Entry:
  `analyzer.py`.
- **`pipeline/cavity_analysis`** — cavity detection/classification/
  accessibility/core-trapping/undercuts and the cavity decision. Entry:
  `service.py`; largest pipeline package.
- **`pipeline/detailed_mold_analysis`** — draft analysis, face analysis,
  pull-direction ranking, undercut assessment, final moldability decision.
  Entry: `service.py`.
- **`pipeline/generation_readiness`** — gate before generation. Entry:
  `service.py`.
- **`pipeline/mold_generation`** — parting strategy/surface, component
  planning, finalization. Entry: `service.py`.
- **Shared support:** `io/importers/` (STL/OBJ readers, model repair/
  validation, format registry), `geometry/` (mesh adjacency, topology,
  vector math, ray queries), `models/` (pipeline data models, one per
  stage), `config/` (tunable thresholds per stage), `exceptions.py`.
- **Work here when:** changing Python-side analysis/generation logic. Each
  stage is an isolated package with its own `service.py` — start there, not
  in `geometry/` or `io/`, unless the task is about a shared primitive.
- **Related docs:** `docs/import-analysis-report.md`,
  `docs/initial-model-moldability-assessment.md`,
  `docs/cavity-analysis-engine.md`,
  `docs/detailed-mold-analysis-engine.md`,
  `docs/model-processing-suitability.md`,
  `docs/mold-generation-engine.md`,
  `docs/model-import-api.md` / `docs/model-import-specification.md`,
  `docs/issue-severity-policy.md`.

### `src/engineering_analysis` and `src/engineering_reports`
- **Responsibility:** `engineering_analysis/session` provides session-level
  orchestration (dto, pipeline, task runners, mock runners) around the core
  pipeline; `engineering_reports` defines shared report contracts.
- **Uncertainty:** the naming mirrors the frontend's `analysisSession.*` and
  `engineering-reports` features, but no runtime call path between them was
  found. Treat as conceptually related, not confirmed-integrated, until
  verified for a specific task.

### `src/mold-generation` (removed — classified dead)
A hyphenated TypeScript directory (a coordinate-system builder and
reference-mold-sketch validator) previously lived here, inside the
otherwise-Python `src/` tree. A repository-hardening audit traced every
`tsconfig`, `package.json`, CI job, and Python packaging path and found it was
not compiled, imported, tested, or referenced by anything outside itself. It
was deleted (recoverable from Git history); do not recreate a TypeScript
source tree under Python `src/` without a build/test gate that actually
exercises it.

## Geometry Pipeline

Two separate geometry pipelines exist; do not assume they share logic:

- **Frontend (client-side, active in the running app):**
  `reference-mold-definition` → `split-face` → `cavity-generation` →
  `sprue-generation` → `registration`, orchestrated by
  `mold-generation/workflow`. Built on Three.js geometry + `manifold-3d`
  booleans + `three-mesh-bvh` for spatial queries.
- **Python core engine (batch/offline pipeline, not yet wired to the UI):**
  `import_analysis` → `initial_moldability` → `cavity_analysis` →
  `detailed_mold_analysis` → `generation_readiness` → `mold_generation`.

## Source-of-Truth Matrix

Which domain is authoritative for each current user-visible behavior — and
what logic must not be duplicated across domains. Both domains are real,
independently useful codebases; "not wired" below means no runtime call path
exists between them today, not that one is a stub.

| Capability | Current owner | Status |
|---|---|---|
| STL import/rendering | Frontend (`features/viewport`) | Active runtime |
| Interactive viewport (camera, selection, measurement) | Frontend (`features/viewport`) | Active runtime |
| Reference mold geometry | Frontend (`mold-generation/reference-mold-definition`) | Active runtime |
| Cut by Face | Frontend (`mold-generation/split-face`) | Active runtime |
| Cavity | Frontend (`mold-generation/cavity-generation`) | Active runtime |
| Sprue | Frontend (`mold-generation/sprue-generation`) | Active runtime |
| Registration | Frontend (`mold-generation/registration`) | Active runtime |
| Segmentation | Frontend (`mold-generation/segmentation`) | Active runtime |
| Moldability analysis | Python (`pipeline/initial_moldability`, `pipeline/cavity_analysis`) | Active offline/core engine, not wired to the UI |
| Pull-direction analysis | Both, independently: frontend `engineering-reports/pull-direction` (client-side, active in the running app) and Python `pipeline/detailed_mold_analysis` (offline). Not the same implementation — a fix in one does not apply to the other. | Two active, unconnected implementations |
| Generation-readiness | Python (`pipeline/generation_readiness`) | Active offline/core engine, not wired to the UI |
| Python mold-generation planning | Python (`pipeline/mold_generation`) | Active offline/core engine, not wired to the UI |
| Frontend engine-integration contracts | Frontend (`features/engine-integration`) | Contract-only boundary — typed command/job/artifact contracts and a status bridge; no subprocess/HTTP/WebSocket call exists |

**Where a future bridge would enter:** `features/engine-integration` is the
one place a frontend↔Python call would be added — its `README.md` already
states the rule (typed commands only, no direct Python calls from React
components). No HTTP server, WebSocket, subprocess bridge, or RPC protocol
exists today, and none should be added without that being its own scoped
architecture decision — not a side effect of an unrelated change.

## State Ownership

- **`state/ui-shell`** — the one app-wide store (active view/global status).
- **Feature-local Zustand stores** (each owned by its feature, not shared
  directly): `viewport/modelImport.store.ts`,
  `viewport/modelSelection.store.ts`, `viewport/modelMeasurement.store.ts`,
  `viewport/viewportTool.store.ts`, `engine-integration/analysisSession.store.ts`,
  `engine-integration/engineIntegration.store.ts`,
  `mold-generation/split-face/splitFace.store.ts`,
  `mold-generation/reference-mold-definition/moldAppearance.store.ts`,
  `mold-generation/registration/registrationLifecycle.ts`.
- **Rule of thumb:** if you need cross-feature state, check whether it
  belongs in `state/ui-shell` or should instead flow through a typed
  contract/bridge rather than a shared store.

## Runtime Ownership

- **Three.js runtime** (scene/camera/renderer/materials/geometry disposal)
  is owned exclusively by `features/viewport/runtime/`. No other code
  should touch Three.js objects directly — see the viewport `README.md`
  boundary rules.
- **`manifold-3d` boolean engine** is wrapped in
  `mold-generation/geometry/manifold.ts` and used by `cavity-generation` /
  `sprue-generation`; treat it as the single boolean-ops entry point.
- **Web workers:** cavity generation and derived-mold evaluation offload
  work via `cavityGeneration.worker.ts` /
  `derivedMoldEvaluation.worker.ts` with matching `*.workerClient.ts`
  wrappers — change the worker and its client together.

## Testing Layout

- **Frontend:** co-located `*.test.ts(x)` next to source files (Vitest +
  React Testing Library), plus per-feature `__tests__/` folders for
  integration-style tests (e.g. `viewport/__tests__`,
  `engine-integration/__tests__`). Test setup: `frontend/src/test/setup.ts`,
  `renderApp.tsx`.
- **Python:** `tests/unit/` mirrors `mold_generator_engine` modules
  one-to-one; `tests/integration/` exercises whole pipeline services
  end-to-end; `tests/engineering_analysis/` covers the session layer.
  `tests/fixtures/models/` holds shared model fixtures.
- **Convention:** when changing a pipeline stage or feature module, find its
  matching test file first — the naming convention (`<module>.test.ts` /
  `test_<module>.py`) makes this a direct lookup, not a search.

## Cross-Cutting Systems

- **`contracts/`** (frontend) — shared TypeScript contracts consumed across
  `app`/`systems`/`features`; distinct from feature-local `*.contracts.ts`
  files, which stay inside their owning feature.
- **`design-system/`** — tokens and primitives; changes here are
  visually global, so treat as higher-risk than a single feature.
- **`docs/issue-severity-policy.md`** — shared severity/issue classification
  policy referenced by multiple Python pipeline stages.
- **CI:** `.github/workflows/ci.yml` is the single workflow gating both
  frontend and Python changes.

## Recommended Navigation Paths

- **"The 3D view is doing something wrong"** → start in
  `features/viewport/runtime/`, check the matching `__tests__` file, read
  `features/viewport/README.md` for the intended lifecycle first.
- **"The generated mold geometry is wrong"** → identify which stage
  (reference block, split-face, cavity, sprue, or registration) and start
  in that `mold-generation/<stage>/` folder; trace forward/backward through
  `mold-generation/workflow/evaluateDerivedMold.ts` for how stages connect.
- **"A report/analysis value is wrong"** → check whether it's
  `engineering-reports/pull-direction` (frontend, client-side scoring) or a
  Python `pipeline/*` stage — they are separate implementations; do not
  assume a fix in one applies to the other.
- **"Need to change Python analysis behavior"** → go directly to the
  relevant `pipeline/<stage>/service.py`; check `config/` for tunable
  thresholds before changing logic; check the matching `docs/*.md` for the
  documented contract of that stage.
- **"Need to add a new engine-integration capability"** → read
  `engine-integration/README.md` fully first; it defines explicit rules
  (typed commands only, no direct Python calls from components) that
  constrain the implementation approach.
- **"Layout/chrome change, not feature logic"** → start in `systems/`, not
  in `features/`.
