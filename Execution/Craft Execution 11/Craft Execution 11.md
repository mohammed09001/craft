# Craft — Execution 11
## Final Sprue Closure Protocol — Proof-Carrying Repair, Production-Store Browser Evidence, Historical Performance Recovery, Failure-State Truth, Runner Ownership, Security Hardening, and Exact-SHA Remote Closure

**Repository authority:** `mohammed09001/craft`  
**Observed authoring head:** `main` at `6aeabcd57b255b6ded740996408f9664298b8339`  
**Observed exact-head CI:** `Continuous Integration` run `34346095649` — `success` on the exact observed SHA  
**Execution 10 starting head:** `042d4011a77c2f7ceb3813def23a97da59dd961f`  
**Execution 09 historical reference:** `081ef3a94db3dd3f7d58e3283d5a238603e4655c`  
**Canonical repository paths:** `mold/`, `mold/frontend/`, `Execution/`, `.github/workflows/ci.yml`  
**Likely local Codex working directory:** a path equivalent to `.../mold-saas/mold`, while the actual Git root is its parent. Resolve with Git; never infer from the shell prompt.  
**Execution type:** final corrective closure of the Sprue/Funnel performance and lifecycle chain.  
**Non-goal:** new product features.  
**Non-goal:** generic cleanup.  
**Non-goal:** architectural novelty for its own sake.  
**Doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline + Proof-Carrying Change Discipline.  
**Hard rule:** useful complexity only. Every abstraction must remove a proven ambiguity, race, duplicated owner, or evidence gap. If it does not, do not add it.

---

# Agent Operating Contract

This document is an execution contract, not a brainstorming note.

The coding agent must remain quiet during ordinary execution. Do not flatter, praise, motivate, narrate obvious file reads, restate the task, or produce progress essays. Read, inspect, change, test, continue.

Do not ask the user for facts discoverable from Git, the repository, the current working tree, existing tests, or GitHub Actions.

Do not invent evidence. Do not say “fixed” because code changed. Do not say “complete” because CI is green. Do not say “latest-wins browser proof” if the browser test bypasses the store coordinator. Do not say “performance improved” without the required measurements.

Only interrupt normal execution for:

```text
BLOCKED — <specific external blocker that repository evidence cannot resolve>
```

or:

```text
DECISION REQUIRED — <one irreversible product/architecture decision, with repository-supported options>
```

No ordinary implementation step requires conversational approval unless permissions or tool policy require it.

Before any user-authorized push, no force push, no history rewrite, no destructive reset, no `git clean -fd`, and no deletion of user work.

---

# Why Execution 11 Exists

Execution 10 materially improved `splitFace.store.ts`, especially scheduler teardown and scoped failure rollback, but the live repository audit proves it did not execute its own full closure protocol.

Between `042d4011...` and current `6aeabcd...`, Execution 10 changed only:

```text
Execution/Craft Execution 10/Craft Execution 10.md
mold/frontend/src/features/mold-generation/split-face/splitFace.sprueLatestWins.test.ts
mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
```

The current exact-head baseline is healthy:

```text
Vitest: 189 passed files, 2 skipped; 1108 passed tests, 5 skipped
Playwright: 3 passed
npm install/audit at observed head: 0 vulnerabilities
Production eager app: ~391.92 kB / 410 kB budget
Largest lazy/shared Three chunk: ~546.71 kB / 575 kB budget
Python quality: success
Repository integrity: success
Quality gate: success
```

But the current repository also proves these mandatory gaps remain:

```text
no new production-store Sprue browser lifecycle proof
no real browser main-diameter resize through the production store
no real browser entry-neck resize through the production store
no real browser latest-wins burst through the production store
current browser Sprue test is a direct derived-engine cache probe
no historical performance report
no 081ef3... -> final timing comparison
no 042d4011... -> final timing comparison
no small / medium / large timing matrix
no 1-Sprue / 3-Sprue timing matrix
no p50 / p95 performance evidence
failure matrix remains incomplete
upstream invalidation matrix remains incompletely tested
module-global default derived-evaluation runner ownership remains unproven
CI still runs npm audit --audit-level=high
PR dependency review still fails only at high severity
no proof-carrying Execution 10 final report exists
```

Execution 11 closes these gaps and nothing else.

---

# Closure Equation

```text
COMPLETE =
  LOCAL_CORRECTNESS
  AND CROSS_SYSTEM_LIFECYCLE_PROOF
  AND FAILURE_TRUTH_PROOF
  AND REAL_BROWSER_COORDINATOR_PROOF
  AND PERFORMANCE_EVIDENCE
  AND RUNNER_OWNERSHIP_DECISION
  AND SECURITY_POLICY_PROOF
  AND PRODUCTION_ARTIFACT_PROOF
  AND FULL_HARNESS_GREEN
  AND EXACT_SHA_REMOTE_GREEN
  AND FINAL_ADVERSARIAL_REAUDIT
```

There is no weighted score. A missing mandatory proof means not complete.

Allowed final decisions only:

```text
REMOTE VERIFIED COMPLETE — SPRUE FINAL CLOSURE
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
PARTIALLY COMPLETE
BLOCKED
```

---
# Article 01 — Repository Root Binding and Path Truth

## Goal

Guarantee Codex edits the exact checkout that will be pushed, despite working from the nested `mold` directory.

## Loop 01

### Observe — Repository Grounding

- The repository root contains `mold/`, `Execution/`, and `.github/`.
- The user may run Codex from `.../mold-saas/mold` while `.git` is one level above.

### Model — Required Change

- Resolve `$RepoRoot = git rev-parse --show-toplevel` before reading or editing.
- Derive `$MoldRoot`, `$FrontendRoot`, `$ExecutionRoot` from `$RepoRoot`; never hard-code them as authority.
- Record CWD, root, branch, HEAD, origin/main, remote URL, dirty state.
- Never run `git init` inside `mold`; never create nested `.git`.
- Preserve dirty user work; no destructive reset or clean.

### Falsify — Harness Requirements

- `git -C $RepoRoot ls-files mold/frontend/package.json` returns the tracked file.
- `git -C $RepoRoot ls-files "Execution/Craft Execution 10/Craft Execution 10.md"` resolves.
- Remote is the intended Craft repository.
- Local HEAD/origin-main relation is documented.

### Execute — Command Discipline

```powershell
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git status --short
git remote -v
git fetch origin
git rev-parse origin/main
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** The coding agent can prove the shell CWD, Git root, tracked project path, and push target are the same project context.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 02 — Evidence Ledger and Anti-Hallucination Context Pack

## Goal

Turn the current repository into a finite, falsifiable set of gaps before editing.

## Loop 02

### Observe — Repository Grounding

- Execution 10 report claims are not authority; final code/tests/logs are authority.
- Current browser Sprue spec calls a direct derived-engine probe and proves cache behavior, not coordinator behavior.

### Model — Required Change

- Read current store, scheduler tests, worker client, Registration, cutting workflow, segmentation, viewport Sprue runtimes, E2E specs/probes, package.json, Vite config, CI.
- Classify every finding as CONFIRMED_CODE, CONFIRMED_TEST, CONFIRMED_BROWSER, CONFIRMED_REMOTE, INFERRED_RISK, UNKNOWN, or BLOCKED.
- Create an Execution 11 Gap Ledger before code edits.
- Assign a minimum proof level L0–L6 to every gap.

### Falsify — Harness Requirements

- No gap is implemented from an INFERRED_RISK without reproduction or architecture proof.
- Every CLOSED claim later maps to a code path and test/proof.

### Execute — Command Discipline

```powershell
git diff 042d4011a77c2f7ceb3813def23a97da59dd961f..HEAD --stat
git diff 042d4011a77c2f7ceb3813def23a97da59dd961f..HEAD -- mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** A complete ledger exists and no implementation assumption depends on hidden chat context.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 03 — Five-Truth State Model

## Goal

Prevent fixes in one layer from corrupting authoritative geometry, presentation, execution, or history truth.

## Loop 03

### Observe — Repository Grounding

- Craft distinguishes MoldDocument intent, derived FinalMoldResult, presentation selectors, closure-owned scheduler state, and Undo/Redo snapshots.

### Model — Required Change

- Document five truths: authoritative intent, derived manufacturing truth, presentation truth, execution-resource truth, history truth.
- Define truth tables for stable, pending, active+pending, stale success, stale failure, current failure, current success, topology invalidation, Undo/Redo, model replacement.
- Identify contradictions such as generating-without-owner or Registration-generating after terminal failure.
- Create a test-only invariant checker for SplitFaceState after critical transitions.

### Falsify — Harness Requirements

- `sprueStatus=generating` implies a current evaluating lifecycle.
- Current committed result identity matches document.
- Failed/superseded bursts do not create history.
- Pending presentation never becomes manufacturing/export truth.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Every lifecycle state can be described without contradictory authority, derived, presentation, execution, or history claims.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 04 — Cross-System Scheduler Teardown Matrix

## Goal

Prove every authoritative upstream mutation kills active+pending obsolete Sprue work without deleting durable intent incorrectly.

## Loop 04

### Observe — Repository Grounding

- Current code has `cancelSprueScheduler`, but Execution 10 added only limited new tests.

### Model — Required Change

- Classify setClearanceMm, update/commit clearance edit, toggleFace, removeSplitFace, removeSplitFaceAndRebuild, clearSelection, ordinary commitPlaneDrag, extension-plane mutations, orientation/model replacement, segmentation adoption/promotion, canonical geometry replacement, Undo/Redo.
- For every execution-invalidating path, test A active + B pending + upstream mutation + late A completion.
- Keep scheduler teardown separate from domain invalidation policy.
- Audit effectful cancellation called from Zustand producers; refactor only if re-entrancy/order risk is proven.

### Falsify — Harness Requirements

- B never starts after upstream replacement.
- A late success/failure/progress writes nothing.
- sprueStatus cannot remain ghost-generating.
- No Sprue history commit is created.
- Durable Sprue intent follows existing per-mutation policy.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Every authoritative mutation is classified and has active+pending teardown proof.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 05 — Atomic Failure Rollback and Failure Provenance

## Goal

Close the entire current-failure matrix, not only main-diameter resize.

## Loop 05

### Observe — Repository Grounding

- Current `rollbackFailedSprueCycle` restores sprues, definitions, registration, document, and lastCommittedResult for a captured base.

### Model — Required Change

- Test FIRST_CREATE_FAILURE, MAIN_DIAMETER_FAILURE, ENTRY_NECK_FAILURE, MOVE_FAILURE, FINAL_BURST_FAILURE, SPRUE_STAGE_FAILURE, REGISTRATION_STAGE_FAILURE, STALE_FAILURE, CANCELLED_FAILURE.
- Inject deterministic failures at different derived stages.
- Define whether evaluation describes current authoritative state or last attempted operation; do not leave ambiguous semantics.
- Use existing error channel for attempt failure unless a new state field is proven necessary.

### Falsify — Harness Requirements

- Registration never remains generating after current failure.
- Active mold bodies follow rollback policy.
- Failed provisional manufacturing intent does not survive.
- History delta is zero.
- Immediate retry succeeds.
- Stale failure writes nothing.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Every current failure class leaves one coherent manufacturing truth and a usable retry path.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 06 — History Coalescing as a Burst Transaction

## Goal

Prove latest-wins behaves as one user transaction to Undo/Redo across success, failure, teardown, and retry.

## Loop 06

### Observe — Repository Grounding

- Current scheduler uses a single `sprueHistoryBase` per burst.

### Model — Required Change

- Test 1 edit success, 20/100 edit burst success, superseded intermediate intents, stale result, final failure, upstream invalidation, Undo while active, Redo while active, failure then later success.
- Verify failed burst base cannot leak into the next independent successful burst.

### Falsify — Harness Requirements

- Successful burst = exactly +1 undo.
- Failed burst = +0.
- Superseded = +0.
- Undo after success returns pre-burst resolved state.
- Failure then success uses a fresh base.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** History algebra is consistent for all burst lifecycle outcomes.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 07 — Progress Identity and Non-Final Stale Writes

## Goal

Apply freshness rules to progress and intermediate events, not only final success/failure.

## Loop 07

### Observe — Repository Grounding

- Worker-client responses are requestId-scoped, but store-visible progress ownership must be proven.

### Model — Required Change

- Create stale-progress scenarios A active -> B current -> late A progress.
- Create upstream teardown -> late A progress.
- Use existing requestId/revision/fingerprint identity; add no duplicate epoch.

### Falsify — Harness Requirements

- B evaluation identity/stage/progress cannot be overwritten by A.
- Teardown cannot resurrect generating/progress state.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Success, failure, cancellation, and progress obey one freshness ownership model.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 08 — Derived-Evaluation Runner Ownership

## Goal

Resolve the module-global runner risk by evidence or narrow repair, preserving persistent Worker reuse.

## Loop 08

### Observe — Repository Grounding

- `runDerivedMoldEvaluation = createDerivedMoldEvaluationRunner()` is module-global and each run cancels the runner’s prior active request.
- SplitFace scheduler itself is per-store.

### Model — Required Change

- Map every production SplitFace store creation and lifetime.
- Determine whether more than one live production store can share the default runner concurrently.
- If single live default owner is proven, do not refactor; document architecture evidence.
- If multiple live owners are proven, give each independent owner an independent runner while keeping one persistent Worker per owner, not per edit.

### Falsify — Harness Requirements

- If multi-owner: store A cannot cancel store B, and vice versa.
- Normal singleton path does not increase Worker creation count.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Runner ownership risk is CLOSED BY ARCHITECTURE EVIDENCE or CLOSED BY TESTED REPAIR.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 09 — Browser Evidence Architecture — Cache vs Coordinator

## Goal

Preserve the real cache proof while adding a separate production-store coordinator proof.

## Loop 09

### Observe — Repository Grounding

- Current `sprueLatestWins.spec.ts` invokes a probe that calls `evaluateDerivedMold` directly three times and counts SprueGenerationService calls.

### Model — Required Change

- Keep the existing cache proof.
- Rename misleading descriptions if necessary.
- Add a new E2E-only production-store lifecycle probe using `createSplitFaceStoreCreator` and real production Worker/Manifold/Registration.
- A counting wrapper may delegate to the real runner; it may not fabricate results.

### Falsify — Harness Requirements

- Normal production build excludes the new probe.
- E2E build includes it.
- Page errors = 0; console errors = 0.

### Execute — Command Discipline

```powershell
npm run build
npm run build:e2e
npm run e2e
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Cache correctness and coordinator correctness have separate truthful browser proofs.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 10 — Real Chromium First-Create Lifecycle

## Goal

Prove valid Sprue Create is immediately accepted and ultimately commits through the real production store.

## Loop 10

### Observe — Repository Grounding

- Execution 11 requires store-level browser lifecycle proof, not a direct engine call.

### Model — Required Change

- Build deterministic valid mold and real cavity in Chromium.
- Call `createSprue(validPlacement)` on a real store.
- Measure acceptance separately from final completion.
- Await observable state, not arbitrary sleeps.

### Falsify — Harness Requirements

- Action acceptance true.
- Pending definition visible before final completion when work remains active.
- Final resolved Sprue exists.
- Registration terminal/current.
- Final result identity matches current document.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Chromium proves first Create acceptance and completion through production ownership.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 11 — Real Chromium Main-Diameter Resize

## Goal

Close the real-browser proof for upper/main diameter lifecycle.

## Loop 11

### Observe — Repository Grounding

- Current unit-level pending precedence exists, but no Chromium production-store resize proof exists.

### Model — Required Change

- Start from a real resolved Sprue.
- Call `resizeSprue` through the store.
- Observe pending requested diameter before final commit.
- Measure acceptance and completion.

### Falsify — Harness Requirements

- Stale resolved profile does not win during pending.
- Final resolved main diameter equals normalized requested value.
- Registration/current result coherent.
- History delta correct.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Main-diameter resize is proven in real Chromium through the product store.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 12 — Entry-Neck Resize Success and Failure Symmetry

## Goal

Give lower/entry-neck resize the same proof quality as main diameter.

## Loop 12

### Observe — Repository Grounding

- Entry-neck has its own normalization and `entry <= main` constraint.

### Model — Required Change

- Add Chromium success scenario using `resizeSprueEntryNeck`.
- Add deterministic current-failure rollback test.
- Verify normalization and coupling.

### Falsify — Harness Requirements

- Pending entry value is current intent.
- Main diameter remains coherent.
- Final entry value resolves correctly.
- Failure restores old entry geometry, Registration, history, and retry ability.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Lower opening has symmetric success/failure lifecycle proof.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 13 — Move-Sprue Failure Closure

## Goal

Prove position changes share the same rollback transaction semantics.

## Loop 13

### Observe — Repository Grounding

- `moveSprue` is geometry-changing and marks validation pending.

### Model — Required Change

- Resolved Sprue -> move accepted -> pending position -> inject current failure.
- Reuse shared rollback path; do not add move-specific state duplication.

### Falsify — Harness Requirements

- Old position/resolved geometry restored.
- Registration/final result restored.
- History unchanged.
- Error visible.
- Retry accepted.
- Stale move failure cannot clobber a newer edit.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Move shares proven transaction semantics with diameter changes.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 14 — Failed First-Create Truth

## Goal

Ensure a failed first Sprue Create leaves no fake manufacturing Sprue when there is no prior resolved geometry.

## Loop 14

### Observe — Repository Grounding

- First-create rollback differs from resize because there is no previous Sprue to restore.

### Model — Required Change

- Create valid mold+cavity with zero Sprues.
- Accept Create, then inject current Sprue/Registration failure.
- Prefer returning manufacturing truth to zero Sprues; if retaining an invalid marker, prove it is presentation-only.

### Falsify — Harness Requirements

- No resolved Sprue.
- No FinalMoldResult claims failed Sprue.
- Registration restored to pre-create truth.
- History unchanged.
- sprueStatus idle.
- Next Create accepted.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Failed first Create cannot become durable manufacturing truth.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 15 — Real Chromium Latest-Wins Burst

## Goal

Prove real rapid edits coalesce to one active + one final pending evaluation in the browser.

## Loop 15

### Observe — Repository Grounding

- Vitest already proves 100-edit coalescing structurally; browser coordinator proof is missing.

### Model — Required Change

- Start from a real resolved Sprue.
- Issue 20 rapid valid resizes without awaiting final completion; prefer 50 if deterministic.
- Count real runner dispatches with a thin delegating wrapper.
- Record acceptance and final completion.

### Falsify — Harness Requirements

- All valid intents accepted.
- Derived dispatch count <= 2.
- Final resolved value equals last requested value.
- Stale authoritative commit count = 0.
- History delta = 1.
- Registration current.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Real Chromium proves the exact production latest-wins coordinator contract.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 16 — Deterministic Interaction-Sequence Harness

## Goal

Catch order-dependent cross-system bugs that isolated tests miss, without adding a generic fuzz framework.

## Loop 16

### Observe — Repository Grounding

- Sprue interacts with topology, scale, model replacement, history, and Segmentation.

### Model — Required Change

- Create curated deterministic sequences: resize->scale->late success; resize->resize->Undo; create->failure->retry; resize->entry->move->final failure; resize->topology edit; resize->segmentation promotion; scale->rebuild->retry.
- Run the state invariant checker after each action boundary.
- Optional fixed-seed sequence generation is allowed only if failures print the exact seed and sequence.

### Falsify — Harness Requirements

- No contradictory state.
- No stale commit.
- No ghost busy.
- No history leakage.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Representative action reorderings preserve global invariants.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 17 — Historical Benchmark Recovery With Worktree Isolation

## Goal

Recover the missing historical performance evidence without contaminating baseline commits.

## Loop 17

### Observe — Repository Grounding

- Execution 10 required historical comparison but no performance report exists.

### Model — Required Change

- Create throwaway worktrees outside repo root for `081ef3...`, `042d4011...`, actual Execution 11 start, and final candidate as needed.
- Use one semantic benchmark driver across refs.
- Allow import/field adapters only; never copy final scheduler/cache fixes into baseline.
- Record adapter differences.

### Falsify — Harness Requirements

- Same machine, browser, build mode, fixture, sample policy across compared SHAs.
- Historical worktrees remain unmodified except test-only external instrumentation.

### Execute — Command Discipline

```powershell
git worktree add <outside-path> 081ef3a94db3dd3f7d58e3283d5a238603e4655c
git worktree add <outside-path> 042d4011a77c2f7ceb3813def23a97da59dd961f
git worktree list
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Historical timings are reproducible and measure equivalent workloads.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 18 — Deterministic Performance Fixture Matrix

## Goal

Measure performance by objective geometry complexity, Sprue count, and scenario, not subjective labels.

## Loop 18

### Observe — Repository Grounding

- Current closure requires small/medium/large and 1/3 Sprue evidence.

### Model — Required Change

- Define SMALL, MEDIUM, LARGE deterministic watertight fixtures with triangle count, bounds, source signature.
- Measure each with 1 Sprue and 3 Sprues.
- Scenarios: cold Create, warm Create, warm main resize, warm entry resize, 3-edit burst, 20-edit burst, tool deactivate/reactivate.
- Separate Class A acceptance from Class B final completion.

### Falsify — Harness Requirements

- Fixture validity recorded.
- Same fixture definitions used across SHAs.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** The matrix explains both user-perceived responsiveness and derived geometry cost.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 19 — Performance Statistics and Noise Discipline

## Goal

Produce defensible p50/p95 evidence rather than decorative timing numbers.

## Loop 19

### Observe — Repository Grounding

- p95 requires meaningful sample count and same-environment comparison.

### Model — Required Change

- Class A: n>=50 for primary scenarios, report min/p50/p95/max.
- Class B: n>=20 for small/medium primary scenarios. Large may use n>=10 only with explicit limitation and no overstated p95.
- Record OS, CPU, RAM, Node, npm, browser/version, exact SHA, power mode if available, build mode, fixture details.
- Warm up and repeat one baseline scenario after final to detect environmental drift.
- Use one documented percentile method.

### Falsify — Harness Requirements

- No baseline/final comparison across different machines.
- No cherry-picked run.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Statistics are reproducible, honest, and sample-supported.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 20 — Structural Performance Counters

## Goal

Explain why latency changes by counting expensive work, not only measuring elapsed time.

## Loop 20

### Observe — Repository Grounding

- Execution 08–10 introduced RAF coalescing, latest-wins, cache reuse, edge caching, reference-mold identity.

### Model — Required Change

- Collect test/benchmark-only counters: raw pointer events, expensive placement updates, derived dispatches, Sprue generate calls, Registration runs, Reference Mold rebuilds, EdgesGeometry constructions, history entries, stale commits, queued-old starts, Worker creations.
- Keep instrumentation out of production unless an existing diagnostic boundary already owns it.

### Falsify — Harness Requirements

- Many pointer events/frame -> <=1 expensive update.
- N rapid Sprue intents -> <=2 evaluations.
- Warm tool reactivation -> 0 new EdgesGeometry.
- Pending profile-only edit -> 0 unnecessary full mold rebuild.
- Stale result -> 0 commits.
- Upstream teardown -> 0 queued old starts.
- Successful burst -> +1 history; failed burst -> +0.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Performance evidence is mechanically explainable and regression-sensitive.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 21 — Moderate-Severity Security Gate

## Goal

Turn the currently clean dependency tree into a maintained moderate-severity CI policy.

## Loop 21

### Observe — Repository Grounding

- Current CI uses `npm audit --audit-level=high`; PR dependency review uses `fail-on-severity: high`; current npm state is 0 vulnerabilities.

### Model — Required Change

- Run clean local audit including moderate.
- Change frontend CI audit to `npm audit --audit-level=moderate`.
- Prefer dependency-review `fail-on-severity: moderate` unless a repository-supported reason blocks it.
- Keep explicit Quality Gate event matrix intact.

### Falsify — Harness Requirements

- Local `npm audit --audit-level=moderate` passes.
- Remote Frontend log shows moderate audit command.
- PR dependency-review config reflects intended severity.

### Execute — Command Discipline

```powershell
npm ci
npm audit
npm audit --audit-level=moderate
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** The same moderate advisory class previously repaired cannot silently return.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 22 — Production Artifact and Bundle Invariant

## Goal

Add heavy test infrastructure without shipping it or weakening established bundle budgets.

## Loop 22

### Observe — Repository Grounding

- Normal build currently excludes E2E harness; E2E mode includes it; bundle budgets are explicit.

### Model — Required Change

- Ensure new lifecycle probe is E2E-only.
- Run production and E2E builds from clean dist.
- Extend artifact verification only if necessary.
- Never raise 410/575 kB budgets solely for Execution 11.

### Falsify — Harness Requirements

- Normal dist has no e2e-harness and no test-only Sprue lifecycle probe.
- E2E dist has required harness.
- Bundle budget passes unchanged.

### Execute — Command Discipline

```powershell
npm run build
npm run build:e2e
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Test infrastructure cannot leak into normal production.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 23 — Cross-System Regression Rings

## Goal

Protect Cavity, Registration, topology editing, Segmentation, and Viewport from a locally correct Sprue fix.

## Loop 23

### Observe — Repository Grounding

- Final authority order remains Cavity -> Sprue -> Registration.

### Model — Required Change

- Ring 1: Sprue local create/resize/move/remove/cache/latest-wins/failure/history.
- Ring 2: Cavity, Registration, Worker, MoldDocument identity.
- Ring 3: Cut by Face, Mold Scale, Segmentation promotion/replan, model/orientation replacement.
- Ring 4: Reference Mold, Sprue pending proxy, edge cache, body visibility.
- For each changed production file, run all affected inward rings.

### Falsify — Harness Requirements

- Existing real Cavity browser proof preserved.
- Registration lifecycle green.
- Mold Scale green.
- Cut by Face remove/rebuild green.
- Segmentation lifecycle green.
- Viewport and reference mold identity green.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** No coupled subsystem regresses.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 24 — Test Authority and Anti-Compatibility-Shell Discipline

## Goal

Ensure old tests do not force preservation of obsolete defective behavior.

## Loop 24

### Observe — Repository Grounding

- Some older tests can encode behavior that the new architecture intentionally supersedes.

### Model — Required Change

- When a test fails after a principled fix, determine whether it proves a real current invariant or the old defect.
- If stale, replace the expectation with a stronger current-contract test.
- Do not add compatibility shells only to keep an obsolete test green.

### Falsify — Harness Requirements

- No unrelated assertion weakened.
- New test is stricter than removed stale expectation.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** The suite validates current architecture rather than legacy defects.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 25 — Targeted Mutation Sensitivity Audit

## Goal

Prove critical new tests would actually catch the regressions they claim to guard.

## Loop 25

### Observe — Repository Grounding

- A green suite can be insensitive to the target bug.

### Model — Required Change

- Temporarily remove one critical guard at a time locally: scale teardown, Registration rollback, busy-reject ban, pending precedence, one-history burst, browser store coordinator path.
- Confirm intended tests fail.
- Revert each temporary mutation immediately.
- Record guard -> mutation -> failing test in report.

### Falsify — Harness Requirements

- Each critical guard has at least one mutation-sensitive test.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** The harness is demonstrably sensitive to the important regressions.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 26 — Full Local Harness Gate

## Goal

Run all local quality systems only after targeted closure, and verify semantic test discovery.

## Loop 26

### Observe — Repository Grounding

- Current baseline is 1108 Vitest passes, 3 Playwright passes, Python quality green; final counts should increase legitimately.

### Model — Required Change

- Run frontend full harness from resolved `$FrontendRoot`.
- Run Python harness from `$MoldRoot`.
- Run repository integrity from `$RepoRoot`.
- Inspect Playwright output for semantic scenarios; do not accept “3/3” old browser suite as sufficient.

### Falsify — Harness Requirements

- npm audit moderate clean.
- typecheck/lint/build/test green.
- build:e2e/e2e green.
- Ruff/format/pytest green.
- git diff --check green.
- No new mandatory test skipped.

### Execute — Command Discipline

```powershell
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run build:e2e
npm run e2e
ruff check .
ruff format --check .
pytest
git diff --check
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** All local correctness, browser, security, artifact, performance, and repository gates are complete.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 27 — User-Authorized Push and Exact-SHA Remote Verification

## Goal

Prevent local success, parent-SHA green runs, or missing test discovery from being reported as remote closure.

## Loop 27

### Observe — Repository Grounding

- Current project already has an explicit Quality Gate; exact-SHA verification is required.

### Model — Required Change

- Do not push without explicit user authorization.
- After push, record exact SHA.
- Find GitHub Actions run with exactly that head_sha.
- Inspect jobs and logs, not only conclusion.
- Verify new browser lifecycle tests appear in remote log.
- Verify moderate audit command appears in Frontend log.

### Falsify — Harness Requirements

- Python, Frontend, Browser, Repository Integrity, Quality Gate success.
- Dependency Review result matches event.
- New E2E semantics actually ran.

### Execute — Command Discipline

```powershell
git rev-parse HEAD
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** The exact final pushed SHA is green and remote logs prove the new evidence ran.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 28 — Proof-Carrying Final Reports

## Goal

Make Execution 11 independently auditable from repository artifacts without requiring chat history.

## Loop 28

### Observe — Repository Grounding

- Execution 10 lacked the required final report and performance report.

### Model — Required Change

- Create `Execution/Craft Execution 11/Craft Execution 11 Report.md`.
- Create `Execution/Craft Execution 11/Craft Execution 11 Performance.md`.
- For each gap include before defect, code change, test, proof level, browser/remote evidence, status.
- Include path binding, SHA, changed files, scheduler matrix, failure matrix, runner map, browser matrix, benchmark method/tables, structural counters, security, full harness, remote exact-SHA, mutation sensitivity, controlled warnings.

### Falsify — Harness Requirements

- Every CLOSED row has direct evidence.
- No invented benchmark values.
- No copied old counts without rerun.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Another engineer can audit closure from repository files alone.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 29 — Final Adversarial Re-Audit

## Goal

Red-team the final exact-SHA code and evidence after remote green before allowing closure language.

## Loop 29

### Observe — Repository Grounding

- Remote green can still miss an untested contract or a misleading test.

### Model — Required Change

- Re-answer: ghost generating? queued old work? stale success/failure/progress? Registration leak? failed first Create? wrong active bodies? history leakage? retry? runner cross-store cancellation? browser coordinator actually store-owned? upper/lower both tested? benchmark SHAs truthful? p95 meaningful? moderate security gate real? E2E probe production leak? bundle/Worker/geometry quality preserved?
- Any uncertain answer returns to the relevant loop.
- No unrelated cleanup in this final pass.

### Falsify — Harness Requirements

- Manual final diff classification: required implementation/test/harness/report/CI only.

### Execute — Command Discipline

```powershell
git diff --check
git status --short
```

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Every mandatory question has repository or log evidence.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---

# Article 30 — Closure Stop Rule

## Goal

Stop once all required invariants are closed so success does not turn into an uncontrolled refactor.

## Loop 30

### Observe — Repository Grounding

- Overengineering after proof increases architectural risk.

### Model — Required Change

- Ask whether any proposed next change closes an open Execution 11 invariant. If no, do not make it.
- Preserve exact green candidate.
- Do not reopen controlled Manifold node:module warning absent new runtime evidence.

### Falsify — Harness Requirements

- No new harness beyond the stated stop rule; this article is a control boundary.

### Execute — Command Discipline

Use repository-native commands and targeted tests discovered from current scripts. Do not invent new command names.

### Inspect — Diff and Architecture Discipline

- Before leaving this loop, inspect the exact diff created by this article.
- Every production edit must name the authoritative owner it changes and the coupled systems it can affect.
- Do not add a parallel state owner, freshness epoch, generic queue framework, or compatibility shell unless a proven invariant requires it.
- If the change creates more state than it removes, explain why the added state is necessary and how it is bounded/disposed.

### Loop Exit

**PASS only when:** Print the permitted final decision and stop.

If this cannot be proven, remain in this loop or report `BLOCKED` / `PARTIALLY COMPLETE` as appropriate.

---
# Appendix A — Proof Levels

```text
L0 = static/code inspection
L1 = deterministic unit test
L2 = store/state-machine integration
L3 = real Worker/derived-engine integration
L4 = real Chromium production-store proof
L5 = historical performance experiment
L6 = exact-SHA GitHub Actions verification
```

A lower level may supplement but cannot replace a higher level explicitly required by the contract.

---

# Appendix B — Mandatory Upstream Mutation Matrix

| Mutation | Geometry/input authority changes? | Must terminate active Sprue cycle? | Durable Sprue intent policy | Resolved Sprue policy | Minimum proof |
|---|---:|---:|---|---|---|
| `setClearanceMm` | Yes | Yes | Preserve/demote by Mold Scale policy | Invalidate | L2 |
| `updateClearanceEdit` | Yes when value changes | Yes | Preserve/demote | Invalidate | L2 |
| `commitClearanceEdit` | Inspect current owner | Classify | Existing policy | Existing policy | L2 |
| `toggleFace` | Yes | Yes | Clear per Cut-by-Face policy | Clear | L2 |
| ordinary `removeSplitFace` | Yes | Yes | Clear per current policy | Clear | L2 |
| segmentation-extension `removeSplitFace` | Document-neutral marker if current architecture says so | No | Preserve | Preserve | L2 |
| `removeSplitFaceAndRebuild` | Yes | Yes | Existing rebuild policy | Recompute | L2/L3 |
| `clearSelection` | Yes | Yes | Clear | Clear | L2 |
| ordinary `commitPlaneDrag` | Yes | Yes | Existing invalidation | Clear | L2 |
| segmentation-extension drag | Document-neutral marker | No if proven | Preserve | Preserve | L2 |
| `clearForOrientationChange` | Yes | Yes | Reset policy | Clear | L2 |
| `clearForModelReplacement` | Yes | Yes | Clear | Clear | L2 |
| `setCanonicalPartGeometrySignature` | Inspect live code | Classify | Explicit | Explicit | L2 |
| `adoptCommittedSegmentationResult` | Yes | Yes | Preserve intent pending if current contract | Clear | L2 |
| `promoteReplannedSegmentationResult` | Yes when accepted | Yes | Preserve intent pending | Clear | L2 |
| `undo` | Yes | Yes | Snapshot truth | Snapshot truth | L2 |
| `redo` | Yes | Yes | Snapshot truth | Snapshot truth | L2 |

Final report may refine the policy based on live code, but no row may remain unclassified.

---

# Appendix C — Mandatory Failure Matrix

| Operation | Prior resolved Sprue? | Failure stage | Expected durable state | History delta | Immediate retry |
|---|---:|---|---|---:|---:|
| First Create | No | Sprue | Pre-create truth | 0 | Yes |
| First Create | No | Registration | Pre-create truth | 0 | Yes |
| Main resize | Yes | Sprue | Pre-burst resolved | 0 | Yes |
| Main resize | Yes | Registration | Pre-burst resolved | 0 | Yes |
| Entry resize | Yes | Sprue | Pre-burst resolved | 0 | Yes |
| Entry resize | Yes | Registration | Pre-burst resolved | 0 | Yes |
| Move | Yes | Sprue | Pre-burst resolved | 0 | Yes |
| Move | Yes | Registration | Pre-burst resolved | 0 | Yes |
| Final request in burst | Yes | Sprue | Pre-burst resolved | 0 | Yes |
| Final request in burst | Yes | Registration | Pre-burst resolved | 0 | Yes |
| Stale old request | Any | Any | No authoritative write | 0 | N/A |

Every row must assert Registration truth, document identity, lastCommittedResult truth, active mold-body truth, scheduler state, error truth, and history.

---

# Appendix D — Mandatory Browser Proof Matrix

| Proof | Production store required? | Real Worker | Real Manifold/WASM | Real Registration | Mandatory |
|---|---:|---:|---:|---:|---:|
| App smoke | No | N/A | N/A | N/A | Yes |
| Cavity Boolean | Production Worker path | Yes | Yes | N/A | Yes |
| Sprue cache | Direct engine acceptable | Real engine | Yes | Current probe behavior | Yes |
| Sprue first Create lifecycle | Yes | Yes | Yes | Yes | Yes |
| Main resize lifecycle | Yes | Yes | Yes | Yes | Yes |
| Entry-neck resize lifecycle | Yes | Yes | Yes | Yes | Yes |
| Latest-wins burst | Yes | Yes | Yes | Yes | Yes |
| Upstream invalidation overlap | Prefer L4 if deterministic | Yes | Yes | As applicable | L2 mandatory |

A browser test named “latest wins” that does not exercise store actions is not coordinator proof.

---

# Appendix E — Performance Matrix

Required references:

```text
081ef3a94db3dd3f7d58e3283d5a238603e4655c
042d4011a77c2f7ceb3813def23a97da59dd961f
actual Execution 11 starting SHA
final Execution 11 candidate SHA
```

Required fixture axes:

```text
SMALL / MEDIUM / LARGE
1 Sprue / 3 Sprues
```

Required scenarios:

```text
cold first Create
warm Create
warm main resize
warm entry-neck resize
3-edit burst
20-edit burst
unchanged tool deactivate/reactivate
```

Required latency classes:

```text
Class A — user-visible acceptance / pending state
Class B — final authoritative derived commit
```

Required report fields:

```text
SHA
fixture
triangle count
Sprue count
scenario
latency class
n
min
p50
p95 where meaningful
max
environment
```

No fabricated numbers. No cross-machine before/after comparison.

---

# Appendix F — Structural Performance Counter Matrix

| Scenario | Raw events | Expensive preview updates | Derived dispatches | Generate calls | Registration runs | Full mold rebuilds | Edge constructions | History delta | Stale commits | Old queued starts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| pointer burst / one frame | N | <=1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 20 resize burst | 20 | N/A | <=2 | dependency-driven | <=2 | bounded | 0 if geometry unchanged | +1 success | 0 | 0 |
| failed final burst | N | N/A | <=2 | dependency-driven | bounded | bounded | bounded | 0 | 0 | 0 |
| upstream invalidation active+pending | N/A | N/A | active may physically finish | no stale final | no stale final | policy | policy | 0 Sprue | 0 | 0 |
| warm tool reactivation | N/A | N/A | 0 | 0 | 0 | 0 | 0 new | 0 | 0 | 0 |

---

# Appendix G — No-Shortcut Constitution

Forbidden:

```text
lowering Sprue circular segments
lowering Cavity quality
weakening geometry tolerance
skipping inlet validation
skipping cavity-reach validation
skipping Registration
using pending display proxy as export geometry
restoring busy-reject
unbounded request queue
new Worker per resize
new Worker per Sprue
Worker termination per ordinary supersession
second persistent Sprue store
second freshness epoch system
timestamp freshness disconnected from MoldDocument
arbitrary debounce milliseconds
arbitrary sleeps in race tests
mock Manifold in real-browser proof
fake Worker success in browser lifecycle proof
direct evaluateDerivedMold presented as coordinator proof
full mesh hash every React render
global Three.js monkey patch
global console-error suppression
warning suppression
@ts-ignore used to bypass lifecycle typing
new eslint-disable used to hide a real problem
continue-on-error
|| true
npm audit fix --force
raising bundle budgets solely to pass
committing dist/
committing Playwright reports
committing benchmark worktrees
force push
git reset --hard
git clean -fd on user work
nested git init
unrelated product features
generic architecture rewrite
compatibility shell preserving a proven obsolete path
```

---

# Appendix H — Useful Complexity Test

Before adding any abstraction, answer:

```text
Which confirmed defect or ambiguity does it remove?
Which duplicated owner does it eliminate?
Which invariant becomes easier to prove?
Which test becomes simpler or stronger?
What existing code/state can be deleted or simplified because of it?
```

If the answers are weak, do not add the abstraction.

Potentially useful complexity:

```text
one narrow Sprue-cycle teardown owner
one scoped rollback snapshot type
one production-store browser lifecycle probe
one reusable state invariant checker
one portable benchmark driver
one test-only structural counter collector
```

Likely useless complexity for this Execution:

```text
generic event bus
generic queue framework
new state-management library
new worker-orchestration package
generic transaction engine
new caching framework
telemetry backend
new domain layer unrelated to closure
```

---

# Appendix I — Agent Silence and Output Discipline

During normal execution:

```text
Do not praise.
Do not apologize for complexity.
Do not narrate each file read.
Do not restate this document.
Do not ask for repository facts available through Git.
Do not announce “I will now...”.
Do not claim confidence without proof.
```

When blocked:

```text
BLOCKED
Evidence:
Required external input:
Why repository inspection cannot resolve it:
```

When a real irreversible decision is required:

```text
DECISION REQUIRED
Evidence:
Option A:
Option B:
Consequence:
```

At local completion:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

At partial completion:

```text
PARTIALLY COMPLETE
Open mandatory items:
```

At exact-SHA remote closure:

```text
REMOTE VERIFIED COMPLETE — SPRUE FINAL CLOSURE
```

---

# Appendix J — Final Definition of Done

- [ ] Git root resolved from actual Codex working directory
- [ ] No nested repository created
- [ ] Exact starting SHA recorded
- [ ] Current gaps independently re-audited
- [ ] Evidence ledger created before code edits
- [ ] Five-truth model documented
- [ ] Every authoritative upstream mutation classified
- [ ] Active+pending teardown tested for every invalidating mutation
- [ ] Ghost generating state impossible
- [ ] No old pending job starts after upstream replacement
- [ ] Stale success cannot commit
- [ ] Stale failure cannot clobber
- [ ] Stale progress cannot clobber
- [ ] Main resize current-failure rollback proven
- [ ] Entry-neck current-failure rollback proven
- [ ] Move current-failure rollback proven
- [ ] First Create current-failure rollback proven
- [ ] Registration-stage failure rollback proven
- [ ] Failed final burst rollback proven
- [ ] Failed burst history delta = 0
- [ ] Successful burst history delta = 1
- [ ] Failure -> retry works immediately
- [ ] Failure -> later success uses fresh history base
- [ ] Active mold-body presentation follows rollback policy
- [ ] Failure provenance/evaluation semantics resolved
- [ ] Runner ownership map completed
- [ ] Module-global runner risk closed by evidence or repair
- [ ] Persistent Worker reuse preserved
- [ ] Existing Sprue cache browser proof preserved
- [ ] Existing Cavity browser proof preserved
- [ ] Real browser first Create through production store added
- [ ] Real browser main resize through production store added
- [ ] Real browser entry-neck resize through production store added
- [ ] Real browser latest-wins burst through production store added
- [ ] Browser burst dispatch count <=2
- [ ] Browser final value equals latest requested value
- [ ] Browser successful burst history delta =1
- [ ] Browser page errors =0
- [ ] Browser console errors =0
- [ ] Historical benchmark worktrees use declared SHAs
- [ ] 081ef3 historical comparison produced
- [ ] 042d4011 comparison produced
- [ ] Actual Execution 11 start -> final comparison produced
- [ ] Small fixture measured
- [ ] Medium fixture measured
- [ ] Large fixture measured
- [ ] 1-Sprue matrix measured
- [ ] 3-Sprue matrix measured
- [ ] Acceptance separated from completion
- [ ] p50 produced
- [ ] p95 produced where sample-supported
- [ ] min/max produced
- [ ] environment recorded
- [ ] structural dispatch count recorded
- [ ] structural generation count recorded
- [ ] structural rebuild count recorded
- [ ] structural edge count recorded
- [ ] structural history count recorded
- [ ] stale commit count =0
- [ ] queued-after-teardown start count =0
- [ ] targeted mutation sensitivity audit performed
- [ ] npm audit clean
- [ ] npm audit --audit-level=moderate clean
- [ ] CI audit gate set to moderate
- [ ] PR dependency review moderate unless evidence blocks it
- [ ] typecheck passes
- [ ] lint passes
- [ ] production build passes
- [ ] production E2E-artifact isolation passes
- [ ] bundle budgets pass unchanged
- [ ] full Vitest passes
- [ ] E2E build passes
- [ ] full Playwright passes
- [ ] new browser lifecycle tests appear in local output
- [ ] Python Ruff passes
- [ ] Python format passes
- [ ] Python pytest passes
- [ ] git diff --check passes
- [ ] no transient benchmark artifacts tracked
- [ ] Craft Execution 11 Report exists
- [ ] Craft Execution 11 Performance report exists
- [ ] every CLOSED gap links to proof
- [ ] final diff manually classified
- [ ] no unrelated feature work
- [ ] user separately authorized push
- [ ] exact final pushed SHA recorded
- [ ] exact final SHA GitHub Actions completed
- [ ] Frontend remote success
- [ ] Browser remote success
- [ ] Python remote success
- [ ] Repository integrity remote success
- [ ] Quality Gate remote success
- [ ] Dependency Review result matches event policy
- [ ] remote Frontend logs show moderate audit ran
- [ ] remote Browser logs show new lifecycle tests ran
- [ ] remote Browser logs show zero failures
- [ ] remote Python logs show full suite
- [ ] final adversarial re-audit completed after remote green

If any mandatory checkbox is false, do not print remote-complete language.

---

# Appendix K — Final Instruction to Codex

Investigate first.

Resolve the real Git root first.

Read current code first.

Write failing proof before repair whenever the defect is reproducible.

Do not refactor speculative risk.

Do not optimize unmeasured work.

Do not use cancellation as correctness.

Do not use presentation state as manufacturing truth.

Do not allow failed provisional intent to become durable truth.

Do not allow a stale result to write any channel: success, failure, progress, history, Registration, or presentation ownership.

Do not call a cache test a coordinator test.

Do not call structural counts a latency benchmark.

Do not call local green remote green.

Do not call a parent SHA exact-SHA proof.

Do not call “0 vulnerabilities today” a maintained policy until CI enforces the intended severity.

Do not solve lifecycle bugs by adding parallel state.

Do not solve performance by lowering geometry quality.

Do not solve tests by weakening architecture.

Do not solve architecture by adding abstractions with no proven need.

Use the smallest change that closes the largest proven invariant.

Every change must carry proof.

Every proof must exercise the owner it claims to prove.

Every loop must end with a falsifiable exit condition.

When all mandatory local loops pass, stop and wait for user authorization before push.

When the exact final SHA is remotely green and the final adversarial re-audit is clean, print exactly:

```text
REMOTE VERIFIED COMPLETE — SPRUE FINAL CLOSURE
```

Then stop.
