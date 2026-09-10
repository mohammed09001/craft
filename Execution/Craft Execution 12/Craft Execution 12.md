# Craft — Execution 12

## System-of-Systems Closure: Interdependent Invariants, Failure Semantics, Runner Ownership, Performance Evidence, and Exact-SHA Remote Proof

**Repository:** `mohammed09001/craft`  
**GitHub state verified before this document was written:** `main` at `57b55a0a1594c780be21f7680813ed750ee030dc`  
**Last verified exact-SHA CI run:** GitHub Actions run `34352025569`, conclusion `success`  
**Execution 11 start SHA:** `6aeabcd57b255b6ded740996408f9664298b8339`  
**Historical performance refs retained:** `081ef3a94db3dd3f7d58e3283d5a238603e4655c`, `042d4011a77c2f7ceb3813def23a97da59dd961f`  
**Execution 12 audited starting baseline:** `57b55a0a1594c780be21f7680813ed750ee030dc`

---

# Operating Order to Codex

Execute. Do not narrate ordinary execution.

Craft is **not a collection of independent features**. It is a **system of interdependent systems**. A locally-correct edit can still be globally wrong if it changes authoritative state, invalidation timing, asynchronous ownership, derived geometry, history, presentation, Worker lifetime, cache identity, or downstream subsystem assumptions.

Treat every production edit as a change to a connected system.

The current remote baseline is green. Therefore:

- Green is the starting point, not proof that Execution 12 is complete.
- Do not rewrite working production code merely to satisfy this document.
- If a gap is an evidence gap, close it with proof, harnesses, reports, or stronger tests — not speculative refactoring.
- Only modify production code when a failing proof demonstrates a current contract violation.
- Never trade geometry correctness for latency.
- Never trade lifecycle correctness for cancellation behavior.
- Never trade authoritative truth for presentation convenience.
- Never add a second authoritative owner to repair the first.
- Never add a queue, epoch, cache, Worker owner, event bus, or history layer before tracing the current one.
- Never weaken tests, security gates, bundle budgets, artifact isolation, geometry validation, or Quality Gate semantics to obtain green.
- Never call structural counters a latency benchmark.
- Never call a cache test a production coordinator test.
- Never call a unit test a Chromium proof.
- Never call local green remote green.
- Never call a parent SHA exact-SHA proof.
- Never claim a performance improvement without equivalent before/after measurements.
- Never claim system safety because one feature test passed.

Execution 12 closes the remaining mandatory gaps without destabilizing the current green baseline.

---

# Execution Doctrine

## Repository Truth Over Prompt Assumption

The user may launch Codex from inside the tracked `mold` directory while the Git root is above it. Discover the real Git root. Never create a nested repository.

Run first:

```powershell
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git status --short
git remote -v
```

If the actual starting SHA differs from `57b55a0a1594c780be21f7680813ed750ee030dc`, record the actual SHA and compare it to this audited baseline before any edit.

Never run destructive cleanup against user work merely to obtain a clean status.

## System-of-Systems Rule

For every production change, identify:

1. authoritative state owner;
2. all writers;
3. all readers;
4. all derived outputs invalidated;
5. all asynchronous work that can outlive the state;
6. history that can restore the state;
7. presentation that can display it;
8. Worker/cache ownership affected;
9. coupled regression tests;
10. adjacent subsystems that can become inconsistent.

A production edit without this impact map is forbidden.

## Five-Truth Model

Maintain strict separation between:

- **User Intent Truth** — the latest requested action.
- **Authoritative Document Truth** — the durable current mold/cutting/sprue configuration.
- **Manufacturing Result Truth** — geometry that actually completed for the current document.
- **Execution Truth** — request identity, revision, fingerprint, pending/latest-wins, progress, failure, Worker ownership.
- **Presentation Truth** — what the Viewport/UI may display now.

A pending resize is intent and presentation truth. It is not manufacturing result truth until current evaluation commits.

A failed provisional edit must not enter durable history.

A stale result must not write success, failure, progress, Registration, geometry, history, error ownership, result ownership, or presentation ownership.

## Proof Before Repair

When a suspected defect is reproducible:

1. write the smallest failing proof against the real owner;
2. confirm it fails for the intended reason;
3. repair the smallest cause;
4. rerun targeted proof;
5. rerun coupled-system tests;
6. inspect exact diff;
7. run full harness.

When current code is already correct, close the invariant by adversarial evidence rather than refactoring.

## Hardness Discipline

Prefer solutions that are difficult to partially update, difficult to leave stale, difficult to misuse, bounded in lifetime, observable in tests, and reversible through the existing history model.

Do not add generic infrastructure when a narrower invariant repair is sufficient.

---

# Verified Starting Evidence

At the audited starting SHA:

- `splitFace.store.ts` owns selected faces, cutting planes, Split workflow, reference mold definition, Mold Scale clearance, Cavity state, canonical part signature, resolved Sprues, Sprue operation definitions, Registration, Mold document, evaluation state, last committed result, body visibility, Undo/Redo, and Segmentation regeneration count.
- The production derived-mold runner reuses one lazily-created Worker and exposes a module-level default runner with one active cancellation owner.
- The Execution 11 browser harness exercises the production SplitFace store for Sprue Create, main-diameter resize, entry-neck resize, and a rapid resize burst.
- The current browser lifecycle probe reports cumulative dispatch/history totals; it does not directly isolate burst dispatch and burst history deltas.
- Current CI enforces `npm audit --audit-level=moderate`, dependency review at `moderate`, exact Quality Gate result semantics, production/E2E artifact separation, explicit bundle budgets, frontend tests, browser tests, Python Ruff/pytest, and repository integrity.
- Exact-SHA run `34352025569` succeeded on `57b55a0a1594c780be21f7680813ed750ee030dc`.
- Execution 11 did not produce the required historical performance report, proof-carrying final report, full failure matrix, full upstream invalidation matrix, runner-ownership closure, or mutation-sensitivity evidence.

Execution 12 closes those gaps.

---

# Evidence Vocabulary

Use these exact classifications in the final reports:

- **CONFIRMED BUG** — reproducible current contract violation.
- **CONFIRMED REGRESSION** — current verified behavior is worse/broken relative to a verified good baseline.
- **ARCHITECTURE RISK** — plausible cross-system failure not yet proven.
- **EVIDENCE GAP** — behavior may be correct but mandatory proof does not exist.
- **CONTROLLED THIRD-PARTY WARNING** — warning outside Craft-owned code while real-browser proof remains green.
- **DESIGN DEBT** — non-blocking structure issue with no current contract failure.
- **CLOSED BY CODE + TEST** — confirmed bug repaired with proof.
- **CLOSED BY EVIDENCE** — no production edit required; adversarial proof closes invariant.
- **BLOCKED** — repository inspection cannot resolve without external input.
- **PARTIALLY COMPLETE** — at least one mandatory item remains open.

Do not upgrade a risk or evidence gap to a bug without reproduction.

---

# Mandatory Deliverables

By the end of Execution 12 the repository must contain:

1. `Execution/Craft Execution 12/Craft Execution 12 Report.md`
2. `Execution/Craft Execution 12/Craft Execution 12 Performance.md`

Benchmark scripts/harnesses may be added only when necessary, deterministic, test-only, and absent from normal production artifacts.

Do not commit raw benchmark output folders, temporary profiles, browser traces, external worktrees, machine-specific absolute paths, or mutation worktrees.

---

# Article 01 — Path, Git Root, and Exact-SHA Binding

## Goal

Bind all later claims to the actual repository and starting state.

## Loop 01

### Observe

The working directory can be inside `mold` while Git ownership is above it.

### Model

Discover Git root, working directory, branch, start SHA, remote, and dirty state. If user edits already exist, classify them before touching overlapping files.

### Falsify

Prove exactly one intended repository is used and no nested `.git` exists.

### Execute

Use Git discovery commands only. Do not `git init`, force reset, force clean, or globally restore user work.

### Inspect

Every benchmark, diff, report, and remote run must name an exact SHA.

### Loop Exit

PASS only when path binding and starting SHA are independently reproducible.

---

# Article 02 — Evidence Ledger Before Code

## Goal

Prevent speculative repair.

## Loop 02

### Observe

The branch is remote green; remaining gaps are primarily proof and coverage gaps.

### Model

Create a working evidence ledger in the final report with: requirement, current evidence, classification, proposed proof, production edit required?, coupled systems, final status.

### Falsify

No production file may be edited until the affected row is a CONFIRMED BUG or a necessary enabling change for a test-only proof.

### Execute

Inspect current tests and current owners first.

### Inspect

Every change must have one owner and one reason.

### Loop Exit

PASS only when every mandatory item has a falsifiable closure method.

---

# Article 03 — Authoritative System Map

## Goal

Model Craft as a connected system before editing stateful paths.

## Loop 03

### Observe

The SplitFace store already contains state from Cut by Face, reference mold, Mold Scale, Cavity, Sprue, Registration, document/evaluation, history, visibility, and Segmentation regeneration.

### Model

Build an ownership map for imported/canonical geometry, Cut by Face, Segmentation, Mold Scale/reference mold, Cavity, Sprue intent, resolved Sprue geometry, Registration, Mold document, evaluation identity, last committed result, body visibility, Undo/Redo, Viewport presentation, Worker runner/cache.

### Falsify

Search for duplicate durable owners or state that can diverge. Do not merge state unless inconsistency is reproduced.

### Execute

Use imports, store creator dependencies, selectors, public mutations, and tests.

### Inspect

The map must explain what happens if topology changes while Sprue work is active and pending.

### Loop Exit

PASS only when another engineer can trace an upstream mutation through all affected derived systems.

---

# Article 04 — Per-Change System Impact Contract

## Goal

Prevent a local repair from breaking an adjacent system.

## Loop 04

### Model

Before every production edit record:

```text
Change:
Confirmed defect:
Authoritative owner changed:
Other writers:
Readers:
Derived outputs invalidated:
Async work that can outlive state:
History effect:
Presentation effect:
Worker/cache effect:
Cross-system risks:
Targeted failing proof:
Coupled regression tests:
Why no smaller change is sufficient:
```

After the edit record actual diff and whether predicted impact matched reality.

### Falsify

Attempt to find one overlooked writer/reader before accepting the impact statement.

### Execute

If no production edit is necessary, record `NO PRODUCTION EDIT — EVIDENCE-ONLY CLOSURE`.

### Inspect

Added state must be justified, bounded, and disposed.

### Loop Exit

PASS only when every production diff is explainable as an invariant repair, not opportunistic cleanup.

---

# Article 05 — Default Derived-Runner Ownership

## Goal

Resolve the remaining module-level runner ownership risk without blind refactoring.

## Loop 05

### Observe

The current default derived runner is created once at module scope, reuses one Worker, and holds one active cancellation owner. Unit tests can inject independent runners, which does not prove default production ownership safety.

### Model

Trace all production SplitFace store creation paths and all default runner consumers.

Choose exactly one valid closure:

- **Path A — single live production owner is an actual invariant:** prove the construction boundary and add a test that would fail if a second default-owning production store becomes live.
- **Path B — multiple live owners are possible:** move runner ownership to the correct bounded owner with the smallest change while preserving persistent Worker reuse.

### Falsify

Create an adversarial proof that would expose cross-owner cancellation if two stores share one default runner.

### Execute

Do not create a Worker pool. Do not create a new Worker per edit. Do not remove persistent reuse. Do not use cancellation as correctness.

### Inspect

If runner ownership changes, rerun Sprue latest-wins, Cavity browser proof, production-store lifecycle proof, bundle checks, and full frontend tests.

### Loop Exit

PASS only when default runner ownership is proven safe or minimally repaired with direct cross-owner evidence.

---

# Article 06 — Scheduler Invariant Model

## Goal

Prove no ghost busy state, obsolete queued start, or stale write exists.

## Loop 06

### Model

Derive actual scheduler states from current code: idle, active-only, active+pending-latest, current failure, stale completion, teardown, retry. Name fields and functions implementing transitions.

### Falsify

Try to make `sprueStatus`, evaluation identity/phase, pending snapshot, Registration, result, and history contradict each other.

### Execute

Use existing deferred-runner test patterns. Do not add production state merely to make tests easier.

### Inspect

Scheduler tests must check document/evaluation/Registration/history, not only Sprue arrays.

### Loop Exit

PASS only when all scheduler transitions are falsifiable and ghost generating is impossible.

---

# Article 07 — Complete Upstream Invalidation Matrix

## Goal

Prove every authoritative upstream mutation preserves or tears down Sprue work correctly.

## Loop 07

### Model

Build a matrix from actual public writers. Include, where applicable:

- `toggleFace`
- `removeSplitFace`
- `removeSplitFaceAndRebuild`
- selected-face remove/rebuild
- `clearSelection`
- ordinary `commitPlaneDrag`
- Mold Scale / clearance commit
- canonical geometry signature replacement
- orientation clear
- model replacement clear
- Undo
- Redo
- fresh Segmentation adoption
- Scale-triggered Segmentation promotion
- Cavity-invalidating mutations
- every additional upstream writer discovered.

For every row classify preserve vs invalidate.

### Falsify

For each invalidating row test both active-only and active+pending-latest. After the upstream mutation deliver old success, old failure, and old progress. Old work must not start queued obsolete work or commit any stale channel.

### Execute

Prefer parameterized public-API tests. Do not prove lifecycle by calling private cleanup helpers directly.

### Inspect

Check document revision/fingerprint, Sprue intent, resolved Sprue geometry, Registration, lastCommittedResult, body visibility, evaluation, history, and presentation as applicable.

### Loop Exit

PASS only when every upstream writer has a documented preserve/invalidate policy plus proof.

---

# Article 08 — Stale Success, Failure, Progress, and History Channels

## Goal

Close stale writes across all channels.

## Loop 08

### Model

Extend deferred-runner adversarial tests so stale A attempts success, failure, and progress after newer intent or invalidation.

### Falsify

Prove stale A writes zero newer-owned channels:

- no error clobber;
- no evaluation identity/progress clobber;
- no Registration write;
- no history entry;
- no lastCommittedResult replacement;
- no bodyVisibility rewrite;
- no document rollback;
- no presentation regression.

### Execute

Prefer existing requestId/revision/fingerprint identity. Add new state only if a failing proof demonstrates a missing identity dimension.

### Inspect

If one stale write exists, inspect every post-await state mutation in that coordinator.

### Loop Exit

PASS only when stale work is observationally inert across all channels it no longer owns.

---

# Article 09 — First Create Failure Atomicity

## Goal

Prove failed first Sprue creation leaves no fake manufacturing truth and no history pollution.

## Loop 09

### Model

Strengthen first-Create failure proof to assert document state, pending presentation removal, resolved Sprue empty, Registration truth, lastCommittedResult, evaluation failure provenance, error, body visibility, Undo/Redo delta, and immediate retry readiness.

### Falsify

Inject current-request failure at the derived evaluation boundary, then retry without recreating the store.

### Execute

Do not repair failure by rebuilding the whole store.

### Inspect

Cavity/reference mold must remain valid if Sprue failure does not invalidate them.

### Loop Exit

PASS only when failed first Create is atomic, history-free, truthful, and immediately retryable.

---

# Article 10 — Main-Diameter Failure Atomicity

## Goal

Strengthen current main resize rollback to system-level atomicity.

## Loop 10

### Model

Assert document, Registration, lastCommittedResult, body visibility, pending-definition rollback, resolved geometry, evaluation failure provenance, error, history, and retry.

### Falsify

Fail main resize, retry with a distinct diameter, Undo successful retry, Redo it, and prove the failed diameter never becomes durable history.

### Execute

Use public `resizeSprue`; do not special-case test values in production.

### Inspect

Pending presentation may show new profile, but failed rollback must restore coherent resolved-only fields.

### Loop Exit

PASS only when main resize failure is atomic across intent, manufacturing, Registration, history, and presentation.

---

# Article 11 — Entry-Neck Failure Atomicity

## Goal

Add the missing current-failure proof for entry-neck resize.

## Loop 11

### Model

Mirror system-level assertions using `resizeSprueEntryNeck`: pending value visible, current failure restores last valid entry-neck profile, no history, Registration/result/document coherent, truthful failure, immediate retry succeeds.

### Falsify

Use different old, failed, and retry values. The main diameter must remain coherent throughout.

### Execute

Reuse helpers only where semantics are identical.

### Inspect

A change to entry-neck must never corrupt the main section.

### Loop Exit

PASS only when entry-neck failure/retry is independently proven.

---

# Article 12 — Move and Remove Failure Semantics

## Goal

Close missing failure semantics for move and classify remove/rebuild operations.

## Loop 12

### Model

Add move current-failure rollback with full state assertions. Inspect `removeSprue`, `rebuildSprues`, and `rebuildSprueDefinitions`: if they schedule derived work, test current failure/history; otherwise document their actual semantics.

### Falsify

Move to distinct X/Y/Z coordinates, fail current work, prove resolved anchor/presentation/document/Registration/history return to the real prior commit.

### Execute

Do not force all Sprue actions into a generic helper if their rollback policies differ.

### Inspect

Target-body/depth provenance must not be mixed with a failed pending position.

### Loop Exit

PASS only when every Sprue mutation has explicit success/failure/history semantics appropriate to its actual execution model.

---

# Article 13 — Registration-Stage Failure

## Goal

Prove late failure cannot leave a half-committed mold.

## Loop 13

### Model

Represent a current request that reaches Registration progress and then fails, using the lowest existing controllable boundary.

### Falsify

After progress reaches Registration, fail current request and assert:

- no new resolved Sprue result;
- no generated Registration from failed revision;
- no failed-revision lastCommittedResult;
- no history entry;
- prior valid presentation restored;
- truthful failure provenance;
- later retry produces Sprue + Registration for the same current document fingerprint.

### Execute

Do not add a production Worker protocol test hook unless no existing contract can represent the failure and a test-only path is impossible.

### Inspect

Mixed-revision Sprue/Registration is forbidden.

### Loop Exit

PASS only when late-stage failure is atomically rolled back.

---

# Article 14 — Latest-Wins Final Failure and History

## Goal

Prove a rapid burst whose final/current request fails rolls back with zero history.

## Loop 14

### Model

Start active work, issue many newer intents, allow the final latest snapshot to become current, then fail it.

### Falsify

Assert:

- burst dispatch delta <= 2;
- final current failure restores pre-burst resolved truth;
- history delta = 0;
- no pending request remains;
- `sprueStatus` returns idle;
- retry succeeds;
- stale older completion cannot overwrite final failure/rollback.

### Execute

Measure burst dispatch delta directly, not cumulative lifecycle dispatch count.

### Inspect

Do not infer `burst <= 2` from a combined total like `<= 5`.

### Loop Exit

PASS only when failed latest-wins burst has isolated dispatch count, zero history, atomic rollback, and successful retry.

---

# Article 15 — Retry and Fresh History Base

## Goal

Prove failure never poisons the history base of later success.

## Loop 15

### Model

For first Create and at least one resize/move failure: fail current action, then perform a successful new action, Undo, Redo.

### Falsify

Use values that make pre-failure, failed, retry-success, Undo, and Redo states distinguishable.

### Execute

Do not clear history as a shortcut unless repository policy explicitly requires it.

### Inspect

History is product behavior, not test bookkeeping.

### Loop Exit

PASS only when Undo returns to the last genuinely committed pre-failure state and Redo restores only successful retry state.

---

# Article 16 — Presentation Truth During Pending and Rollback

## Goal

Prove Viewport-facing state never combines incompatible pending intent with stale manufacturing-only fields.

## Loop 16

### Model

Define presentation semantics for Create, main resize, entry resize, move, failure, stale completion, success.

### Falsify

Pending profile/position may be shown, but stale depth/target-body facts must not be presented as if resolved for the new intent when invalid.

### Execute

Add selector tests and browser-level pending main/entry checks.

### Inspect

A fast UI must not display impossible manufacturing truth.

### Loop Exit

PASS only when pending and rollback presentation are directly proven in unit/integration and Chromium evidence.

---

# Article 17 — Production-Store Browser Coordinator Proof

## Goal

Upgrade the existing browser lifecycle proof from cumulative evidence to operation-scoped evidence.

## Loop 17

### Model

Extend the E2E-only probe to report:

- createDispatchDelta
- mainResizeDispatchDelta
- entryResizeDispatchDelta
- burstDispatchDelta
- createHistoryDelta
- mainHistoryDelta
- entryHistoryDelta
- burstHistoryDelta
- pending main value
- pending entry value
- final values
- final Registration status
- final document/result identity
- page errors
- console errors

### Falsify

Directly assert:

- ordinary Create uses expected current dispatch behavior;
- main resize uses expected current dispatch behavior;
- entry resize uses expected current dispatch behavior;
- 20-edit burst dispatch delta <= 2;
- burst history delta = 1;
- final main diameter equals latest requested;
- final entry diameter equals requested;
- Registration coherent;
- document/result fingerprint coherent;
- page errors = 0;
- console errors = 0.

### Execute

Keep probe E2E-only. Never expose it on production `window` or normal production build.

### Inspect

The probe must use the production store creator and production Worker-backed path for the behavior it claims.

### Loop Exit

PASS only when browser tests prove exact coordinator invariants directly.

---

# Article 18 — Browser Pending-Intent Responsiveness

## Goal

Separate perceived interaction responsiveness from manufacturing completion.

## Loop 18

### Model

In E2E-only code record timestamps/checkpoints for action invocation, acceptance/pending visibility, and final commit for Create, main resize, entry resize, and 20-edit burst.

### Falsify

Prove pending main/entry values become observable before final completion.

### Execute

Use `performance.now()` for ordering. Do not include build/browser startup time. Do not use arbitrary sleeps.

### Inspect

Do not put unstable absolute millisecond budgets into CI before benchmark evidence establishes a stable threshold.

### Loop Exit

PASS only when Chromium proves immediate/pending user intent independently from geometry completion.

---

# Article 19 — Inter-Store / Owner Boundary Adversarial Proof

## Goal

Ensure one logical owner cannot cancel/clobber another.

## Loop 19

### Model

Use Article 05's ownership conclusion.

If multiple owners are legal, run two concurrently through real owner-bound runners, supersede A, and prove B remains independent.

If one production owner is a hard invariant, prove the construction boundary instead of inventing unsupported multi-owner product behavior.

### Falsify

Request identity, progress, failure, result, and cancellation must remain owner-local.

### Execute

Do not preserve unsafe global ownership solely for compatibility. Do not add a multi-owner abstraction when single-owner architecture is proven.

### Inspect

Worker count remains bounded by actual owner lifetime.

### Loop Exit

PASS only when scheduler and runner ownership share a proven lifetime boundary.

---

# Article 20 — Sprue × Cavity × Registration Consistency

## Goal

Prove Sprue changes do not violate upstream Cavity or coupled Registration truth.

## Loop 20

### Model

Cover:

- valid Cavity -> Sprue Create;
- Sprue resize after Cavity;
- Cavity-invalidating upstream mutation during active Sprue;
- Registration regeneration after successful Sprue change;
- current Sprue failure preserving valid upstream Cavity;
- stale Sprue result unable to overwrite newer Cavity/document identity.

### Falsify

Use source fingerprints/result ownership, not only array lengths.

### Execute

Retain real Chromium Manifold Cavity Boolean proof.

### Inspect

Do not rebuild Cavity unnecessarily for profile-only edits if current architecture intentionally reuses it; do not skip required rebuild after topology change.

### Loop Exit

PASS only when Cavity, Sprue, and Registration always represent the same revision or an explicitly pending/failed state.

---

# Article 21 — Sprue × Mold Scale × Segmentation Consistency

## Goal

Protect overlapping async chains between Mold Scale, Segmentation regeneration, and Sprue work.

## Loop 21

### Model

Test:

- resolved Sprue then Mold Scale;
- active Sprue then Mold Scale;
- active+pending Sprue then Mold Scale;
- Scale-triggered Segmentation promotion arriving after newer Sprue/Undo change;
- fresh Segmentation adoption while old Sprue work remains unresolved.

### Falsify

Resolve old async tails after newer mutation. They must not resurrect old bodies, Sprues, Registration, visibility, result ownership, or busy state.

### Execute

Do not make Segmentation wait on Sprue merely to avoid races.

### Inspect

Preserve the one-history-entry semantics of a Mold Scale gesture whose Segmentation promotion is its async tail.

### Loop Exit

PASS only when Mold Scale, Segmentation, and Sprue cannot commit mixed revisions or duplicate history.

---

# Article 22 — Sprue × Cut by Face × Undo/Redo × Replacement

## Goal

Close topology/history/replacement lifecycle.

## Loop 22

### Model

Parameterize public mutation tests for face toggles, plane commit, final/non-final split removal/rebuild, Undo/Redo, orientation change, and model replacement.

### Falsify

Begin with resolved Sprue plus active+pending work where legal. Perform upstream mutation. Deliver stale success/failure/progress. Prove no resurrection.

### Execute

Do not prove lifecycle primarily by calling internal invalidation helpers.

### Inspect

Check Viewport selectors/body visibility as well as store arrays.

### Loop Exit

PASS only when topology/history/replacement operations preserve or invalidate the complete connected state cluster according to one documented policy.

---

# Article 23 — Viewport and Edge-Cache Non-Regression

## Goal

Preserve prior interaction performance and visual truth.

## Loop 23

### Model

Retain/strengthen pointer coalescing, edge cache reuse, reference-mold geometry identity, tool deactivate/reactivate, Sprue pending presentation, and active body visibility tests.

### Falsify

Many raw pointer events per frame -> at most one expensive update. Warm tool reactivation -> no unnecessary EdgesGeometry rebuild when identity is unchanged. Stale geometry -> not visible/selectable.

### Execute

Do not remove useful visual fidelity or geometry validation for speed.

### Inspect

Cache keys must follow authoritative geometry identity.

### Loop Exit

PASS only when Viewport responsiveness remains bounded and visually truthful.

---

# Article 24 — Worker Lifecycle and Structural Counters

## Goal

Explain performance through expensive-work counts.

## Loop 24

### Model

Collect test/benchmark-only counters where observable:

- derived Worker creations;
- derived dispatches;
- Sprue generation calls;
- Registration runs;
- stale commits;
- queued-obsolete starts;
- Reference Mold rebuilds;
- EdgesGeometry constructions;
- history entries;
- expensive pointer updates.

### Falsify

Required structural invariants:

- no Worker-per-edit regression;
- 20-edit burst dispatch <= 2;
- stale commits = 0;
- queued-obsolete starts after teardown = 0;
- failed burst history +0;
- successful burst history +1;
- warm edge reuse avoids unnecessary reconstruction.

### Execute

Keep instrumentation test/benchmark-only unless an existing diagnostic boundary already owns it.

### Inspect

Structural counters do not replace latency measurements.

### Loop Exit

PASS only when expensive work is mechanically bounded and explainable.

---

# Article 25 — Benchmark Harness Architecture

## Goal

Create deterministic historical/current performance evidence without altering product semantics.

## Loop 25

### Model

Build one semantic benchmark driver capable of running equivalent Sprue scenarios across historical/current refs. Record exact SHA, fixture, operation, Sprue count, sample count, warmups, environment, acceptance latency, completion latency, and structural counters where available.

### Falsify

Run the same current SHA twice in separate benchmark sessions and establish a documented noise envelope.

### Execute

Use production-like build/browser mode where possible. Do not benchmark HMR. Exclude install/build time from interaction latency.

### Inspect

Historical adapters may map renamed APIs but may not copy final scheduler/cache fixes into old baselines.

### Loop Exit

PASS only when the benchmark methodology produces reproducible equivalent workloads.

---

# Article 26 — Historical Worktree Isolation

## Goal

Recover historical evidence without mutating old baselines or the active worktree.

## Loop 26

### Model

Use throwaway worktrees outside repository root for:

- `081ef3a94db3dd3f7d58e3283d5a238603e4655c`
- `042d4011a77c2f7ceb3813def23a97da59dd961f`
- `6aeabcd57b255b6ded740996408f9664298b8339`
- `57b55a0a1594c780be21f7680813ed750ee030dc`
- final Execution 12 candidate.

### Falsify

Historical worktrees must remain unmodified except disposable external/test-only instrumentation. Active repo must contain no worktree artifacts.

### Execute

Never benchmark by checking old commits out inside the user's active working tree. Never force reset the active branch.

### Inspect

If an old ref cannot execute a scenario, mark `NOT COMPARABLE` with evidence.

### Loop Exit

PASS only when historical evidence is exact-SHA, isolated, and semantically comparable.

---

# Article 27 — Deterministic Fixture Matrix

## Goal

Measure performance across objective geometry complexity and Sprue count.

## Loop 27

### Model

Define or reuse deterministic watertight fixtures and record geometry complexity, bounds, signature/hash, mold dimensions, and Sprue placements.

Required grid:

- SMALL × 1 Sprue
- SMALL × 3 Sprues
- MEDIUM × 1 Sprue
- MEDIUM × 3 Sprues
- LARGE × 1 Sprue
- LARGE × 3 Sprues

Required scenarios:

- cold Create;
- warm Create;
- warm main resize;
- warm entry resize;
- 3-edit burst;
- 20-edit burst;
- tool deactivate/reactivate where meaningful.

### Falsify

Validate fixture correctness before timing. Do not silently omit slow valid samples.

### Execute

Use identical fixture definitions across comparable SHAs.

### Inspect

A timing without fixture identity and correctness result is invalid.

### Loop Exit

PASS only when small/medium/large × 1/3 Sprue evidence exists.

---

# Article 28 — Statistics and Noise Discipline

## Goal

Produce defensible min/p50/p95/max evidence.

## Loop 28

### Model

Class A acceptance/pending primary scenarios: `n >= 50` after warmup.

Class B completion small/medium primary scenarios: `n >= 20`.

Large: `n >= 10`; do not overclaim p95 unless sample support is adequate; use `n >= 20` if p95 is reported.

Record min, p50, p95 where supported, max, sample count, percentile method.

### Falsify

Repeat one reference scenario near the end to detect environmental drift. Rerun if drift exceeds the documented noise envelope.

### Execute

Record OS, CPU, RAM, Node, npm, browser/version, build mode, exact SHA, date/time, and power mode if available.

### Inspect

Do not compare CI runtime to local benchmark runtime as a performance claim.

### Loop Exit

PASS only when statistics are reproducible, sample-supported, and environment-bound.

---

# Article 29 — Performance Decision Rule

## Goal

Decide from evidence whether current performance is already closed or requires one measured optimization.

## Loop 29

### Model

Classify each user-visible scenario as improved, unchanged within noise, regressed, or not comparable.

If current/final code is already structurally bounded and materially improved over older slow refs, close by evidence.

If a reproducible current bottleneck remains, isolate the dominant cost with counters/profiling and make the smallest production change.

### Falsify

Re-run the same benchmark matrix after any production performance change.

### Execute

Never lower Manifold/geometry quality, validation, fixture complexity, or Sprue count to claim improvement.

### Inspect

If final p95 regresses versus Execution 12 start beyond measured noise, do not close until explained/repaired.

### Loop Exit

PASS only when the original creation/main-resize/entry-resize slowness is numerically explained and either proven fixed or identified as a remaining blocker.

---

# Article 30 — Mutation-Sensitivity Audit

## Goal

Prove the tests fail when critical protections are deliberately broken.

## Loop 30

### Model

Use a temporary external worktree at the final candidate SHA. Apply one controlled mutation at a time, such as:

- remove scheduler teardown from one invalidating mutation;
- bypass one stale ownership gate;
- restore busy-reject behavior;
- remove Registration rollback;
- break history coalescing;
- dispatch every burst intent;
- bypass E2E artifact isolation.

### Falsify

At least one mutation must target scheduler teardown, one stale ownership gate, one history invariant, and one browser/artifact/structural performance invariant. The expected targeted test must fail.

### Execute

Never mutate the user's active worktree for this audit. Never commit mutation changes.

### Inspect

Record mutation, file/function, expected failing test, actual failure, and restoration proof.

### Loop Exit

PASS only when critical tests demonstrate sensitivity to the guards they claim to protect.

---

# Article 31 — Security, Bundle, and Artifact Invariants

## Goal

Add proof infrastructure without weakening established safety.

## Loop 31

### Model

Preserve:

- `npm audit --audit-level=moderate`;
- dependency review at moderate;
- exact Quality Gate matrix;
- production/E2E build separation;
- bundle budgets 410/575 kB unless a separately proven product need exists;
- real browser Cavity Worker/WASM/Boolean proof.

### Falsify

Build normal production and search `dist` for Execution 12 probe/benchmark names. Normal production must not contain them.

### Execute

Do not raise bundle budgets to absorb test code. Do not lower security severity. Do not weaken artifact checker patterns.

### Inspect

Manifold `node:module` remains controlled third-party warning only while real browser proof remains green.

### Loop Exit

PASS only when Execution 12 adds zero production harness leakage and weakens zero existing gate.

---

# Article 32 — Full Local Harness

## Goal

Run the entire connected-system harness after targeted closure.

## Loop 32

### Model

Using current repository-native scripts, run:

- clean dependency install;
- moderate npm audit;
- frontend typecheck;
- frontend lint;
- production build;
- production artifact isolation;
- bundle budget check;
- full Vitest;
- E2E build;
- full Playwright;
- Python Ruff lint;
- Python Ruff format check;
- Python pytest;
- `git diff --check`.

### Falsify

Any new failure or warning must be classified. Do not waive a failure as unrelated without evidence.

### Execute

Use commands from current `package.json`/`pyproject.toml`; do not invent names.

### Inspect

Record actual current counts; do not copy old counts. Ensure new mandatory tests actually entered the suite.

### Loop Exit

PASS only when full local harness is green and tied to the candidate SHA.

---

# Article 33 — Proof-Carrying Execution Report

## Goal

Make closure independently auditable without chat history.

## Loop 33

### Model

Create `Execution/Craft Execution 12/Craft Execution 12 Report.md` containing:

- path/Git binding;
- start/final SHA;
- changed-file classification;
- evidence ledger;
- system ownership map;
- per-production-edit impact contracts;
- scheduler model;
- upstream invalidation matrix;
- failure matrix;
- runner ownership closure;
- cross-system matrices;
- browser proof matrix;
- structural counters;
- mutation-sensitivity results;
- security/artifact/bundle results;
- local harness;
- remote exact-SHA run;
- controlled warnings;
- final open-item ledger.

### Falsify

Every CLOSED row must cite a repository path/test/log/result. Every unproven item remains OPEN.

### Execute

Do not paste giant raw logs. Provide commands, exact IDs, counts, and representative evidence.

### Inspect

Distinguish bug repair from evidence-only closure.

### Loop Exit

PASS only when another engineer can audit every mandatory invariant from repository artifacts.

---

# Article 34 — Proof-Carrying Performance Report

## Goal

Create the missing historical/current performance artifact.

## Loop 34

### Model

Create `Execution/Craft Execution 12/Craft Execution 12 Performance.md` containing:

- benchmark methodology;
- environment;
- exact SHAs;
- historical adapters/limitations;
- deterministic fixture definitions;
- sample/warmup policy;
- percentile method;
- Class A vs Class B definitions;
- all required scenario tables;
- structural counters;
- drift check;
- historical comparisons;
- interpretation;
- limitations;
- conclusion addressing Create, main resize, entry resize, and burst responsiveness.

### Falsify

Every number must come from actual execution. `NOT COMPARABLE` is valid; invented values are not.

### Execute

Keep raw temporary benchmark data out of tracked production unless compact stable machine-readable evidence is genuinely necessary.

### Inspect

Do not report p95 without adequate sample support.

### Loop Exit

PASS only when performance closure is numerically auditable.

---

# Article 35 — User Push Boundary and Candidate Freeze

## Goal

Keep local and remote evidence separate and immutable.

## Loop 35

### Model

After all local mandatory loops pass, freeze the candidate. Stop production edits. Print:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

Do not push unless the user separately authorizes it.

### Falsify

Any code/report change after local-complete invalidates the candidate and requires affected proof to rerun.

### Execute

Do not force-push. Do not commit unrelated user changes.

### Inspect

The final report remote section stays incomplete until exact-SHA remote verification.

### Loop Exit

PASS only when local candidate and remote candidate are explicitly separated.

---

# Article 36 — Exact-SHA Remote Verification and Final Adversarial Re-Audit

## Goal

Close Execution 12 only after final exact-SHA GitHub evidence and a red-team review.

## Loop 36

### Model

After user-authorized push, obtain exact final SHA and its Continuous Integration run. Verify:

- Frontend quality success;
- Browser smoke success;
- Python quality success;
- Repository integrity success;
- Quality Gate success;
- Dependency Review result correct for event type;
- remote frontend log actually ran moderate audit;
- remote browser log actually ran strengthened Sprue lifecycle proof;
- remote browser failures = 0;
- remote Python full suite.

Then re-read final diff and both reports.

### Falsify

Red-team all of these:

- ghost generating?
- queued obsolete starts?
- stale success/failure/progress/history?
- mixed-revision Registration?
- failed first Create leak?
- entry failure leak?
- move failure leak?
- poisoned history base?
- default runner cross-owner cancellation?
- browser burst counts still indirect?
- browser pending values still unproven?
- historical SHAs truthful?
- p95 sample-supported?
- benchmark adapters copied final fixes?
- mutation sensitivity real?
- production harness leak?
- bundle/security gate weakened?
- Cavity/Segmentation/Mold Scale/Viewport regression?

Any answer lacking evidence reopens its article.

### Execute

Do not hide product failures through selective reruns. If infrastructure flakes, document both attempts and why it is non-product. Final SHA must remain unchanged.

### Inspect

Final diff contains only required implementation/tests/harness/reports/CI adjustments. No unrelated feature work or transient benchmark artifacts.

### Loop Exit

PASS only when every mandatory checkbox below is true and the exact final SHA is remotely green.

---

# Appendix A — Mandatory System-of-Systems Mutation Matrix

For each row record:

- authoritative owner;
- whether Sprue intent survives;
- whether resolved Sprue geometry survives;
- whether Registration survives;
- whether Cavity survives;
- whether `lastCommittedResult` survives;
- whether `bodyVisibility` survives;
- whether active scheduler is cancelled;
- whether pending-latest snapshot is cleared;
- whether old Worker success can commit;
- whether old Worker failure can clobber;
- whether old Worker progress can clobber;
- history behavior;
- presentation behavior;
- proof file/test.

Mandatory investigation rows:

1. face toggle;
2. split-face removal;
3. split-face removal + rebuild;
4. clear selection;
5. ordinary plane drag commit;
6. Mold Scale / clearance commit;
7. canonical geometry signature replacement;
8. orientation change;
9. model replacement;
10. Undo;
11. Redo;
12. fresh Segmentation adoption;
13. Scale-triggered Segmentation promotion;
14. Cavity-invalidating mutation;
15. successful Sprue Create;
16. failed Sprue Create;
17. successful main resize;
18. failed main resize;
19. successful entry-neck resize;
20. failed entry-neck resize;
21. successful move;
22. failed move;
23. remove/rebuild operations according to their actual async model.

No row may be `N/A` without a code-grounded reason.

---

# Appendix B — Mandatory Failure Matrix

For each failure scenario record:

- precondition;
- active document fingerprint/revision;
- user intent before;
- manufacturing result before;
- Registration before;
- history before;
- injected failure point;
- expected state after failure;
- expected presentation;
- expected error/evaluation provenance;
- expected history delta;
- expected retry behavior;
- proof path;
- result.

Mandatory scenarios:

- first Sprue Create current failure;
- main-diameter resize current failure;
- entry-neck resize current failure;
- move current failure;
- current remove/rebuild failure if async;
- Registration-stage current failure;
- stale success after newer intent;
- stale failure after newer intent;
- stale progress after newer intent;
- active + pending latest + upstream teardown;
- 20-edit burst final/current failure;
- failure -> immediate retry;
- failure -> later success -> Undo -> Redo.

Expected invariant unless repository policy proves otherwise:

```text
failed provisional intent does not become durable manufacturing truth
failed provisional intent does not create history
previous valid upstream truth is preserved
failure provenance belongs only to current request
retry starts from the last genuinely committed base
```

---

# Appendix C — Browser Proof Matrix

The Chromium suite must retain:

- app boot + deterministic STL import;
- real Manifold-backed Cavity Boolean through production Worker/WASM path;
- Sprue derived-engine cache proof;
- production SplitFace store lifecycle proof.

Execution 12 strengthens production-store proof with direct assertions for:

- first Create accepted;
- first Create reaches pending/generating state;
- first Create resolves;
- main resize pending value visible;
- main resize final value correct;
- entry-neck pending value visible;
- entry-neck final value correct;
- burst latest requested value wins;
- **burst dispatch delta <= 2**;
- **burst history delta = 1**;
- final Registration coherent;
- final result fingerprint matches current document;
- page errors = 0;
- console errors = 0.

If deterministic real-Worker failure injection cannot be achieved in Chromium without shipping a production test hook, keep failure injection at unit/integration level and document the limitation. Do not add a production backdoor for a browser test.

---

# Appendix D — Structural Performance Counter Contract

| Counter | Expected invariant |
|---|---|
| raw pointer events | may be high |
| expensive placement updates | <= 1 per animation frame |
| derived dispatches in 20-intent burst | <= 2 |
| stale commits | 0 |
| queued obsolete starts after teardown | 0 |
| successful burst history entries | 1 |
| failed burst history entries | 0 |
| derived Worker creations during warm repeated edits | bounded by owner lifetime, not edit count |
| unnecessary full reference-mold rebuild for profile-only edit | 0 if current architecture defines reuse |
| warm edge-cache reconstruction | 0 when same geometry identity remains valid |

Structural counters do not replace latency measurements.

---

# Appendix E — Benchmark Scenario Contract

## Class A — Interaction Acceptance / Pending Responsiveness

Measure action invocation -> latest intent acknowledged/pending presentation visible.

Scenarios:

- first Create;
- main resize;
- entry-neck resize;
- 3-edit burst;
- 20-edit burst.

Primary sample count: `n >= 50`.

## Class B — Authoritative Manufacturing Completion

Measure accepted intent -> current manufacturing result commit.

Scenarios:

- cold Create;
- warm Create;
- warm main resize;
- warm entry-neck resize;
- 3-edit burst final completion;
- 20-edit burst final completion.

Small/medium primary: `n >= 20`.

Large: `n >= 10`; p95 only when sample-supported.

## Fixture Grid

- SMALL × 1 Sprue
- SMALL × 3 Sprues
- MEDIUM × 1 Sprue
- MEDIUM × 3 Sprues
- LARGE × 1 Sprue
- LARGE × 3 Sprues

## Historical SHAs

- `081ef3a94db3dd3f7d58e3283d5a238603e4655c`
- `042d4011a77c2f7ceb3813def23a97da59dd961f`
- `6aeabcd57b255b6ded740996408f9664298b8339`
- `57b55a0a1594c780be21f7680813ed750ee030dc`
- final Execution 12 SHA

Do not claim equivalence if an adapter changes semantic workload.

---

# Appendix F — Benchmark Required Fields

Every result group must state:

```text
Exact SHA:
OS:
CPU:
RAM:
Node:
npm:
Browser:
Build mode:
Fixture:
Geometry complexity:
Sprue count:
Scenario:
Warmup count:
Sample count:
Percentile method:
min:
p50:
p95:  # only if supported
max:
Acceptance or completion class:
Correctness pass count:
Structural counters:
Adapter/limitation notes:
```

A timing without these fields is exploratory, not closure evidence.

---

# Appendix G — Prohibited Shortcuts

Any of the following is an Execution 12 failure unless separately proven necessary:

- `git init` inside `mold`;
- force reset/clean of user changes;
- broad refactor before failing proof;
- cancellation-only correctness;
- second durable Sprue state owner;
- pending intent stored as resolved manufacturing truth;
- failed provisional intent committed into Undo history;
- stale resolved depth/target data presented as resolved for new pending intent without valid policy;
- one new Worker per resize;
- killing/recreating Worker on every latest-wins request;
- lowering geometry quality for speed;
- removing Registration to speed Sprue;
- skipping Cavity validation;
- raising 410/575 kB budgets to fit test code;
- lowering audit severity from moderate;
- weakening Quality Gate exact-result logic;
- shipping E2E/benchmark harness in normal production;
- arbitrary sleeps in browser tests;
- performance claim from one run;
- unsupported p95 without limitation;
- comparing different SHAs on different machines and calling it performance comparison;
- copying final scheduler/cache fixes into historical baselines;
- treating cumulative dispatch `<=5` as direct burst `<=2` proof;
- treating injected-runner isolation as proof of default module-global runner ownership;
- adding generic event-bus/scheduler infrastructure without demonstrated need;
- copying old counts instead of rerunning;
- printing remote-complete language before exact-final-SHA remote CI finishes.

---

# Appendix H — Full Harness Checklist

## Frontend

- [ ] clean dependency install succeeds
- [ ] `npm audit --audit-level=moderate` succeeds
- [ ] typecheck succeeds
- [ ] lint succeeds
- [ ] production build succeeds
- [ ] production artifact isolation succeeds
- [ ] bundle budgets succeed unchanged
- [ ] full Vitest succeeds
- [ ] E2E build succeeds
- [ ] full Playwright succeeds
- [ ] app/STL browser smoke retained
- [ ] real Cavity Boolean browser proof retained
- [ ] Sprue cache browser proof retained
- [ ] strengthened production-store Sprue browser proof runs

## Python

- [ ] Ruff lint succeeds
- [ ] Ruff format check succeeds
- [ ] full pytest succeeds

## Repository

- [ ] `git diff --check` succeeds
- [ ] no conflict markers
- [ ] no transient benchmark artifacts tracked
- [ ] no historical worktree content tracked
- [ ] no nested `.git`
- [ ] no stale dynamic branch/HEAD claims in agent docs
- [ ] final reports are UTF-8
- [ ] normal production dist has no Execution 12 E2E/benchmark harness

---

# Appendix I — Final Definition of Done

## Repository / Context

- [ ] actual Git root discovered from Codex launch path
- [ ] no nested repository created
- [ ] exact start SHA recorded
- [ ] pre-existing user changes classified
- [ ] evidence ledger created before production edits
- [ ] system ownership map completed
- [ ] every production edit has an impact contract
- [ ] no speculative production refactor

## System-of-Systems Lifecycle

- [ ] five-truth model respected
- [ ] full upstream mutation matrix completed
- [ ] active-only invalidation tested
- [ ] active+pending invalidation tested
- [ ] ghost generating impossible
- [ ] queued obsolete work cannot start after teardown
- [ ] stale success writes zero newer-owned channels
- [ ] stale failure writes zero newer-owned channels
- [ ] stale progress writes zero newer-owned channels
- [ ] stale work creates zero history
- [ ] stale work cannot overwrite Registration
- [ ] stale work cannot overwrite lastCommittedResult
- [ ] stale work cannot resurrect visibility/presentation

## Failure Atomicity

- [ ] first Create current failure atomic
- [ ] first Create retry succeeds
- [ ] main resize failure atomic
- [ ] main resize retry succeeds
- [ ] entry-neck failure atomic
- [ ] entry-neck retry succeeds
- [ ] move failure atomic
- [ ] move retry succeeds
- [ ] remove/rebuild failure classified/tested where applicable
- [ ] Registration-stage failure atomic
- [ ] failed final burst atomic
- [ ] failed burst history delta = 0
- [ ] successful burst history delta = 1
- [ ] later success uses fresh committed history base
- [ ] Undo after retry returns to true pre-failure commit
- [ ] Redo restores only successful retry state

## Runner / Worker Ownership

- [ ] default module-level runner ownership traced
- [ ] production owner count/lifetime proven
- [ ] cross-owner cancellation risk closed by evidence or minimal repair
- [ ] persistent Worker reuse preserved
- [ ] Worker creation count bounded by owner lifetime
- [ ] no Worker-per-edit regression

## Browser

- [ ] production-store first Create proof
- [ ] production-store main resize proof
- [ ] production-store entry resize proof
- [ ] main pending value browser proof
- [ ] entry pending value browser proof
- [ ] 20-edit latest-wins browser proof
- [ ] burst dispatch delta measured directly
- [ ] burst dispatch delta <= 2
- [ ] burst history delta measured directly
- [ ] burst history delta = 1
- [ ] final value equals latest requested value
- [ ] final Registration coherent
- [ ] final result fingerprint matches current document
- [ ] page errors = 0
- [ ] console errors = 0
- [ ] Cavity browser Worker/WASM/Boolean proof retained
- [ ] Sprue cache browser proof retained

## Cross-System Regression

- [ ] Sprue × Cavity tested
- [ ] Sprue × Registration tested
- [ ] Sprue × Mold Scale tested
- [ ] Sprue × Segmentation tested
- [ ] Sprue × Cut by Face tested
- [ ] Sprue × Undo/Redo tested
- [ ] Sprue × orientation tested
- [ ] Sprue × model replacement tested
- [ ] Viewport pending/resolved presentation tested
- [ ] edge-cache/pointer-coalescing non-regression tested

## Performance

- [ ] benchmark harness reproducibility validated
- [ ] historical worktrees external/clean
- [ ] `081ef3...` comparison produced where comparable
- [ ] `042d4011...` comparison produced where comparable
- [ ] `6aeabcd...` comparison produced where comparable
- [ ] `57b55...` start comparison produced
- [ ] final candidate comparison produced
- [ ] SMALL fixture measured
- [ ] MEDIUM fixture measured
- [ ] LARGE fixture measured
- [ ] 1-Sprue matrix measured
- [ ] 3-Sprue matrix measured
- [ ] Create measured
- [ ] main resize measured
- [ ] entry resize measured
- [ ] 3-edit burst measured
- [ ] 20-edit burst measured
- [ ] Class A separated from Class B
- [ ] min recorded
- [ ] p50 recorded
- [ ] p95 only where sample-supported
- [ ] max recorded
- [ ] environment recorded
- [ ] drift check performed
- [ ] structural dispatch count recorded
- [ ] Worker creation count recorded
- [ ] history counters recorded
- [ ] stale commit count = 0
- [ ] queued-obsolete start count = 0
- [ ] performance conclusion supported by actual numbers

## Mutation Sensitivity

- [ ] scheduler teardown mutation causes targeted failure
- [ ] stale ownership mutation causes targeted failure
- [ ] history/coalescing mutation causes targeted failure
- [ ] browser/artifact/structural mutation causes targeted failure
- [ ] mutations performed only in temporary external worktree
- [ ] no mutation remains in candidate

## Security / Artifact / Bundle

- [ ] moderate npm audit clean
- [ ] CI moderate audit preserved
- [ ] dependency review moderate preserved
- [ ] Quality Gate exact result matrix preserved
- [ ] production artifact isolation preserved
- [ ] E2E artifact explicitly built for browser tests
- [ ] bundle budgets unchanged
- [ ] normal production ships no Execution 12 harness
- [ ] controlled Manifold warning still backed by real-browser proof

## Reports / Local / Remote

- [ ] `Craft Execution 12 Report.md` exists
- [ ] `Craft Execution 12 Performance.md` exists
- [ ] every CLOSED item links to evidence
- [ ] no invented benchmark value
- [ ] full local frontend harness green
- [ ] full local Python harness green
- [ ] `git diff --check` green
- [ ] final diff manually classified
- [ ] no unrelated feature work
- [ ] Codex did not push without user authorization
- [ ] exact pushed final SHA recorded
- [ ] exact final SHA remote CI completed
- [ ] remote Frontend success
- [ ] remote Browser success
- [ ] remote Python success
- [ ] remote Repository integrity success
- [ ] remote Quality Gate success
- [ ] Dependency Review result correct for event
- [ ] remote moderate audit visibly ran
- [ ] remote browser log visibly ran strengthened lifecycle proof
- [ ] remote Python log shows full suite
- [ ] final adversarial re-audit performed after remote green
- [ ] every mandatory checkbox true

If one mandatory checkbox is false, do **not** print remote-complete language.

---

# Appendix J — Output Protocol

Do not narrate ordinary execution.

Do not flatter.

Do not apologize for repository complexity.

Do not restate this document.

Do not announce file reads.

Do not ask for facts available through Git or repository inspection.

Do not claim confidence without proof.

When a real external decision is required:

```text
DECISION REQUIRED
Evidence:
Option A:
Option B:
System consequence:
```

When blocked:

```text
BLOCKED
Evidence:
Required external input:
Why repository inspection cannot resolve it:
```

At partial completion:

```text
PARTIALLY COMPLETE
Open mandatory items:
```

At local completion before user-authorized push:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

Only after exact-final-SHA remote green plus final adversarial re-audit:

```text
REMOTE VERIFIED COMPLETE — SYSTEM-OF-SYSTEMS SPRUE CLOSURE
```

Then stop.

---

# Appendix K — Final Instruction to Codex

Craft is a system of interdependent systems.

Do not optimize a Sprue by breaking Registration.

Do not repair Registration by invalidating Cavity.

Do not fix Cavity by corrupting history.

Do not simplify history by weakening latest-wins semantics.

Do not fix latest-wins by killing Worker reuse.

Do not preserve Worker reuse by sharing unsafe ownership.

Do not speed the Viewport by displaying false manufacturing truth.

Do not protect correctness by making interaction blocking.

Do not make interaction fast by lowering geometry quality.

Do not make tests green by weakening budgets or security.

Do not create architecture to solve an evidence gap.

Do not create evidence that bypasses the owner it claims to prove.

Investigate first.

Map ownership first.

Write failing proof before repair when a current bug exists.

When code is already correct, close with adversarial evidence instead of rewriting it.

Every state mutation has upstream causes and downstream consequences.

Every async request has an owner.

Every commit must prove it still owns the state it writes.

Every provisional intent must either become one coherent committed result or disappear without polluting history.

Every performance claim must be measured.

Every browser claim must run in a real browser.

Every historical claim must name the exact SHA.

Every remote claim must point to the exact final SHA's run.

Use the smallest change that closes the largest proven invariant.

Stop when mandatory closure is complete.
