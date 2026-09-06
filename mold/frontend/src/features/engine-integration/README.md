# Engine Integration Boundary

This feature defines the frontend-side boundary for engine integration.

It was originally created in Chapter 7 as a contracts-only boundary. In Chapter 8
Stage 1, the first visible bridge was added between the frontend and the existing
Chapter 5 import-analysis engine area.

## Purpose

The goal of this boundary is to let the interactive workspace communicate with
engine capabilities without placing engine logic directly inside React components,
the viewport runtime, or UI systems.

## Current Chapter 8 Stage 1 Scope

Implemented now:

- A Chapter 5 import-analysis bridge status.
- A stable command id for the Chapter 5 import-analysis capability.
- A visible Status Area item showing that the Chapter 5 bridge is ready.
- No Python execution from React.
- No backend process call.
- No mold generation execution.
- No viewport result rendering.
- No plugin architecture.

Current visible status:

```text
Engine: Chapter 5 Bridge Ready
```

## Rules

- React components must not call Python, backend processes, WebSocket clients,
  workers, or engine implementations directly.
- Viewport runtime must not know how an engine computes results.
- Engine commands enter through typed command requests.
- Engine progress is represented as serializable job status.
- Engine outputs are represented as typed artifacts.
- Viewport rendering of engine results must happen through future adapters or
  result layers, not by placing engine logic inside UI components.
- Visual redesign must not require rewriting STL import, selection, measurement,
  grounding, orientation, or camera runtime code.
- Future engine work must remain removable by deleting its bridge, adapter,
  store, context action, viewport result layer, tests, and documentation.

## Current Files

- `engineIntegration.contracts.ts`
  - Shared frontend contracts for future engine commands, jobs, and artifacts.

- `chapter5EngineBridge.ts`
  - Chapter 8 Stage 1 bridge marker for the existing Chapter 5 import-analysis
    capability.

- `index.ts`
  - Public exports for the engine integration boundary.

## Current Flow

```text
Chapter 5 import-analysis capability
↓
chapter5EngineBridge
↓
engine-integration public exports
↓
Status Area
↓
Visible bridge-ready state
```

## Future Flow

```text
UI action
↓
typed command request
↓
engine integration adapter
↓
job status / result store
↓
context panel / result panels
↓
viewport result layer
```

## Not Implemented Yet

The following are intentionally not implemented in Stage 1:

- Running Python from the frontend.
- Sending STL files to the engine.
- Import-analysis execution from UI.
- Real engine job lifecycle.
- Engine progress tracking.
- Engine report display.
- Mold generation.
- Draft analysis.
- Undercut analysis.
- Parting analysis.
- Repair computation.
- Viewport overlays from engine results.

## Chapter 8 Final Acceptance

Chapter 8 closes the first safe frontend-to-engine integration layer. It does not execute the engine from the browser. It documents a UI-only bridge that lets the Context Panel expose the currently available Chapter 5 import-analysis capability as a safe preview surface.

### Chapter 8 Scope

- Keep the core engine independent from React and viewport runtime code.
- Surface engine-integration state through typed frontend contracts.
- Add an Engine Integration section to the Context Panel.
- Add Import Analysis Preview only when a ready STL model is present.
- Bind the preview to the current ready model id and source file name.
- Clear stale preview state when the ready model changes.

### Completed UI Integration

- The Context Panel this was originally built against has since been removed
  from the application (see git history for the header restructuring). Import
  Analysis currently has **no UI trigger**
  -- the command, store, and adapter layers below remain intact and are
  exercised directly by the tests in `Regression Coverage`, but a user
  cannot currently reach this bridge from the app itself.
- When re-exposed in a future UI, the preview action should disable while a
  preview job is running and display safe serialized metadata from frontend
  contracts, per `Safe Bridge Guarantees` below.

### Safe Bridge Guarantees

- Preview generation is frontend-only and deterministic.
- No STL file bytes are transferred to an engine service.
- No Python code is executed by React.
- No backend, worker, queue, API, plugin runtime, or viewport runtime path is introduced.
- Existing STL import, selection, measurement, grounding, orientation, camera, and viewport behavior remain outside this bridge.

### Explicit Non-Goals

Chapter 8 intentionally does not implement:

- Real import-analysis execution from the UI.
- Python process execution.
- Backend engine calls.
- STL upload or transfer to an engine service.
- API, WebSocket, worker, queue, or plugin runtime.
- Mold generation, repair computation, draft analysis, undercut analysis, parting analysis, or viewport overlays.

### Regression Coverage

Acceptance is covered by the focused frontend tests for:

- engineIntegration.store
- engineIntegration.contracts

Targeted validation command:

npm run test:run -- engineIntegration

Chapter 8 closure also requires npm run lint and npm run build to pass.

### Current User-Facing Result

None currently -- Import Analysis has no UI trigger (see `Completed UI Integration` above). The underlying command/store/adapter layer is still safe, mocked, and UI-only, and confirms the frontend is prepared to display engine-related state without yet executing the engine, once a UI surface exposes it again.

### Next Chapter Boundary

Chapter 9 may start converting the safe bridge into a real integration path. That work must remain behind typed contracts and must not bypass the boundary defined here. Any real execution path must be added deliberately in a later chapter with its own tests, safety checks, and acceptance document updates.

