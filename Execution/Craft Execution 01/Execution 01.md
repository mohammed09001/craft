# Craft — Execution 01
## Segmentation Consolidation + Derived-State Integrity Repair

**Repository authority:** `mohammed09001/craft`  
**Reference branch used to construct this execution:** `main`  
**Execution philosophy:** evidence-first, dependency-aware, delete/simplify before adding, preserve engineering invariants across interconnected systems.

---

## 0. Mission

Perform a repository-grounded repair/refactor of Craft's Constructed Cutting Plan and Segmentation system.

This execution has **two primary objectives**:

1. **Remove the entire “More Molds” capability and collapse the product to one Segmentation workflow only.**
   - Keep the behavior that currently belongs to **One Mold**.
   - Rename that surviving capability to simply **Segmentation**.
   - Do not retain “One Mold” wording because there is no longer another Segmentation mode to contrast it with.
   - Remove More Molds Automatic and More Molds Manual end-to-end, not only from the UI.
   - Remove obsolete mode/draft/provenance/reopen/routing/test infrastructure that exists only because More Molds existed.

2. **Repair stale derived-state invalidation in Cut by Face / Eraser topology edits.**
   - A topology-changing edit must never leave previously committed mold bodies, Sprue presentation, Cavity, Registration, body visibility, or other geometry-derived state pretending to still belong to the new topology.
   - In particular, deleting the final split plane after a committed Cut by Face mold must not leave `lastCommittedResult` as the viewport's effective geometry source.

Craft is an engineering program made of interconnected systems. A local green test is not sufficient evidence of correctness. Every change must be evaluated against upstream authority, downstream consumers, asynchronous lifecycle ownership, rendering selectors, history, stale-result guards, printer-fit logic, Cavity, Registration, Sprue, Mold Scale, and viewport interaction.

---

# 1. Repository Is the Source of Truth

Before editing:

- Inspect the current checked-out repository.
- Do not rely on external roadmap documents, prior chat summaries, or assumptions.
- Do not assume this execution's starting file list is exhaustive.
- Use repository search/grep to build the real dependency graph first.
- Record the current branch and `git status --short`.
- Do not switch branches, commit, push, merge, or rewrite history unless explicitly instructed by the user outside this execution.
- Do not modify generated/vendor/dependency artifacts.

Use the current repository state as authoritative even if filenames or APIs have changed since this prompt was written.

---

# 2. Current Repository Evidence That Motivates This Execution

The repository currently models three cutting-session tabs:

- `cutByFace`
- `oneMold`
- `moreMolds`

The More Molds branch owns additional infrastructure including, but not limited to:

- Automatic and Manual draft stores.
- Separate worker runners.
- More Molds strategy switching.
- More Molds commit provenance.
- More Molds reopen validation.
- Viewport routing for Manual draft ownership.
- Automatic More Molds Scale regeneration.
- More Molds printer-dimension gating.
- More Molds-specific strategy scoring and logical-section behavior.
- UI controls and tests for Automatic/Manual More Molds.

The surviving One Mold Segmentation path already contains important engineering behavior that must be preserved:

- printer-volume-aware planning;
- authoritative source snapshots and freshness checks;
- deterministic planning identity;
- General Segmentation execution;
- extension-axis ownership;
- draggable user extension boundaries;
- printer-fit / degenerate-geometry / protected-region validation after extension movement;
- acceptance gating;
- worker execution and stale-result commit guards;
- Segmentation-specific mold clearance policy;
- Segmentation Registration sizing policy;
- committed result promotion into the singleton Split Face store;
- topology-preserving Mold Scale regeneration.

The Split Face store also has a confirmed stale-state risk: `selectActiveMoldBodies` prefers `lastCommittedResult?.bodies` over `definition?.moldBodies`, while several topology-editing paths can set `definition` to `null` without necessarily invalidating all committed/derived state. Sprue presentation can also be reconstructed from `sprueDefinitions` even when resolved Sprue geometry is absent.

Treat these as dependency-integrity problems, not visual-only bugs.

---

# 3. Non-Negotiable Product Contract After Execution 01

After this execution, Constructed Cutting Plan has exactly:

1. **Cut by Face**
2. **Segmentation**

There is no:

- More Molds
- Automatic More Molds
- Manual More Molds
- “Segmentation as One Mold”
- “make-as-more-molds”
- user-visible “One Mold” mode
- Automatic/Manual More Molds strategy switch
- More Molds draft ownership
- More Molds reopen provenance

The surviving Segmentation behavior is the current **One Mold behavior**, renamed and simplified.

Do not silently import More Molds behavior into Segmentation.

Specifically, preserve the current surviving behavior where Segmentation is driven by printer-fit requirements rather than More-Molds-only logical sectioning. Do not enable section-driven splitting merely because the More Molds path is being removed.

---

# 4. Architecture Simplification Requirement

Do not implement this as a compatibility shell that merely hides More Molds.

This is a deletion/simplification task.

Prefer:

- removing unreachable states;
- removing dead branches;
- removing dead stores;
- removing dead runners;
- removing dead exports;
- removing obsolete types;
- renaming surviving “One Mold” concepts to neutral “Segmentation” concepts;
- reusing existing authoritative stores and validators.

Avoid:

- feature flags for deleted More Molds behavior;
- aliases that keep old naming alive indefinitely;
- duplicate Segmentation stores;
- new wrapper layers whose only purpose is to preserve old APIs;
- comments describing deleted product modes;
- dormant code paths “for future use”;
- adding production code when deleting or simplifying existing code is sufficient.

If an old public/internal type is now a single-choice abstraction, simplify it.

Examples of expected semantic direction:

- `CuttingSessionTab` should represent `cutByFace | segmentation`, not three modes.
- `OneMoldCommitProvenance` should become a neutral Segmentation provenance concept if that provenance is still required.
- `lastOneMoldProvenance` should become neutral Segmentation provenance state.
- `oneMold` active-tab naming should disappear from active production semantics.
- `useAutomaticDraftStore` and `useManualDraftStore` should disappear if their only purpose is More Molds.
- `MoreMolds*` contracts should disappear.
- `switchToAutomatic` / `switchToManual` should disappear.
- More-Molds-specific reopen validation should disappear.
- More-Molds-specific worker ownership should disappear.
- More-Molds-specific Scale regeneration should disappear.
- More-Molds-specific strategy weights / logical-section policy should disappear if no remaining caller needs them.

For Segmentation domain APIs:

- Prefer eliminating `SegmentationMode` / mode-resolution indirection entirely if there is only one behavior.
- If a serialized/internal schema genuinely requires a discriminator, reduce it to one neutral value such as `segmentation` and explain why the field remains.
- Do not preserve `make-as-one-mold` merely as historical naming unless a concrete repository compatibility contract requires it.
- Do not preserve `make-as-more-molds`.

Do not perform a broad unrelated architecture rewrite.

---

# 5. Behavior Freeze: Preserve the Surviving Segmentation Engine

Before refactoring implementation, add or strengthen characterization tests for the current surviving One Mold behavior under its new product contract.

The renamed Segmentation must still preserve:

### Planning
- Invalid/missing printer volume blocks planning truthfully.
- Printer dimensions can be entered after the workflow is opened and planning retries correctly.
- A fitting mold returns the existing truthful “not required” behavior unless the current product flow intentionally handles that state differently.
- An oversized mold is segmented only on required printer-fit axes.
- Multi-axis segmentation remains deterministic.

### Extension axis
- Algorithm-owned axes remain locked.
- A user may add only an unused axis.
- The suggested initial extension coordinate remains authoritative only as the initial suggestion.
- Once dragged, the user's coordinate becomes authoritative.
- Invalid moved coordinates are retained visually/statefully but make the effective plan invalid.
- Degenerate splits, printer-fit failures, and hard protected-region conflicts block acceptance/Done.
- Removing an extension returns to the unextended base plan without mutating the algorithm-authored core plan.

### Execution / freshness
- Accepted plans execute real geometry.
- Stale source/printer changes invalidate or reject stale work.
- A superseded worker result cannot overwrite newer state.
- Committed bodies remain the single downstream geometry source expected by Cavity / Registration / Sprue.

### Mold Scale
- Segmentation-promoted molds still regenerate after a completed Mold Scale gesture.
- The existing topology-preservation contract from the surviving One Mold path remains intact.
- Extension boundaries are replayed only if still valid.
- Failed replan/topology mismatch falls back truthfully rather than pretending success.
- Cavity remains blocked while Segmentation regeneration is genuinely in flight.

### Registration
- Preserve the existing Segmentation-specific Registration policy and lineage behavior.
- Do not redesign Registration in Execution 01.

### Clearance
- Preserve the current automatic Segmentation mold-clearance policy and its current limits unless a failing invariant proves the values themselves are defective.
- Do not retune mold clearance as part of this execution.

---

# 6. Remove More Molds End-to-End

Build an impact map first, then remove More Molds from the leaves inward.

At minimum inspect every reference to terms/concepts such as:

- `moreMolds`
- `MoreMolds`
- `more-molds`
- `make-as-more-molds`
- `automaticDraft`
- `manualDraft`
- `useAutomaticDraftStore`
- `useManualDraftStore`
- `MoreMoldsCommitProvenance`
- `MoreMoldsDraftKind`
- `MoreMoldsReopenBlockedReason`
- `switchToAutomatic`
- `switchToManual`
- `isManualMoreMoldsInteractionOwner`
- Automatic More Molds Scale regeneration
- More Molds tests and fixtures
- Automatic/Manual UI icons that become unused
- More-Molds-only logical sectioning or objective scoring
- More-Molds-only comments/docs

Also inspect all `oneMold`, `OneMold`, and `make-as-one-mold` references.

Classify each occurrence before editing:

- REMOVE — More-Molds-only behavior.
- RENAME — surviving Segmentation behavior carrying obsolete One Mold naming.
- PRESERVE — generic Segmentation behavior unrelated to the deleted mode.
- MIGRATE — schema/provenance behavior that must survive under neutral Segmentation naming.
- INVESTIGATE — unclear dependency; trace callers before touching it.

Do not use global blind search-and-replace.

After the refactor, perform a semantic grep. Active production code must not retain deleted More Molds concepts. Surviving product/UI semantics must not expose One Mold naming.

---

# 7. Simplify Cutting Workflow Ownership

The cutting workflow should become easier to reason about after deletion.

Target conceptual state:

```text
idle
  |
  +-- sessionOpen
        |
        +-- Cut by Face
        |
        +-- Segmentation
```

There should be no nested Automatic/Manual draft owner under Segmentation.

Preserve the useful existing session guarantees:

- opening the session captures what Cancel needs;
- changing tabs does not corrupt committed geometry;
- Cancel restores the pre-session singleton state;
- Done commits only valid active-tab work;
- committing closes the session only after successful promotion;
- viewport tools do not mutate hidden/inactive cutting state;
- pointer/eraser/cutting-plane routing always has one authoritative owner;
- stale asynchronous work is cancelled or rejected.

Simplify interaction-owner logic accordingly.

Do not replace a clear two-owner model with another generalized abstraction unless it is genuinely smaller than the current implementation.

---

# 8. Segmentation UI Rename

In the Constructed Cutting Plan UI:

- Keep Cut by Face.
- Replace “Segmentation as One Mold” with **“Segmentation”**.
- Remove the entire “Segmentation as More Molds” tab.
- Remove Automatic/Manual controls.
- Keep the current Segmentation Axis Extension controls.
- Keep Done and Cancel behavior.
- Keep the printer-dimensions prompt only where the surviving Segmentation workflow needs it.
- Keep accessibility labels accurate and product-neutral.
- Do not redesign the visual system in this execution.

If an icon currently named `OneMoldIcon` is still the correct glyph, reuse the glyph but rename the component to a neutral Segmentation name if that component is now semantically product-facing.

Delete unused More-Molds-only icons only after repository-wide usage confirmation.

---

# 9. Derived-State Invalidation Contract

This is the repair portion of Execution 01.

## Core invariant

Whenever an edit changes or removes the authoritative Cut by Face topology, no derived artifact from the previous topology may remain active unless it is explicitly preserved as an input and revalidated/rebuilt against the new topology.

Audit topology-invalidating paths including, but not limited to:

- toggling a split face after parts were committed;
- removing a split face;
- removing the selected split face and rebuilding;
- removing the final split face;
- clearing selection;
- committing a non-extension cutting-plane drag;
- any equivalent edit path discovered during repository search.

For each path, inspect the dependency set:

- `definition`
- `lastCommittedResult`
- `cavity`
- `registration`
- resolved `sprues`
- `sprueDefinitions`
- `document`
- `evaluation`
- `bodyVisibility`
- active plane/selection state
- worker lifecycle
- any selector that can still render old bodies or old manufacturing features

Do not mechanically clear everything.

Instead classify each field:

1. authoritative input;
2. derived output;
3. reusable user intent that can survive only through rebuild/revalidation;
4. transient UI state.

Then enforce the dependency contract atomically.

### Mandatory confirmed case

After a committed Cut by Face result exists:

1. erase/remove the final cutting plane;
2. `definition` becomes absent;
3. no stale `lastCommittedResult` may remain as the active body source;
4. `selectActiveMoldBodies` must not return bodies from the deleted topology;
5. no stale Sprue presentation may remain attached to the removed topology;
6. Cavity and Registration must be unavailable/stale as appropriate;
7. stale body-visibility entries must not control future unrelated body ids;
8. the document/evaluation state must truthfully describe the new no-parts/editing condition.

Add a regression test that fails before the repair and passes after it.

Also add coverage for at least one non-final topology edit from an already-committed mold, because the same invalidation defect may exist outside the final-plane Eraser branch.

---

# 10. Sprue Dependency Rule

`sprueDefinitions` are not automatically safe merely because resolved `sprues` were cleared.

Audit how Sprue presentation is selected/rendered and how old definitions are reused during mold rebuild.

If a cutting-topology edit invalidates the body ids, anchors, cavity relation, or target geometry required by an existing Sprue definition, then that definition must not remain active as if still valid.

Choose one truthful behavior based on existing architecture:

- clear invalid Sprue intent; or
- explicitly preserve it as user intent but mark it unavailable and force full revalidation/rebuild before rendering/commit.

Do not leave stale Sprue definitions visible because the presentation selector can reconstruct a display from definition data alone.

Do not redesign Sprue UX in this execution.

---

# 11. No Accidental Registration or Cavity Rewrite

Registration and Cavity are downstream systems.

Execution 01 may update their call sites/types only as necessary to remove More Molds naming or repair stale dependency invalidation.

Do not:

- change Registration profile sizing;
- change Registration placement policy;
- retune Cavity clearance;
- change boolean geometry algorithms;
- replace worker architecture;
- change manufacturing geometry semantics unrelated to deleted More Molds state.

Their existing behavior is a regression surface, not a redesign target.

---

# 12. Loop Engineering

Use the following execution loops. Do not jump directly to implementation.

## Loop A — Evidence / Dependency Map

1. Confirm branch and working tree.
2. Search all More Molds and One Mold references.
3. Trace imports/exports/callers.
4. Trace Viewport ownership.
5. Trace commit/reopen/scale/provenance paths.
6. Trace `lastCommittedResult` and Sprue presentation consumers.
7. Produce a short internal impact map before editing.

Exit only when every major deletion has known upstream/downstream owners.

## Loop B — Characterization Harness

Before destructive refactor:

1. Add/strengthen tests that freeze surviving Segmentation behavior.
2. Add failing tests for stale Cut by Face derived-state invalidation.
3. Run those tests and confirm they detect the intended pre-fix defect where applicable.

Do not write tests that merely mirror implementation details.

Test product invariants and state transitions.

## Loop C — More Molds Deletion

Delete from outermost/leaf dependencies inward:

1. UI controls.
2. Viewport Manual/Automatic routing.
3. session-state branches.
4. More Molds draft stores and worker runners.
5. More Molds provenance/reopen logic.
6. Scale-regeneration More Molds branch.
7. More Molds strategy/domain contracts.
8. dead exports/imports/tests/comments.

After each coherent slice:

- run TypeScript typecheck;
- run the closest targeted tests;
- inspect the diff before continuing.

Do not accumulate a giant unverified patch.

## Loop D — Neutral Segmentation Rename

Rename surviving One Mold semantics to Segmentation.

Do not rename generic uses of the word “mold” where it describes actual mold geometry.

After rename:

- compile;
- run Segmentation tests;
- grep for stale One Mold product-mode terms.

## Loop E — Derived-State Integrity Repair

Implement the smallest coherent invalidation mechanism that makes topology changes atomic and truthful.

Prefer consolidating duplicated invalidation logic only if doing so reduces state divergence.

Do not create a second shadow state machine.

Run Cut by Face + Eraser + Viewport selector tests after each change.

## Loop F — Cross-System Regression

Run focused suites covering:

- cutting workflow;
- segmentation;
- split-face;
- viewport;
- cavity;
- registration;
- sprue;
- mold scale;
- model replacement/orientation if touched.

Then run complete repository frontend verification.

## Loop G — Dead-Code / Semantic Sweep

Search again for forbidden/deleted concepts.

No active production reference should survive simply because tests happened to pass.

## Loop H — Final Diff Audit

Review every changed file and ask:

- Was this file required by the dependency graph?
- Did we accidentally change a downstream engineering contract?
- Did we add code where deletion was enough?
- Did we leave compatibility scaffolding for a feature that no longer exists?
- Is every new test proving a real invariant?
- Does state ownership remain singular and obvious?
- Can a stale worker/result still reappear after the new transitions?

Only then declare the execution complete.

---

# 13. Harness / Verification Commands

Use the repository's actual package manager/lockfile evidence.

For the current frontend package, the known scripts are:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:run
```

Also run targeted Vitest files during each loop rather than waiting for the full suite.

At minimum include targeted coverage for the currently relevant files/systems, adapting names if the refactor renames them:

```text
cutting-workflow
segmentation
split-face
Viewport
mold scale
registration
sprue
cavity
```

Also run:

```bash
git diff --check
git status --short
git diff --stat
```

Before completion, inspect the final diff itself, not only command exit codes.

If the repository already has unrelated baseline failures:

- reproduce them before attributing them to this execution;
- distinguish pre-existing failures from regressions introduced here;
- do not hide them;
- do not fix unrelated failures unless they block verification of this execution.

---

# 14. Semantic Grep Acceptance Gate

Before completion, search active source and tests for at least:

```text
moreMolds
MoreMolds
more-molds
make-as-more-molds
Automatic More Molds
Manual More Molds
useAutomaticDraftStore
useManualDraftStore
lastMoreMoldsProvenance
switchToAutomatic
switchToManual
isManualMoreMoldsInteractionOwner
Segmentation as More Molds
Segmentation as One Mold
make-as-one-mold
oneMold
OneMold
```

Expected result:

- More Molds concepts: zero active production references.
- One Mold product-mode naming: zero active production references.
- Any surviving occurrence must have a concrete, documented compatibility reason and must not be user-visible or keep dead runtime branches alive.

Prefer removing the compatibility reason instead of preserving it if the product has no persistence/backward-compatibility requirement.

---

# 15. Acceptance Criteria

Execution 01 is complete only if all of the following are true.

## Product
- Constructed Cutting Plan exposes only Cut by Face and Segmentation.
- No More Molds UI or behavior remains.
- No Automatic/Manual More Molds switch remains.
- The surviving Segmentation is the previous One Mold behavior, not a blend of both old modes.
- User-visible One Mold naming is gone.

## Architecture
- More Molds draft stores/runners/provenance/reopen infrastructure are removed.
- Cutting workflow state no longer models impossible deleted More Molds states.
- Surviving Segmentation APIs use neutral naming.
- No dead compatibility wrapper is introduced just to preserve deleted mode APIs.
- No duplicated store/state machine is introduced.

## Segmentation behavior
- printer-fit planning remains correct;
- extension-axis ownership remains correct;
- moved extension validation remains correct;
- stale execution guards remain correct;
- Mold Scale topology-preserving regeneration remains correct;
- Segmentation Registration lineage/policy remains intact;
- Cavity remains blocked during genuine Segmentation replan;
- committed result promotion remains compatible with downstream tools.

## Cut by Face integrity
- final-plane Eraser/removal cannot leave old committed bodies visible;
- `lastCommittedResult` cannot outlive the topology it represents;
- Sprue presentation cannot outlive invalid geometry dependencies;
- Cavity / Registration stale state is invalidated truthfully;
- body visibility cannot retain unsafe ownership of deleted body ids;
- state/document/evaluation agree after topology changes.

## Quality
- targeted regression tests pass;
- TypeScript typecheck passes;
- lint passes, except explicitly proven pre-existing failures;
- build passes;
- full test suite passes, except explicitly proven pre-existing failures;
- `git diff --check` passes;
- semantic grep shows no accidental deleted-mode remnants;
- final diff contains no unrelated redesign.

---

# 16. Out of Scope

Do not use Execution 01 to address:

- the broader Registration sizing redesign / need-based registration profiles;
- the historical Ready-but-invisible Viewport investigation unless this execution directly causes or exposes a regression there;
- the Webpage 2.0 / Spline-inspired UI redesign;
- Undercut / internal-cavity demolding analysis;
- new mold-generation features;
- new CAD import formats;
- unrelated performance refactors.

Record relevant observations for a later execution, but do not expand scope.

---

# 17. Change Discipline

Craft is an interconnected engineering system.

Therefore:

- never “fix the symptom” only;
- never mutate one store without tracing every selector/consumer;
- never delete a state branch without tracing its worker cancellation and downstream ownership;
- never trust visual absence as proof that state was removed;
- never trust a green unit test as proof that another subsystem did not regress;
- never introduce a second source of truth;
- never add fallback behavior that silently fabricates success;
- never keep stale geometry for convenience;
- never convert a hard engineering invalidity into a warning just to make Done work.

Prefer truthful failure over fake success.

Prefer deletion over dormant compatibility code.

Prefer one authoritative dependency chain over synchronized copies.

---

# 18. Required Final Report

Return a final report with exactly these sections.

## 1. Decision
One of:

- `COMPLETE`
- `PARTIALLY COMPLETE`
- `BLOCKED`

## 2. Repository State
- branch
- starting commit if available
- ending commit/worktree state
- whether any unrelated local changes existed before execution

## 3. More Molds Removal
List:
- removed UI
- removed state/contracts
- removed draft stores/runners
- removed provenance/reopen paths
- removed Viewport routing
- removed Scale regeneration branch
- removed strategy/domain code
- removed tests/dead exports

## 4. Segmentation Rename
List every important One Mold → Segmentation semantic rename and any old naming intentionally retained, with reason.

## 5. Derived-State Integrity Repair
Explain:
- root cause
- affected transitions
- exact invalidation contract adopted
- how `lastCommittedResult`, Sprue, Cavity, Registration, visibility, document/evaluation are handled

## 6. Files Changed
For each changed production file:
- path
- why it was necessary

Separate test-only files.

## 7. Tests / Harness
Provide exact commands and results:
- targeted tests
- typecheck
- lint
- build
- full test suite
- `git diff --check`
- semantic grep

## 8. Regression Assessment
Explicitly state whether the execution changed behavior in:
- Cavity
- Registration
- Sprue
- Mold Scale
- Viewport interaction
- model replacement/orientation
- printer-fit analysis

## 9. Remaining Risks
Only evidence-backed risks.

Do not say “all good” merely because tests pass.

## 10. Deleted-Code Confirmation
State whether any active More Molds / One Mold product-mode remnants remain.

If yes, list each occurrence and why it could not safely be removed.

---

# 19. Completion Rule

Do not declare `COMPLETE` until:

1. More Molds is removed as a system, not hidden.
2. surviving One Mold behavior has become neutral Segmentation behavior.
3. stale Cut by Face committed/derived state cannot survive topology invalidation.
4. targeted and broad harnesses have been run.
5. the final diff has been manually audited.
6. deleted-mode semantic grep has been performed.
7. cross-system regression impact is explicitly reported.

If any of these cannot be established, return `PARTIALLY COMPLETE` or `BLOCKED` with concrete evidence.
