# Cavity-Registration Failure Decoupling Architectural Design

## 1. Exact Runtime Rollback Path
In `splitFace.store.ts` (`createCavity`, `createSprue`, `removeSprue`), the store calls `isRegistrationAcceptedForCommit(before, finalResult)` on the derived mold result returned by `runDerivedMoldEvaluation`.
When `before.registration.status === "generated"` (e.g. from prior split-parts creation) and registration fails or is blocked on the cavity interface (`derived.registration.status !== "generated"`), `isRegistrationAcceptedForCommit` returns `false`.
As a result:
- `createCavity` aborts the commit.
- `cavity.status` is set to `"blocked"`, cavity result is not stored, and `cavity.result` remains null or uncommitted.
- `lastCommittedResult` is not updated.
- `evaluation.phase` is marked `"failed"` with the registration reason code and message.
- A red blocking error message ("No registration layout — not even a single locator fits...") is set on the UI toolbar.
- The visible mold rolls back to the pre-cavity state, effectively hiding/discarding the successfully generated cavity bodies.

## 2. Current Core vs. Optional Stage Coupling
Currently, `splitFace.store.ts` and `isRegistrationAcceptedForCommit` treat registration as a mandatory requirement if registration keys were previously present.
Under the required architecture:
- **Required Core Stages**: Base Mold Bodies $\to$ Split Mold Bodies $\to$ Cavity Generation $\to$ Sprue Generation $\to$ Core Topology & Manifold Validation.
- **Optional Derived Stage**: Edge-Mounted Linear Alignment Registration.

Registration failure MUST NOT rollback, delete, hide, or invalidate a valid cavity or sprue result.

## 3. Canonical Body Ownership
- **Upstream Canonical Bodies**: `baseBodies` $\to$ `cavityResult.bodies` $\to$ `sprueBodies`.
- **Derived Registration Bodies**: `registration.bodies`.
Registration generation is transactional: it clones upstream bodies, builds male/female CSG tools, applies unions/subtractions, and returns derived bodies. If registration succeeds (`status: "ready"`), derived bodies become the active bodies. If registration is `"unavailable"` or `"failed"`, upstream canonical bodies (`sprueBodies` or `cavityResult.bodies`) remain the active bodies, completely untouched.

## 4. Current Atomic Commit Boundary
Currently, cavity + sprues + registration are treated as a single all-or-nothing transaction in `createCavity` / `createSprue`. Failure in registration rejects the entire cavity/sprue commit.

## 5. Proposed Commit Boundaries
- **Core Mold Transaction**: Base mold, split faces, cavity generation, sprue generation, and manifold validation commit atomically. If cavity generation succeeds, `cavity.result` and `sprueBodies` ARE COMMITTED to store.
- **Optional Registration Transaction**: Begins after upstream mold bodies exist. If registration succeeds, `registration.status = "ready"` and `registration.bodies` are attached. If registration is unavailable or fails, `registration.status = "unavailable"` (or `"failed"`), diagnostics/reasons are recorded, and upstream bodies are committed as the final active bodies.

## 6. Final Result Contract
`FinalMoldResult` schema:
```typescript
export interface FinalMoldResult {
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
  readonly requestId: string;
  readonly bodies: readonly MoldBodyData[];
  readonly keyed: boolean;
  readonly stages: {
    readonly baseBodies: readonly MoldBodyData[];
    readonly cavityResult: CavityToolData | null;
    readonly sprueBodies: readonly MoldBodyData[];
    readonly resolvedSprues: readonly SprueDefinition[];
    readonly registration: DerivedRegistrationState;
  };
  readonly warnings: readonly string[];
}
```
Invariants:
- `coreValid === true` when cavity/sprue generation succeeds, REGARDLESS of `registration.status`.
- `keyed === true` ONLY when `registration.status === "ready"` (or `"generated"`).
- `bodies` equals `registration.bodies` when `keyed === true`, else `sprueBodies` (or `cavityResult.bodies`).

## 7. Registration Status Model
Registration status contract:
```typescript
export type DerivedRegistrationStatus = "ready" | "unavailable" | "failed" | "generating" | "idle";
```
- `"ready"` (or legacy `"generated"`): Registration keys generated successfully; derived keyed bodies become active.
- `"unavailable"` (or `"blocked"`): Interface geometries or wall thickness constraints prevent safe registration key placement. Core mold remains valid and usable without keys.
- `"failed"`: Computational CSG or validation exception during key creation. Discard partial registration bodies, retain upstream bodies, record diagnostic.

## 8. Active-Body Selector Priority
`selectActiveMoldBodies(state)` order of precedence:
1. `lastCommittedResult.bodies` (which resolves to `registration.bodies` if `keyed === true`, else `sprueBodies` / `cavityResult.bodies`).
2. `cavity.result.bodies` (if `lastCommittedResult` is null but cavity is complete).
3. `definition.moldBodies` (base split bodies).

Registration failure NEVER returns null or empty bodies when a valid cavity exists.

## 9. Export Fallback Behavior
Export selectors (`selectExportableMoldBodies`):
- `registration.status === "ready"` $\implies$ export registered bodies.
- `registration.status === "unavailable"` or `"failed"` $\implies$ export cavity/sprue bodies.
- Core cavity invalid $\implies$ block export.

## 10. UI Severity Mapping
- `registration.status === "unavailable"` $\implies$ NON-BLOCKING WARNING. Text: *"Linear alignment could not be generated for this interface. The cavity remains valid."*
- Cavity generation error $\implies$ BLOCKING ERROR banner.

## 11. Revision / Stale-Result Handling
Before committing registration:
- Verify `sourceRevision` and `sourceFingerprint` match the active document.
- If stale, discard registration result, retain upstream bodies, allow re-evaluation.

## 12. Rollback Behavior
- Internal registration CSG failure discards temporary registration solids, preserves upstream canonical bodies (`sprueBodies` / `cavityResult.bodies`), and records structured reason codes.

## 13. Exception Boundary
Catch unexpected exceptions inside `generateDerivedRegistration` / `RegistrationGenerationService`:
- Catch errors, wrap into `status: "failed"`, populate `reasonCode` (`INTERNAL_REGISTRATION_ERROR` or `BOOLEAN_OPERATION_FAILED`), return `bodies: null` or upstream bodies.

## 14. Regression Test Matrix
A. Core Regression: Cavity succeeds + registration unavailable $\implies$ cavity committed & visible.
B. Successful Registration: Cavity succeeds + registration succeeds $\implies$ keyed bodies active.
C. Selectors: Priority order verified (ready $\to$ cavity/sprue $\to$ base).
D. Export: Export succeeds with cavity bodies when registration is unavailable.
E. Lifecycle: Cavity rebuild, sprue add/move/remove survive registration unavailability; Undo/Redo preserves correct stage state.
F. UI: Non-blocking warning displayed; "single locator" obsolete text removed.
G. Determinism: Stable output across repeated evaluations.

## 15. Migration Risks
Low risk: `isRegistrationAcceptedForCommit` is updated to allow commits when cavity succeeds, updating `lastCommittedResult` with `keyed: false` and upstream `sprueBodies` when registration is unavailable.

## 16. Proof That Cavity Validity No Longer Depends on Registration
`createCavity` commits `cavity.result` and `lastCommittedResult` whenever `cavity` generation succeeds and `canCommitMoldEvaluation` passes. `isRegistrationAcceptedForCommit` returns `true` whenever cavity generation is valid, allowing the cavity to be committed regardless of registration outcome.
