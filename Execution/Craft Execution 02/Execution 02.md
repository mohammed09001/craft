# Craft — Execution 02
## Closure Sweep: Sprue Dependency Integrity + Segmentation Semantic Consolidation + Repository-Root CI

**Repository authority:** `mohammed09001/craft`  
**Current repository layout:** repository root → `mold/` → `frontend/`  
**Execution folder:** `Execution/Craft Execution 02/`  
**Starting reference observed while constructing this execution:** `main` at/after `46a6f4d037a809ca951d350dd75c1ef5afebff3c` (`Execute Craft Execution 01`)  
**Execution philosophy:** closure-only, evidence-first, dependency-aware, delete/simplify before adding, preserve engineering behavior, prove every repair through regression evidence.

---

# 0. Mission

Execution 01 successfully removed the old More Molds product branch, collapsed Constructed Cutting Plan to `Cut by Face + Segmentation`, preserved the surviving printer-fit-driven Segmentation behavior, and repaired the primary stale committed-body failure around Cut by Face topology edits.

Execution 02 is **not a new feature phase**.

Its purpose is to close the remaining gaps that prevent the previous execution from being considered fully complete:

1. Close the remaining Sprue dependency-integrity risk when Segmentation replaces or regenerates committed mold topology.
2. Finish the semantic cleanup left after removing One Mold / More Molds mode concepts, without performing a broad architecture rewrite.
3. Move quality enforcement to a real repository-root GitHub Actions workflow so frontend and Python checks can run automatically on `main` and pull requests.
4. Re-run and strengthen the full regression harness so Execution 01's repaired invariants remain true after the closure work.
5. Produce a final evidence-based decision that distinguishes:
   - verified fixed;
   - verified preserved;
   - intentionally retained;
   - blocked by pre-existing/unrelated failure;
   - still unresolved.

Do not add unrelated features.

Do not redesign the product.

Do not retune engineering constants.

Do not reopen already-closed architecture unless a failing invariant proves it necessary.

---

# 1. Repository Is the Source of Truth

Before editing:

1. Run from the repository root.
2. Record:
   - current branch;
   - current HEAD SHA;
   - `git status --short`;
   - whether the working tree is clean.
3. Inspect the current repository rather than assuming this prompt's filenames are exhaustive.
4. Trace current imports, exports, selectors, runtime consumers, stores, tests, and CI files before changing anything.
5. Do not rely on old chat summaries or external roadmap text.
6. Do not commit, push, merge, switch branches, rewrite history, or edit Git configuration unless the user separately instructs you to do so.
7. Do not modify generated dependencies such as:
   - `node_modules`;
   - build output;
   - caches;
   - virtual environments;
   - temporary artifacts.
8. Do not introduce secrets, tokens, credentials, or local-machine paths into tracked files.
9. Prefer deleting, renaming, or consolidating existing code over adding wrappers around obsolete semantics.
10. If the current repository has legitimately changed since this execution was written, follow current code evidence and explain the divergence in the final report.

---

# 2. Current Closure Evidence

At the start of Execution 02, the current repository is expected to have the following broad shape.

Constructed Cutting Plan currently exposes exactly:

```text
Cut by Face
Segmentation
```

The old product-level branches are already removed:

```text
One Mold
More Molds
Automatic More Molds
Manual More Molds
```

The current Segmentation path is intended to be printer-fit-driven only.

The current Split Face store already contains an atomic invalidation helper equivalent in purpose to:

```text
invalidateCommittedTopology()
```

and current Cut by Face topology edits are expected to invalidate:

```text
lastCommittedResult
sprues
sprueDefinitions
bodyVisibility
Cavity
Registration
document/evaluation lineage
```

The active-body selector also has a freshness backstop based on committed result revision/fingerprint matching the current document.

Do not undo these repairs.

The remaining in-scope closure areas are described below.

---

# 3. Non-Negotiable Product Contract

After Execution 02, the product contract must still be:

```text
Constructed Cutting Plan
├── Cut by Face
└── Segmentation
```

There must be no reintroduction of:

- More Molds;
- Automatic/Manual More Molds;
- One Mold as a user-facing mode;
- `make-as-more-molds`;
- `make-as-one-mold` as an active product distinction;
- a strategy switch whose only purpose is to choose between deleted product modes;
- duplicate Segmentation engines with different product behavior.

Segmentation must remain printer-fit-driven.

A fitting mold must not be split merely because its shape is elongated.

Do not reintroduce old logical-section behavior from More Molds.

Do not redesign Segmentation's engineering logic in this execution.

---

# 4. Scope Boundary

Execution 02 may change:

- Sprue invalidation/revalidation semantics where topology replacement currently leaves stale intent/presentation risk;
- Sprue presentation selectors if necessary to distinguish durable intent from committed/resolved geometry;
- Segmentation store/type/file naming that still carries obsolete single/multi-mode semantics;
- obsolete comments and internal identifiers left from deleted One Mold / More Molds architecture;
- tests required to prove the closure;
- repository-root GitHub Actions configuration;
- package/test harness wiring only where required to make the quality gate truthful.

Execution 02 must NOT redesign:

- Registration profile sizing;
- Registration placement policy;
- Cavity clearance;
- cavity Boolean algorithms;
- Sprue profile geometry;
- General Segmentation boundary generation;
- printer-fit formulas;
- automatic Segmentation mold clearance;
- Mold Scale user experience;
- viewport visual design;
- the Spline/Webpage 2.0 UI direction;
- model import;
- unrelated engineering-report systems;
- unrelated Python engine architecture.

If an in-scope repair requires a narrow type/call-site update in one of those systems, make the minimum dependency-safe change and document it.

---

# 5. Objective A — Close Sprue Dependency Integrity

## 5.1 The invariant

A Sprue has two conceptually different forms:

1. durable user intent;
2. geometry resolved against a specific authoritative mold/cavity topology.

Those two states must never be confused.

A topology replacement must never leave an old Sprue looking or behaving as if it were still resolved against the new topology unless it has actually been revalidated and rebuilt against that topology.

This applies even if keeping Sprue intent is a desirable product behavior.

Preserving user intent is allowed.

Preserving stale resolved truth is not.

---

# 6. Build the Sprue Dependency Map Before Editing

Trace every producer and consumer of at least:

```text
sprues
sprueDefinitions
SprueOperationDefinition
SprueDefinition
SpruePresentationDefinition
selectSpruePresentationDefinitions
createSelectSpruePresentationDefinitions
createSprue
rebuildSprues
rebuildSprueDefinitions
resizeSprue
resizeSprueEntryNeck
moveSprue
removeSprue
createCavity
adoptCommittedSegmentationResult
promoteReplannedSegmentationResult
invalidateForClearance
invalidateCommittedTopology
document.sprues
```

Also inspect:

- viewport rendering of Sprue presentation;
- tool availability;
- cavity dependency;
- target body IDs;
- mold-frame identity;
- anchor coordinates;
- validation status;
- source revision/fingerprint lineage;
- undo/redo snapshots;
- model replacement;
- orientation changes;
- Mold Scale;
- Segmentation commit;
- Segmentation Scale regeneration;
- Cut by Face commit;
- Cut by Face topology edit.

Create an internal dependency map before implementation.

Do not begin with a local patch to `adoptCommittedSegmentationResult` without tracing the whole lifecycle.

---

# 7. Required Sprue State Classification

For every relevant Sprue field, explicitly classify it as one of:

### A. Authoritative user intent
Examples may include:
- requested anchor;
- profile choice;
- creation order;
- user-entered diameter intent.

### B. Derived topology-dependent output
Examples may include:
- resolved target body IDs;
- Boolean depth;
- resolved geometry;
- mold-frame-specific resolved state.

### C. Validation state
Examples may include:
- `pending`;
- `resolved`;
- `invalid`;
- stale-input reason.

### D. Presentation state
Anything capable of making the viewport display a Sprue to the user.

The implementation must enforce the distinction.

A stale topology-dependent result must not survive merely because the user intent survived.

---

# 8. Mandatory Segmentation Replacement Case

Reproduce this scenario in a focused test before the repair:

1. Create/commit mold geometry.
2. Create a valid Cavity.
3. Create a Sprue and reach a genuinely resolved state.
4. Confirm:
   - `sprueDefinitions` contains the operation;
   - resolved `sprues` contains the geometry;
   - normal Sprue presentation is non-empty.
5. Replace the committed mold topology with a successful Segmentation commit.
6. Observe current behavior.

The post-replacement contract must be:

- old resolved Sprue geometry is gone;
- old target body IDs are not authoritative;
- old resolved depth is not authoritative;
- old mold-frame-resolved status is not authoritative;
- no normal committed Sprue presentation may masquerade as valid against the new topology;
- Cavity is unavailable until regenerated against the new topology;
- Registration follows its existing dependency lifecycle;
- document identity/fingerprint truthfully describes the new topology.

If durable Sprue intent is preserved:

- it must be explicitly marked as requiring revalidation/rebuild;
- its validation must not remain `resolved`;
- it must not render through the normal committed/resolved Sprue geometry path;
- it must not provide stale target body IDs or stale Boolean depth;
- it may only become resolved again after current Cavity + current mold topology successfully revalidate/rebuild it.

If preserving the intent cannot be made truthful with the existing architecture, clear the invalid Sprue intent rather than rendering stale truth.

Correctness beats retention.

---

# 9. Sprue Presentation Contract

Audit `selectSpruePresentationDefinitions` and every consumer.

Current architecture may be able to reconstruct a presentation from `sprueDefinitions` even when no resolved Sprue geometry exists.

That is only acceptable if the UI/runtime makes the difference between:

```text
pending intent
resolved manufactured geometry
invalid intent
```

unambiguous.

For Execution 02, the normal mold-geometry presentation path must satisfy:

```text
resolved geometry is presented as resolved geometry
pending intent is NOT presented as resolved geometry
invalid/stale intent is NOT presented as resolved geometry
```

If the product needs a pending-intent marker in the future, keep that as a separate explicit semantic path.

Do not let the existing resolved Sprue geometry renderer silently act as a generic intent renderer.

Prefer a small, explicit contract over hidden interpretation.

---

# 10. Mold Scale + Sprue Closure

Mold Scale already invalidates topology-dependent derived state.

Verify the existing contract under current code.

Mandatory scenarios:

### Cut by Face → Cavity → Sprue → Mold Scale
After Scale:
- old resolved Sprue geometry is not authoritative;
- durable intent, if preserved, is clearly pending/revalidation-required;
- Cavity is unavailable until regenerated;
- new mold geometry remains truthful.

### Segmentation → Cavity → Sprue → Mold Scale → Segmentation regenerate
During regeneration:
- Create Cavity remains blocked while Segmentation regeneration is genuinely in flight;
- no old resolved Sprue geometry appears attached to the temporary whole-K2 or the new segmented bodies;
- once topology settles, Sprue remains unresolved until rebuilt against the current Cavity/topology;
- a stale asynchronous Sprue result cannot overwrite newer mold state.

Do not change Mold Scale topology-preservation semantics merely to satisfy Sprue tests.

---

# 11. Undo / Redo Sprue Integrity

A topology-changing edit followed by Undo must restore a coherent prior snapshot.

Test at least one path:

```text
committed mold
→ cavity
→ resolved Sprue
→ topology-changing edit
→ derived state invalidated
→ Undo
```

After Undo:

- the prior mold definition is restored;
- the prior committed-result lineage is coherent;
- Sprue state is either restored coherently or truthfully requires rebuild according to the repository's history model;
- no cross-topology mixture is allowed.

Redo must reapply the invalidation.

Do not create a special-case history mechanism only for Sprue unless the existing snapshot model proves insufficient.

---

# 12. Objective B — Finish Segmentation Semantic Consolidation

Execution 01 removed actual One Mold / More Molds behavior, but some internal naming may still imply that multiple Segmentation modes exist.

Audit current references to:

```text
SegmentationMode
segmentationMode
ModeStore
createSegmentationModeStoreCreator
useSegmentationModeStore
SegmentationModeSnapshot
SegmentationModeStoreDeps
draft
DraftA
DraftB
oneMold
OneMold
moreMolds
MoreMolds
make-as-one-mold
make-as-more-molds
Automatic More Molds
Manual More Molds
Partitioning
```

Classify every occurrence before editing:

- `REMOVE` — dead product/mode residue;
- `RENAME` — live Segmentation behavior carrying obsolete mode terminology;
- `PRESERVE` — genuinely generic concept still meaningful;
- `TEST-ONLY` — useful testability wording, but rename if it falsely implies deleted product semantics;
- `HISTORICAL ARTIFACT` — old docs/backups not active production; do not perform massive history cleanup unless the prompt explicitly requires it;
- `INVESTIGATE` — unclear caller/compatibility contract.

---

# 13. Neutral Segmentation Naming Target

If repository evidence confirms there is no external compatibility contract requiring the old names, prefer neutral names such as:

```text
segmentation.store.ts
SegmentationSnapshot
SegmentationStore
SegmentationStoreDeps
createSegmentationStoreCreator
useSegmentationStore
```

instead of:

```text
segmentationMode.store.ts
SegmentationModeSnapshot
SegmentationModeStore
SegmentationModeStoreDeps
createSegmentationModeStoreCreator
useSegmentationModeStore
```

This is a semantic cleanup, not a rewrite.

Preserve the factory if it still provides useful:

- dependency injection;
- isolated unit-test state;
- worker lifecycle isolation for tests;
- deterministic harness setup.

Do not delete a useful factory merely because old tests call the instances “drafts.”

Rename the test semantics instead.

Example:

```text
store instance A
store instance B
```

rather than:

```text
DraftA
DraftB
```

when those instances no longer represent product drafts.

---

# 14. Do Not Blindly Rename Every “Automatic Segmentation” Token

Some `AUTOMATIC_SEGMENTATION_*` identifiers may still describe a real automatic printer-fit policy rather than the deleted “Automatic More Molds” product mode.

Do not globally rename them.

Trace their current meaning.

Only rename if they are semantically obsolete.

Preserve real engineering-policy names where they still accurately describe behavior.

---

# 15. Remove Dead Product Comments

Active production code and active tests must not claim that the product still has:

- Manual More Molds;
- Automatic More Molds;
- One Mold as a peer mode;
- more-molds draft ownership;
- deleted reopen flows;
- deleted strategy switching.

Also remove misleading comments such as “Partitioning” when the referenced component no longer has that product meaning.

Do not spend this execution cleaning every historical backup under `.stage-work`, archival docs, or old execution reports.

Focus semantic grep on active source, active tests, active public docs, and active exports.

---

# 16. Preserve Segmentation Behavior While Renaming

After semantic cleanup, all of the following must remain true:

### Planning
- missing/invalid printer volume fails truthfully;
- adding printer dimensions later retries planning;
- fitting mold returns `not-required`;
- oversize axes are derived only from printer fit;
- multi-axis planning is deterministic.

### Extension axes
- algorithm-owned axes are locked;
- user can add only unused axes;
- user drag coordinate becomes authoritative;
- invalid position remains visible/stateful but blocks acceptance;
- removing extension restores the base plan;
- protected-region conflicts remain enforced.

### Execution
- real geometry executes;
- stale source/printer input is rejected;
- stale worker output cannot overwrite newer state;
- committed result promotion remains authoritative.

### Mold Scale
- topology-preserving replan still works;
- topology mismatch falls back truthfully;
- extension replay remains validated;
- overlapping regeneration count remains safe;
- Cavity remains blocked while regeneration is in flight.

Do not accept a “successful rename” that breaks any of these invariants.

---

# 17. Objective C — Create a Real Repository-Root CI Gate

The repository root currently contains the application under:

```text
mold/
```

The Python project is under:

```text
mold/pyproject.toml
```

The frontend is under:

```text
mold/frontend/
```

A workflow stored only at:

```text
mold/.github/workflows/ci.yml
```

does not function as the repository's standard GitHub Actions workflow location.

Execution 02 must create the active workflow under:

```text
.github/workflows/ci.yml
```

at the repository root.

After the root workflow is working, remove the nested workflow if keeping it would create a false impression that GitHub executes it.

Do not duplicate two CI definitions without a concrete reason.

---

# 18. CI — Python Job

The root CI must include a Python quality job using the repository's current Python project.

Use the current project evidence:

```text
Python >=3.13,<3.14
pytest
ruff
```

The job should operate from `mold/` and perform, at minimum:

```text
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

Use Python 3.13.

Do not invent extra package managers.

Do not require secrets.

---

# 19. CI — Frontend Job

The root CI must include a frontend quality job operating from:

```text
mold/frontend/
```

Use the committed lockfile and:

```text
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:run
```

Use a current stable Node LTS version compatible with the repository.

Do not use `npm test` if it enters watch mode.

Do not weaken the existing scripts to make CI green.

If a script currently exposes a real pre-existing failure, fix it only if the failure is in Execution 02's scope or is a trivial harness/configuration defect.

Otherwise record it as a blocker with exact evidence.

---

# 20. CI — Root Integrity Checks

Include a lightweight repository integrity step where practical:

```text
git diff --check
```

During local execution also run semantic greps described later.

Do not add unnecessary workflow complexity such as:

- deployment;
- Docker publishing;
- release creation;
- cloud credentials;
- artifact upload;
- matrix explosion;
- coverage SaaS;
- external services.

Execution 02 is establishing a trustworthy quality gate, not a delivery platform.

---

# 21. CI Truthfulness Rule

Do not claim:

```text
GitHub CI passed
```

unless an actual GitHub Actions run for the relevant commit has run and passed.

Because this execution must not push without user instruction, the normal final state may be:

```text
Root CI workflow created and validated locally.
Remote GitHub Actions run pending user push.
```

That is acceptable.

Truthful pending evidence is better than a fabricated green badge.

---

# 22. Objective D — Full Closure Harness

Run the frontend harness from:

```text
mold/frontend/
```

At minimum:

```text
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:run
```

Run the Python harness from:

```text
mold/
```

At minimum:

```text
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

Also run:

```text
git diff --check
```

from repository root.

If dependencies are already installed and `npm ci` would destructively reset a local dependency tree in a way that is unsafe for the user's environment, explain and use the closest deterministic equivalent; otherwise prefer `npm ci`.

---

# 23. Targeted Frontend Regression Suites

In addition to the complete `test:run`, explicitly run focused tests covering:

### Sprue topology invalidation
- Segmentation commit after resolved Sprue;
- Mold Scale after resolved Sprue;
- stale/pending Sprue presentation;
- rebuild after current Cavity;
- Undo/Redo integrity.

### Cut by Face derived-state invalidation
Preserve and rerun the Execution 01 tests for:
- final-plane erase;
- moved cutting plane;
- clear selection;
- active-body freshness guard.

### Cutting workflow
Rerun:
- two-tab UI;
- Cut by Face Done;
- Segmentation Done;
- Cancel;
- blocked Done reason;
- printer-dimension retry;
- interaction ownership.

### Segmentation
Rerun:
- printer-fit-only planning;
- fitting elongated mold → not-required;
- multi-axis deterministic planning;
- extension axis;
- protected-region conflict;
- stale worker guards;
- Scale replan;
- topology mismatch fallback;
- repeated regeneration.

Use actual repository test paths discovered during execution.

Do not hard-code old filenames if they were renamed as part of semantic consolidation.

---

# 24. Required Characterization Before Sprue Repair

Before changing production Sprue code:

1. Add or adapt a focused regression test representing the confirmed/credible stale presentation path.
2. Run the test against the current pre-fix state.
3. Confirm whether it fails for the intended reason.
4. If the repository behavior is already safe, do not manufacture a change:
   - explain why the audit suspicion was false;
   - keep the proving test;
   - move to the next closure item.
5. If it fails, repair the smallest authoritative dependency boundary.

This execution must remain evidence-first.

---

# 25. Avoid “Clear Everything” Repairs

The correct Sprue fix is not automatically:

```text
sprueDefinitions = []
```

on every upstream event.

Use dependency semantics.

Preserve durable user intent only when it can remain truthful.

Invalidate derived output aggressively when its source topology changes.

If preserved intent contains topology-specific fields that cannot be safely interpreted after replacement, either:

- normalize it into a topology-independent pending intent; or
- clear it.

Do not leave mixed-generation state.

---

# 26. Atomicity Requirement

Topology replacement and derived-state invalidation must be atomic from observable state.

There must not be a render frame where:

```text
new mold topology
+
old resolved Sprue
```

are simultaneously treated as current.

Likewise there must not be:

```text
new document revision
+
old committed Sprue target body ids
+
resolved validation status
```

unless a current revalidation has completed.

Prefer one authoritative store transition over a delayed cleanup effect.

Do not rely on a React `useEffect` to repair already-invalid domain state after rendering.

---

# 27. Async Stale-Result Requirement

Audit Sprue worker/application commits for source freshness.

If a Sprue operation begins against topology revision A and topology revision B replaces it before the result returns:

- A's result must not commit into B;
- A's result must not update presentation;
- A's result must not restore stale target body IDs;
- A's result must not set validation to resolved.

If this is already guaranteed, prove it with existing or new tests.

If not, add the narrowest revision/fingerprint/epoch guard consistent with existing architecture.

Do not build a new generic orchestration framework.

---

# 28. Cavity Dependency Requirement

A resolved Sprue that depends on Cavity must not remain resolved when Cavity becomes unavailable/stale.

Verify:

```text
current mold topology
current Cavity
current Sprue resolution
```

belong to the same authoritative dependency generation.

After a topology replacement:

```text
Cavity = unavailable
Sprue geometry = unresolved
```

until rebuilt.

Do not change the Cavity Boolean engine.

---

# 29. Registration Boundary

Registration is a regression surface only.

Execution 02 must NOT change:

- registration preferred width;
- minimum width;
- placement strategy;
- profile search order;
- tolerance policy;
- feature geometry.

Only update imports/types/comments if required by neutral Segmentation naming.

Run relevant tests so accidental Registration changes are detected.

---

# 30. Mold Clearance Boundary

Do not retune:

```text
DEFAULT_REFERENCE_MOLD_CLEARANCE_MM
AUTOMATIC_SEGMENTATION_MIN_MOLD_CLEARANCE_MM
MAX_REFERENCE_MOLD_CLEARANCE_MM
```

unless a failing invariant proves the existing constants themselves are the cause.

Execution 02 is not a mold-clearance tuning phase.

---

# 31. Viewport Boundary

Do not redesign the viewport.

Only change viewport code if necessary to enforce the Sprue truth contract or neutral Segmentation naming.

If Sprue presentation semantics are split into resolved vs pending:

- the normal manufacturing geometry renderer must receive only truthful resolved geometry;
- do not add a new visual design for pending intent in this execution unless the current UI already has a suitable distinct representation.

Prefer no ghost over a misleading ghost.

---

# 32. Semantic Grep Closure

At the end, search active source/test paths for obsolete product concepts.

At minimum inspect:

```text
moreMolds
MoreMolds
more-molds
make-as-more-molds
oneMold
OneMold
make-as-one-mold
Automatic More Molds
Manual More Molds
SegmentationMode
segmentationMode
DraftA
DraftB
Partitioning
```

Do not treat archival `.stage-work` history as a production failure.

Report separately:

```text
active production/test residue
historical/archive residue
```

The active product must be semantically coherent.

---

# 33. File Rename Safety

If renaming:

```text
segmentationMode.store.ts
```

to:

```text
segmentation.store.ts
```

perform repository-wide import/export updates deliberately.

After the rename:

- no duplicate old/new file should remain;
- no compatibility shim should remain unless a real external contract requires it;
- index exports must be neutral;
- tests must import the neutral API;
- comments must match the new semantics;
- typecheck must prove no unresolved import survived.

Use Git-aware rename where practical.

Do not copy the file and leave both versions active.

---

# 34. Test Naming Cleanup

Tests must describe current product behavior.

Prefer:

```text
segmentation store
segmentation store factory isolation
independent store instances
```

over obsolete:

```text
segmentation mode
draft A
draft B
one-mold behavior
more-molds behavior
```

Do not delete valuable behavior tests just because their names are old.

Rename them and preserve coverage.

---

# 35. No Test Deletion to Achieve Green

Do not remove a failing test merely because the old architecture changed.

Classify it:

- obsolete More-Molds-only test → remove;
- surviving behavior with obsolete name → migrate;
- valid regression test → preserve and fix production;
- genuinely redundant duplicate → remove only with coverage proof.

The final test count may decrease because deleted product modes no longer exist, but surviving invariant coverage must not shrink silently.

---

# 36. Loop A — Evidence Map

Before implementation:

1. confirm repository status;
2. trace Sprue lifecycle;
3. trace Segmentation topology promotion;
4. trace Scale regeneration;
5. trace active Sprue presentation;
6. trace stale worker guards;
7. trace all `SegmentationMode` naming;
8. inspect current CI layout;
9. inspect current package scripts;
10. identify targeted tests.

Exit only when every in-scope change has a known dependency path.

---

# 37. Loop B — Characterization

Before production changes:

1. reproduce the stale/potentially stale Sprue lifecycle in tests;
2. confirm current behavior;
3. strengthen characterization for surviving Segmentation;
4. run the focused tests;
5. record the baseline failures/passes.

Do not skip this loop.

---

# 38. Loop C — Sprue Repair

Implement the smallest authoritative fix that makes:

```text
topology generation
Cavity generation
Sprue resolution
Sprue presentation
```

consistent.

After each meaningful step:

1. run focused Sprue tests;
2. run Cut by Face derived-state tests;
3. inspect selector behavior;
4. inspect document revision/fingerprint behavior;
5. inspect undo/redo.

Do not continue if the repair creates a new ambiguous state.

---

# 39. Loop D — Semantic Consolidation

After Sprue integrity is stable:

1. rename neutral Segmentation concepts;
2. update imports/exports;
3. update active comments;
4. update tests;
5. run typecheck;
6. run targeted Segmentation tests;
7. semantic grep again.

Do not mix semantic renaming and Sprue behavior repair in one unreviewable edit if it can be staged separately.

---

# 40. Loop E — Root CI

Create the repository-root workflow.

Validate:

- YAML structure;
- paths;
- working directories;
- Python version;
- Node version;
- commands;
- absence of secret requirements;
- frontend non-watch test command.

Remove the nested inactive workflow only after root CI covers its intended Python checks.

Do not claim a remote pass without an actual run.

---

# 41. Loop F — Full Regression

Run the complete local harness:

```text
Python lint
Python formatting check
Python tests
Frontend typecheck
Frontend lint
Frontend build
Frontend full tests
git diff --check
semantic grep
```

Then review the final diff for accidental scope expansion.

---

# 42. Full Workflow Regression Scenarios

The final regression review must reason through at least:

### Flow A
```text
Import
→ Cut by Face
→ Done
→ Cavity
→ Sprue
→ topology edit
→ Eraser/remove final plane
→ Undo
→ Redo
```

### Flow B
```text
Import
→ Segmentation
→ Done
→ Cavity
→ Sprue
→ reopen Constructed Cutting Plan
→ Segmentation
→ Done
```

### Flow C
```text
Import
→ Segmentation
→ extension axis
→ Done
→ Cavity
→ Sprue
→ Mold Scale
→ Segmentation regenerate
→ Cavity rebuild
→ Sprue rebuild/revalidation
```

### Flow D
```text
Import
→ Cut by Face
→ Done
→ Cavity
→ Sprue
→ Mold Scale
→ Cavity rebuild
→ Sprue rebuild/revalidation
```

The goal is not browser automation for every step if the repository lacks such infrastructure.

The goal is to prove every domain transition with the strongest available automated layer and explicitly identify anything that still requires browser verification.

---

# 43. Browser Verification Boundary

If a real browser can be run in the execution environment, perform a concise smoke pass for:

- Constructed Cutting Plan has two tabs only;
- Segmentation still plans/commits;
- Cut by Face still commits;
- final-plane Eraser no longer leaves old bodies;
- after topology replacement an old resolved Sprue does not appear as valid committed geometry;
- Cavity/Sprue rebuild sequence remains usable.

If browser execution is unavailable, say:

```text
Browser verification not executed in this environment.
```

Do not invent browser evidence from unit tests.

---

# 44. Git Diff Review

Before finalizing:

Run:

```text
git status --short
git diff --stat
git diff --check
```

Review every changed file.

Classify each change as:

```text
Sprue integrity
Segmentation semantic cleanup
CI/harness
test migration
necessary dependency update
```

Any unrelated file must be reverted or explicitly justified.

---

# 45. Expected Architecture After Execution 02

The target architecture should conceptually be:

```text
Constructed Cutting Plan
├── Cut by Face
│   └── Split Face authoritative state
│
└── Segmentation
    └── Segmentation authoritative state

Committed mold topology
        ↓
Cavity derived from current topology
        ↓
Sprue resolved from current topology + current Cavity
```

with the rule:

```text
topology changes
        ↓
topology-derived results become stale/unavailable
        ↓
durable intent may survive only if explicitly pending and revalidated
        ↓
normal presentation never reports stale geometry as current
```

Quality enforcement should be:

```text
repository root
└── .github/workflows/ci.yml
    ├── Python quality
    └── Frontend quality
```

---

# 46. Acceptance Criteria — Sprue

Execution 02 cannot close Sprue integrity until all are true:

- a resolved Sprue cannot survive a topology replacement as resolved current geometry;
- stale target body IDs cannot remain authoritative;
- stale Boolean depth cannot remain authoritative;
- stale cavity-dependent geometry cannot remain authoritative;
- pending durable intent, if preserved, is explicitly pending/stale and not rendered as resolved geometry;
- old async Sprue results cannot overwrite newer topology;
- current topology + current Cavity are required before returning to resolved state;
- Undo/Redo remains coherent;
- final-plane Eraser regression remains fixed.

---

# 47. Acceptance Criteria — Segmentation Semantics

All must be true:

- UI still says `Segmentation`;
- no active More Molds product state returns;
- no active One Mold product state returns;
- printer-fit-only behavior preserved;
- neutral store/type naming used where safe and internal;
- useful store factory/testability preserved if still justified;
- no compatibility wrappers retained without evidence;
- active comments describe the current product;
- active tests describe the current product.

---

# 48. Acceptance Criteria — CI

All must be true:

- `.github/workflows/ci.yml` exists at repository root;
- Python job operates from `mold/`;
- frontend job operates from `mold/frontend/`;
- Python uses 3.13;
- frontend uses `npm ci`;
- frontend runs:
  - `typecheck`;
  - `lint`;
  - `build`;
  - `test:run`;
- Python runs:
  - `ruff check`;
  - `ruff format --check`;
  - `pytest`;
- no secret is required;
- nested inactive workflow is removed or clearly justified;
- CI configuration is syntactically valid;
- final report does not claim remote success without a real run.

---

# 49. Acceptance Criteria — Regression

All must be true or explicitly blocked with evidence:

- frontend typecheck passes;
- frontend lint passes;
- frontend build passes;
- frontend full tests pass;
- Python Ruff passes;
- Python formatting check passes;
- Python tests pass;
- `git diff --check` passes;
- targeted Sprue tests pass;
- Cut by Face invalidation tests pass;
- Cutting Workflow tests pass;
- Segmentation tests pass;
- Mold Scale regeneration tests pass;
- no in-scope stale-state failure remains.

---

# 50. Failure Handling

If a test fails:

1. determine whether the failure is:
   - introduced by Execution 02;
   - pre-existing;
   - obsolete because deleted product semantics were still encoded;
   - environment-only;
   - genuinely unrelated.
2. Do not suppress or weaken the test.
3. Fix introduced failures.
4. Fix trivial in-scope harness defects.
5. For unrelated pre-existing failures:
   - preserve them;
   - record exact test/file/error;
   - do not expand scope into a different subsystem without user approval.

---

# 51. No Compatibility Shells

Do not solve semantic cleanup by creating:

```text
oldName -> re-export newName
```

for every removed name.

If an internal symbol has no external compatibility requirement, update callers and remove the obsolete name.

Compatibility aliases are allowed only when repository evidence proves a real serialized/public/external contract requires them.

Explain every retained alias in the final report.

---

# 52. No New General Framework

Do not create:

- a generic derived-state dependency graph engine;
- a new event bus;
- a new orchestration layer;
- a new state library;
- a new workflow DSL;
- a new rendering framework.

Use the current Zustand/domain architecture.

Execution 02 is a closure repair, not infrastructure experimentation.

---

# 53. Code Quality Rule

Prefer:

- one clear authoritative helper;
- explicit dependency state;
- strong discriminated unions;
- neutral names;
- current-document freshness checks;
- narrow selectors;
- regression tests.

Avoid:

- duplicated flags;
- hidden implicit lifecycle state;
- delayed cleanup effects;
- broad `any`;
- silent catches;
- stale comments;
- giant compatibility objects;
- dead exports.

---

# 54. Required Final Report

At the end, print a structured report in the terminal/chat.

Do not create or commit an additional report file unless the user explicitly asks for one.

Use this exact high-level structure:

```text
Decision
Repository State
Execution 02 Scope
Sprue Dependency Audit
Sprue Repair
Segmentation Semantic Consolidation
CI Migration
Files Added
Files Modified
Files Renamed
Files Deleted
Targeted Tests
Full Frontend Harness
Full Python Harness
Git Diff Check
Semantic Grep
Browser Verification
Regression Assessment
Remaining Risks
Out-of-Scope Findings
User Action Required
```

For `Decision`, use only one:

```text
COMPLETE
READY FOR USER PUSH / REMOTE CI VERIFICATION
PARTIALLY COMPLETE
BLOCKED
```

Do not use `COMPLETE` if an in-scope defect is still known.

`READY FOR USER PUSH / REMOTE CI VERIFICATION` is appropriate when:

- all local code/harness acceptance criteria pass;
- root CI exists;
- the only missing evidence is the remote Actions run because pushing was intentionally not performed.

---

# 55. Final Evidence Requirements

The final report must include exact evidence, not vague statements.

Examples:

```text
npm run typecheck: PASS
npm run lint: PASS
npm run build: PASS
npm run test:run: PASS — N tests
ruff check .: PASS
ruff format --check .: PASS
pytest: PASS — N tests
git diff --check: PASS
```

If a command fails, include:

```text
command
exit status
failing test/file
short cause
whether introduced by this execution
```

For semantic cleanup, report remaining active matches for:

```text
MoreMolds
moreMolds
OneMold
oneMold
SegmentationMode
segmentationMode
```

and explain any intentionally retained match.

---

# 56. Definition of Done

Execution 02 is done only when the repository can truthfully say:

1. More Molds remains removed.
2. Segmentation remains the single printer-fit-driven Segmentation workflow.
3. Cut by Face topology edits cannot render stale committed geometry.
4. Segmentation topology replacement cannot make an old Sprue masquerade as current resolved geometry.
5. Sprue durable intent, if retained, has an explicit stale/pending lifecycle and requires current dependencies before resolution.
6. active internal Segmentation semantics no longer imply deleted product modes without a concrete reason.
7. GitHub CI lives at repository root and covers both Python and frontend quality.
8. the complete local regression harness is green, or every remaining failure is explicitly proven unrelated/pre-existing.
9. no Registration/Cavity/Segmentation engineering policy was accidentally redesigned.
10. no unrelated feature work was introduced.

---

# 57. Execution Order

Use this order unless repository evidence requires a justified deviation:

```text
1. Inspect
2. Build dependency map
3. Add characterization test for Sprue topology replacement
4. Reproduce
5. Repair Sprue dependency/presentation truth
6. Run focused regressions
7. Neutralize remaining Segmentation mode semantics
8. Run typecheck + Segmentation regressions
9. Create repository-root CI
10. Remove obsolete nested CI
11. Run full frontend harness
12. Run full Python harness
13. Run git diff --check
14. Run semantic grep
15. Review final diff
16. Print final report
```

Do not commit or push.

---

# 58. Final Instruction

Treat the current repository as a connected engineering system.

Do not optimize for the smallest visible patch.

Optimize for the smallest **authoritative** repair that makes the dependency graph truthful.

Execution 01 solved the major structural problem.

Execution 02 must close the remaining integrity and verification gaps without reopening already-stable work.
