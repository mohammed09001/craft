# Craft — Execution 04
## Green Baseline Closure: Authoritative-State Continuity + Lifecycle Repair + Deterministic Fallbacks + Warning-Free CI + Browser Proof

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 04/`  
**Observed starting reference while constructing this execution:** `main` at `94c0ed8e404096291dda072334981f085e7bf22c` (`Update project`)  
**Execution type:** hardening / closure only — no new product feature work  
**Primary objective:** convert the post-Execution-03 repository from “mostly repaired but still red” into a trustworthy, reproducible, warning-controlled, regression-resistant green baseline.  
**Engineering doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline.  

---

# 0. Mission

Execution 04 exists because Execution 03 repaired important architecture and repository debt, but the repository still cannot honestly be declared closed.

Execution 03 successfully improved several areas, including:
- stale asynchronous Sprue completion protection;
- repository hygiene and removal of dead/ambiguous code;
- frontend/Python ownership documentation;
- CI concurrency and pinned GitHub Actions;
- Dependabot configuration;
- frontend lint/typecheck/build recovery;
- npm dependency baseline recovery;
- stale dynamic agent-context cleanup.

However, post-execution verification on the current `main` still found concrete failures and residual gaps:

1. the frontend full test suite is red with three known failures;
2. an atomic rebuild currently loses last-known-good presentation continuity before the replacement result is ready;
3. Registration/Mold Scale lifecycle ownership is inconsistent or at least contradicted by active tests;
4. the Cavity direct-Minkowski → distance-field fallback contract is not being proven correctly;
5. the Python CI path is not reaching `pytest` because formatting/encoding scope fails first;
6. at least one tracked Markdown file contains broken/non-UTF-8 legacy text;
7. Python quality tooling is scoped too broadly across a mixed-language repository boundary;
8. the stable Quality Gate does not fully aggregate all security checks;
9. there is no explicit high-severity npm audit failure gate on ordinary CI pushes;
10. React tests still emit `act(...)` warnings;
11. ESLint still emits a React Refresh warning in the test harness;
12. the Vite production build still emits large-chunk warnings;
13. the Manifold/Vite browser build still emits `node:module` externalization warnings that are not yet classified with browser proof;
14. the repository lacks strong real-browser proof for the most important viewport/import/runtime path;
15. `PROJECT_MAP.md` still contains at least one stale post-cleanup claim about `*.bak` files;
16. obsolete “draft” wording may still survive in the surviving Segmentation implementation even though the removed multi-draft product model no longer exists.

Execution 04 must close these issues from root cause, not cosmetically.

The target state is:

```text
one authoritative state model
+ one explicitly separate presentation-continuity model where necessary
+ one lifecycle owner per upstream edit
+ deterministic geometry fallback semantics
+ frontend gates green
+ Python gates green
+ security gates aggregated
+ no unexplained quality warnings
+ real-browser smoke proof
+ no stale repository context
= trusted green baseline
```

This execution is complete only when the repository can be used as the next known-good foundation for future Craft work.

---

# 1. Non-Negotiable Definition of Complete

Do not report `COMPLETE` because “most tests pass.”

Do not report `COMPLETE` because the changed files look correct.

Do not report `COMPLETE` because a focused test passes while the repository gate remains red.

Do not report `COMPLETE` unless all applicable requirements below are proven.

## 1.1 Frontend gate

From `mold/frontend/`:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:run
```

Required result:
- exit code `0` for every command;
- zero failing Vitest files;
- zero failing Vitest tests;
- no newly skipped critical regression test;
- no lint error;
- no lint warning unless it is a proven third-party/tooling limitation that cannot be removed without making the code less correct, and that exception is explicitly documented in the final report;
- no React test `act(...)` warnings in the touched/critical suites;
- no build warning hidden merely by raising a warning threshold.

## 1.2 Python gate

From `mold/`:

```bash
python -m pip install -e ".[dev]"
ruff check <authoritative-python-scope>
ruff format --check <authoritative-python-scope>
pytest
```

The exact Ruff scope must be determined from repository evidence, not guessed.

Required result:
- Ruff lint passes;
- Ruff format passes;
- `pytest` actually executes;
- `pytest` passes;
- no Python quality job terminates before tests because it accidentally traverses unrelated frontend content.

## 1.3 Repository integrity gate

From repository root:

```bash
git diff --check
git status --short
git diff --stat
```

Additionally verify:
- no conflict markers;
- no accidental generated output;
- no new `.bak`, `.orig`, temp report, `.stage-work`, `.chapter10`, local cache, or scratch artifact becomes tracked;
- no tracked secret, token, credential, absolute machine-specific path, or local-only MCP credential appears in new changes;
- all edited text files are valid UTF-8 unless the repository explicitly requires a different encoding for a proven external format.

## 1.4 Security gate

At minimum:
- npm install/audit state has no unresolved high/critical advisory;
- ordinary CI can fail on high/critical npm audit findings;
- PR dependency review remains active;
- the stable aggregate Quality Gate cannot succeed while a required security job for that event has failed;
- no security check is made green by ignoring exit codes or marking failures `continue-on-error`.

## 1.5 State-integrity gate

A new upstream document/topology transition must never make stale geometry authoritative.

Presentation continuity must never be achieved by weakening authoritative freshness.

The required invariant is:

```text
AuthoritativeCurrentGeometry
!=
PresentationLastKnownGoodGeometry
```

when a replacement is in flight.

If both concepts are needed, they must be explicitly separated in code and tests.

## 1.6 Browser proof gate

The execution must produce real-browser proof for the minimum critical UI/runtime path.

At minimum prove, using an existing browser harness or the smallest justified new harness:
- the application boots;
- the viewport initializes;
- exactly one canvas is present;
- a deterministic STL fixture can be imported or the import path can be exercised in a browser-realistic way;
- the ready model is visibly represented by the runtime contract, not only a mocked Zustand state;
- no uncaught console error occurs during the smoke path;
- the app remains usable after the critical action;
- the browser path does not reveal a Manifold/Vite runtime break hidden by unit tests.

If the environment genuinely cannot provide browser/WebGL proof, do **not** claim `COMPLETE`; report `PARTIALLY COMPLETE` with the exact environmental blocker and all completed non-browser evidence.

## 1.7 Remote CI truth

A local coding agent that is not authorized to push must not claim that GitHub Actions is green.

Use these terms precisely:

```text
LOCAL COMPLETE
```

means all required local gates and harnesses pass.

```text
REMOTE VERIFIED COMPLETE
```

may be used only after the exact pushed commit has a fully green required GitHub Actions result.

If the agent cannot push or inspect the post-push run, final status must say that remote verification remains pending.

---

# 2. Source-of-Truth Order — Context Engineering Contract

Use this authority order for every decision:

1. current repository files at the working tree being edited;
2. current Git state (`branch`, `HEAD`, `status`, diff);
3. executable tests and reproducible behavior;
4. CI workflow definitions;
5. current feature contracts and active READMEs;
6. stable architecture docs such as `PROJECT_MAP.md`;
7. this Execution 04 prompt;
8. historical Execution documents and Git history for intent archaeology only.

If two sources disagree:
- do not average them;
- do not silently choose the easier one;
- reproduce the behavior;
- identify the real current owner;
- repair or delete the stale source.

The repository is authoritative over this prompt if it changed after the observed starting reference.

---

# 3. Session Bootstrap — Required Before Any Edit

Start at repository root.

Record:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
```

Do not continue blindly if unrelated user changes already exist.

If the tree is dirty:
- inventory the pre-existing changes;
- do not discard them;
- distinguish them from Execution 04 edits in the final report.

Read, if present:
- `AGENTS.md`;
- `mold/docs/agent/PROJECT_MAP.md`;
- `mold/docs/agent/ENGINEERING_LOOP.md`;
- `mold/docs/agent/WORKFLOW_POLICY.md`;
- `mold/frontend/src/features/viewport/README.md`;
- `mold/frontend/src/features/engine-integration/README.md`;
- the public entry points/README files of `mold-generation/workflow`, `split-face`, `registration`, `cavity-generation`, `segmentation`, and `sprue-generation` where applicable.

Do not require hidden/private chat context to perform this execution.

The prompt is intentionally self-contained.

---

# 4. Starting Evidence — Reproduce Before Repair

The following evidence was observed after Execution 03 on `main` at the starting reference.

Re-verify it.

If any item no longer reproduces, document that fact and determine which later repository change resolved it before deleting or rewriting a test.

## 4.1 Frontend test baseline

Observed full Vitest result:

```text
3 failed test files
179 passed test files
2 skipped test files

3 failed tests
1064 passed tests
5 skipped tests
```

Known failing tests:

### Failure A — presentation continuity during atomic rebuild

File:

```text
mold/frontend/src/features/mold-generation/workflow/moldWorkflow.integration.test.ts
```

Test intent:

```text
keeps last valid bodies visible during an in-flight atomic rebuild
```

Observed symptom:
- expected previous decorated/committed bodies;
- received raw/current definition bodies after document revision changed but before the new evaluation committed.

### Failure B — Registration × Mold Scale lifecycle

File:

```text
mold/frontend/src/features/mold-generation/registration/registrationLifecycle.store.test.ts
```

Test intent:

```text
regenerates after mold size and committed split add, move, and remove operations with Undo/Redo
```

Observed symptom:
- after `setClearanceMm(...)`, a subsequent `createMoldParts(...)` returns `false` where the test expects a successful lifecycle transition.

### Failure C — Cavity fallback accounting

File:

```text
mold/frontend/src/features/mold-generation/cavity-generation/cavityOffset.orchestrator.test.ts
```

Test intent:

```text
falls back to distance field when direct Minkowski fails
```

Observed symptom:
- the result reports `usedFallback === false` when the test expects `true`.

## 4.2 Current active-body selector behavior

Observed active selector logic is intentionally strict:

```text
lastCommittedResult may be served only when
sourceRevision == current document revision
AND
sourceFingerprint == current document fingerprint
```

Otherwise it falls back to current definition bodies.

This strictness protects authoritative truth.

Do not remove it simply to make Failure A green.

## 4.3 Python CI baseline

Observed CI does not reach `pytest` because a formatting/encoding failure occurs first.

Observed tracked text contains legacy encoding artifacts in the viewport README.

The Python quality job currently runs from `mold/` and must be checked for accidental traversal into unrelated frontend content.

## 4.4 Warning baseline

Observed warning classes include:
- React Refresh warning from `src/test/renderApp.tsx`;
- React `act(...)` warnings in several component tests;
- Vite chunk-size warning for a production bundle above the default warning threshold;
- `manifold-3d` / Vite browser compatibility warning involving `node:module` externalization.

## 4.5 Documentation baseline

Observed `PROJECT_MAP.md` still contains a stale statement that `*.bak` files exist beside active mold-generation code even though the cleanup removed them.

Observed surviving Segmentation code/comments may still use obsolete “draft” terminology inherited from the removed multi-draft product model.

---

# 5. Mandatory Working Rules

1. Investigate before editing.
2. Reproduce a failing behavioral test before repairing its code when practical.
3. Do not modify an expectation merely because production code currently disagrees with it.
4. Determine the intended invariant first.
5. Do not weaken freshness checks to preserve visual continuity.
6. Do not make stale geometry authoritative.
7. Do not create a second parallel state model if a narrow projection/selector can express the distinction.
8. Do not add a new lifecycle owner when one existing owner can be repaired.
9. Do not duplicate Registration regeneration paths.
10. Do not hide geometry fallback failure by changing a flag without proving which engine actually executed.
11. Do not swallow exceptions broadly to make fallback tests pass.
12. Do not scope Ruff away from real Python source/tests.
13. Do scope Python tools away from unrelated non-Python repository surfaces when that is the actual architecture boundary.
14. Do not disable lint rules to make warnings disappear.
15. Do not silence React warnings by mocking `console.error` or `console.warn`.
16. Do not increase Vite `chunkSizeWarningLimit` merely to hide the bundle warning.
17. Do not add an alias/polyfill for `node:module` unless repository/dependency evidence proves it is the correct browser entry contract.
18. Do not replace Manifold, Three.js, Zustand, Vite, Vitest, Ruff, or the existing mold-generation architecture as part of this execution.
19. Do not redesign product UI.
20. Do not change manufacturing geometry constants unless a reproduced defect proves a narrow constant is itself incorrect.
21. Do not change Registration sizing policy merely to fix lifecycle ownership.
22. Do not change Segmentation mathematics unless a failing invariant is directly caused by them.
23. Do not delete passing regression tests because they make repair harder.
24. Do not commit, push, merge, switch branches, rewrite history, or alter Git configuration without separate user authorization.
25. Never print or copy secrets from local configuration into reports.
26. Prefer deletion/simplification over compatibility shells for obsolete terminology or dead behavior.
27. Every repair must end with a regression harness, not a comment saying “fixed.”
28. If a problem cannot be closed safely inside this scope, stop expanding scope and report the exact blocker.

---

# 6. Objective A — Separate Authoritative Geometry from Presentation Continuity

This is the highest-priority state-model repair in Execution 04.

## 6.1 Problem statement

The current strict body selector correctly refuses to serve an old committed result after the authoritative document revision/fingerprint changes.

However, an atomic rebuild needs visual continuity:

```text
valid result N
→ user changes upstream input
→ document N+1 becomes authoritative
→ evaluation N+1 is in flight
→ result N should remain drawable as last-known-good presentation
→ result N must NOT become authoritative input for N+1
→ result N+1 commits
→ display atomically swaps to N+1
```

The current implementation appears to collapse two concepts into one selector:

```text
What is authoritative now?
```

and:

```text
What should the user continue seeing while the replacement is computing?
```

These questions require different contracts.

## 6.2 Required invariant

Keep authoritative freshness strict.

A stale result must never be returned from a selector used by:
- Cavity generation input;
- Sprue Boolean input;
- Registration input;
- export/final-result semantics if present;
- topology identity/fingerprint calculation;
- worker input generation;
- any operation that claims geometry is current.

Presentation continuity may use a previous valid result only under an explicit bounded state such as:

```text
replacement/evaluation is currently in flight
AND
last-known-good belongs to the same imported model/session lineage
AND
it is used only for presentation
```

## 6.3 Preferred design shape

Do not prescribe names before reading the code, but the architecture should become equivalent to:

```text
selectAuthoritativeMoldBodies(...)
    strict current document only

selectDisplayedMoldBodies(...)
    current committed result if current
    else presentation-safe last-known-good while replacement is in flight
    else current definition/empty according to the existing lifecycle contract
```

A stronger shape is acceptable:

```ts
type MoldBodyPresentation = {
  bodies: ...;
  provenance: "current" | "last-known-good-during-rebuild" | "definition";
  authoritative: boolean;
};
```

Only use such an expanded type if it materially prevents misuse.

Do not create a large presentation framework for one distinction.

## 6.4 Failure behavior

Do not automatically keep stale presentation forever after a rebuild fails.

Define and test the terminal semantics.

Valid choices depend on current product behavior:

### Option 1 — atomic rollback

If a failed replacement rolls the authoritative document/input back to the prior valid document, the prior result may become authoritative again.

### Option 2 — failed new authoritative input remains

If the new input remains authoritative after failure, the old result may remain as explicitly non-authoritative visual context only if the UI can truthfully represent that state; otherwise it must be removed.

Choose from current repository behavior.

Do not invent a hidden rollback merely to simplify the test.

## 6.5 Required tests

At minimum:

### A1. in-flight continuity

```text
commit valid decorated result N
start upstream rebuild N+1
do not let N+1 settle
presentation selector still yields N
strict authoritative selector does not claim N is current
```

### A2. successful atomic swap

```text
while N+1 runs → display N
N+1 commits → display N+1
N cannot reappear afterward
```

### A3. stale late completion

```text
N+1 is superseded by N+2
late N+1 cannot become display or authority after N+2 owns the lifecycle
```

### A4. current failure

Prove the chosen terminal failure semantics explicitly.

### A5. downstream isolation

Prove last-known-good presentation geometry cannot be used as current Cavity/Sprue/Registration input.

## 6.6 Regression surface

Re-run at minimum:
- `moldWorkflow.integration.test.ts`;
- `splitFace.derivedStateInvalidation.test.ts`;
- `splitFace.store.test.ts`;
- `registrationLifecycle.store.test.ts`;
- Cavity integration tests;
- Sprue integration tests;
- viewport mold-parts rendering tests.

---

# 7. Objective B — Resolve Registration × Mold Scale Lifecycle Ownership

Do not treat Failure B as a simple boolean expectation mismatch.

## 7.1 Determine the actual contract

Trace all of:

```text
setClearanceMm
invalidateForClearance / scale invalidation path
reference mold rebuild
createMoldParts
registration lifecycle generation
cavity state
sprue state
lastCommittedResult
document revision/fingerprint
workflow phase
Undo/Redo
Segmentation scale regeneration
```

Inspect every existing test that asserts Mold Scale behavior before changing code.

Specifically compare:
- `registrationLifecycle.store.test.ts`;
- `registrationLifecycle.test.ts`;
- `moldScaleRuntime.test.ts`;
- relevant `splitFace.store.test.ts` cases;
- `cuttingWorkflow.store.test.ts` scale/regeneration cases;
- Segmentation scale-regeneration tests.

## 7.2 One lifecycle owner

There must be exactly one clear semantic answer to:

> After Mold Scale changes the upstream mold geometry, what operation owns rebuilding downstream Registration truth?

Possible current designs include:

### Contract A

`setClearanceMm()` performs the canonical rebuild sufficiently far that the store is already `partsReady`, and callers must not invoke `createMoldParts()` again.

### Contract B

`setClearanceMm()` only invalidates/upgrades upstream inputs, and a canonical rebuild action is required before `partsReady`.

### Contract C

Scale enters a dedicated replan/rebuild lifecycle that atomically replaces current geometry and downstream truth.

Choose the contract that best matches existing production behavior and the majority of active passing tests.

Do not create a fourth duplicate path.

## 7.3 Downstream truth requirements

After a scale change:
- old Registration geometry cannot remain current;
- old Cavity geometry cannot remain current if it depends on the changed mold frame/clearance;
- old resolved Sprue geometry cannot remain current;
- preserved intent must be explicitly pending where the product intentionally preserves intent;
- any automatic regeneration must use current document identity;
- exactly one final committed result may become authoritative;
- Undo/Redo must restore a coherent snapshot, not a mixture of pre/post-scale child states.

## 7.4 Idempotence and duplicate-call safety

If the public workflow can naturally call `createMoldParts()` after a scale-triggered rebuild, decide whether the correct behavior should be:
- valid idempotent success;
- explicit no-op success;
- explicit invalid transition with callers/tests updated to the canonical lifecycle.

This must be intentional and tested.

A user-facing flow must not depend on a hidden “call this function twice in the right order” convention.

## 7.5 Required tests

Cover:
- scale before Registration exists;
- scale after Registration exists;
- scale after Cavity exists;
- scale with Sprue intent/resolved geometry according to current preservation policy;
- scale during an in-flight derived evaluation;
- repeated scale changes before prior regeneration completes;
- Undo/Redo across scale;
- Cut by Face scale path;
- Segmentation scale path if both use the singleton/current mold result.

Use existing tests where possible; add only missing contract coverage.

---

# 8. Objective C — Repair the Cavity Fallback Contract, Not Just the Flag

## 8.1 Problem statement

The current failing test intends to prove:

```text
automatic planner chooses direct Minkowski
→ direct Minkowski execution fails
→ orchestrator falls back to distance field
→ output truthfully records that fallback occurred
```

Current observed result does not satisfy `usedFallback === true`.

## 8.2 Investigate before changing test or code

Trace:

```text
cavityOffset.orchestrator
cavityEngine.selector / decision logic
Minkowski implementation wrapper
distance-field engine
error classification
fallback catch boundary
result metadata / implementationMethod
usedFallback
```

Determine whether the failure is:
- a production fallback bookkeeping defect;
- a test double that no longer forces the intended failure;
- changed Manifold behavior that makes the synthetic failure case no longer fail;
- an exception-class mismatch;
- an early validation path;
- a stale test expectation.

Do not choose without evidence.

## 8.3 Required semantic distinction

The result must distinguish:

```text
planned engine
executed engine
fallback occurred?
fallback reason
```

If the current contract already has equivalent fields, use them.

Do not add redundant metadata merely for the test.

## 8.4 Fallback safety

Fallback is allowed for a recoverable direct-engine failure.

Fallback must not silently swallow:
- invalid input;
- invalid geometry tolerance;
- programmer errors;
- cancellation/supersession;
- stale request ownership;
- a failure that makes both engines unsafe.

## 8.5 Deterministic harness

The fallback regression test must deterministically force direct Minkowski failure.

Do not rely on geometry that “usually” causes a third-party engine to throw.

Prefer a narrow injected/test seam already supported by the architecture, or a controlled stub at the orchestrator boundary.

Do not rewrite production architecture solely to mock one function.

## 8.6 Required tests

At minimum prove:
- zero-clearance exact path;
- normal direct Minkowski success;
- planned distance-field path for heavy geometry;
- deterministic direct Minkowski failure → distance-field fallback;
- `usedFallback` truth;
- executed implementation metadata truth;
- invalid tolerance fails before engine selection;
- fallback engine failure surfaces as a current real failure;
- cancellation/stale supersession is not mislabeled as geometric fallback.

---

# 9. Objective D — Make Python CI Reach and Pass `pytest`

## 9.1 Normalize text encoding first

Fix the tracked viewport README and any other tracked text file with corrupted/non-UTF-8 content.

Do not merely replace one visible `â€“` sequence if the file encoding itself is invalid.

Normalize the file as real UTF-8.

Preserve the intended wording/content.

Search the repository for common mojibake patterns in tracked text, such as:

```text
â€“
â€”
â€™
Ã
�
```

Treat matches as evidence to inspect, not automatic replacements.

Do not modify binary fixtures.

## 9.2 Define the authoritative Python tooling scope

The repository is mixed-language.

Python quality must cover all real Python source and Python tests, and must not fail because it traverses unrelated TypeScript/Markdown frontend surfaces.

Determine the authoritative scope from:
- `pyproject.toml`;
- package configuration;
- `mold/src/`;
- `mold/tests/`;
- any additional Python scripts that are actually part of the project.

Then encode that scope in the least surprising place:
- CI command arguments; or
- Ruff include/exclude configuration if that is the project-wide source of truth.

Do not weaken lint rules.

Do not exclude a failing Python file merely because fixing it is inconvenient.

## 9.3 Prevent encoding regression

Add the smallest justified repository-integrity harness that ensures tracked project text expected to be UTF-8 remains readable as UTF-8.

Acceptable approaches include:
- a small deterministic CI script over selected textual extensions;
- an existing repository integrity tool if one already exists.

Requirements:
- skip known binary formats;
- fail with file path, not file contents;
- never print secrets;
- keep the extension allowlist explicit and small enough to reason about.

Do not introduce a large lint framework for this.

## 9.4 Run Python tests for real

After lint/format repair:

```bash
pytest
```

must actually execute.

If failures appear that Execution 03 never reached, they become part of Execution 04 closure.

Do not label them “pre-existing, therefore irrelevant” merely because earlier CI was blocked before reaching them.

Classify each newly exposed failure:
- real current defect;
- stale test;
- environment-only issue;
- unrelated user work.

Repair all current in-scope defects needed for a green baseline.

---

# 10. Objective E — Close the CI/Security Aggregation Gap

## 10.1 Stable Quality Gate must mean what it says

Inspect `.github/workflows/ci.yml`.

The final stable aggregate gate must represent every required check for the event that triggered it.

At minimum it must account for:
- Python quality;
- Frontend quality;
- Repository integrity;
- npm high/critical audit gate;
- dependency review on pull requests.

On push, a PR-only job may legitimately be `skipped`.

On pull request, a required dependency-review failure must make the aggregate gate fail.

Implement event-aware aggregation intentionally.

Do not create a gate that treats `skipped` as universally successful without knowing why it was skipped.

## 10.2 Add explicit npm audit enforcement

After deterministic install, add an explicit high-severity audit gate equivalent to:

```bash
npm audit --audit-level=high
```

Use the package manager behavior/version actually present in the repository.

Do not use:

```bash
npm audit fix --force
```

inside CI.

If audit requires network and the repository has a documented offline CI mode, preserve determinism and explain the chosen mechanism.

## 10.3 Preserve current security hardening

Do not regress:
- pinned action SHAs;
- read-only default content permissions;
- concurrency cancellation;
- Dependabot configuration;
- dependency review severity threshold.

## 10.4 Optional Python dependency vulnerability check

Do not add a new Python security dependency blindly.

First inspect whether the repository already has:
- `pip-audit`;
- another Python advisory scanner;
- platform-native dependency review coverage sufficient for the current Python lock/metadata model.

If a small established Python audit gate is already available or clearly justified, integrate it consistently.

If not, document why Execution 04 leaves Python advisory scanning to Dependabot/dependency review rather than creating unnecessary tooling.

This optional point must not block completion unless a real vulnerability is discovered.

---

# 11. Objective F — Eliminate Test Harness Warnings

Warnings in tests are not automatically harmless.

They often indicate that the harness is asserting before the same state transitions a user would observe.

## 11.1 React `act(...)` warnings

Inspect warning-producing tests including current observed areas:
- `Viewport.test.tsx`;
- `App.test.tsx`;
- `MoldBodiesBrowser.test.tsx`;
- any additional suite exposed by the full run.

Repair with the correct React Testing Library pattern:
- `await userEvent...`;
- `await waitFor(...)`;
- explicit `act(...)` only around a transition that truly cannot be expressed through the public user interaction;
- correct async cleanup/unmount;
- awaiting store-driven updates where the component subscribes asynchronously.

Do not:
- suppress `console.error`;
- suppress `console.warn`;
- globally monkey-patch `act` warnings;
- add arbitrary sleeps;
- use timing delays to make tests pass.

## 11.2 React Refresh warning

Current warning source includes:

```text
mold/frontend/src/test/renderApp.tsx
react-refresh/only-export-components
```

Fix the module boundary cleanly.

Likely strategies may include separating a test-only component/provider from utility exports, but inspect the file before deciding.

Do not disable the rule globally.

## 11.3 Flake resistance

After fixing async lifecycle tests, rerun critical suites repeatedly.

At minimum run the previously failing/async-heavy focused set 5 consecutive times.

Required result:
- zero intermittent failures;
- zero unhandled rejection;
- zero `act(...)` warning;
- no test depending on execution order.

If Vitest randomization facilities already exist in the repository, use them.

Do not add a new test runner only for randomization.

---

# 12. Objective G — Close Production Build Warnings Without Hiding Them

## 12.1 Large main chunk

Observed production build reports a main JavaScript chunk above Vite's default warning threshold.

Do not solve this with:

```text
increase chunkSizeWarningLimit
```

alone.

First generate evidence:
- what modules dominate the main chunk;
- whether `manifold-3d`, Three.js, report engines, or mold-generation logic is being eagerly pulled into the initial shell;
- what is already lazy-loaded;
- whether workers/dynamic imports already provide a natural split boundary.

Prefer code splitting along real capability boundaries, for example:
- lazy 3D runtime;
- heavy geometry engine only when a geometry operation is invoked;
- analysis/report feature only when opened;
- worker-owned computation bundles remaining worker-owned.

Do not fragment tiny modules or create dozens of arbitrary chunks.

## 12.2 Performance correctness

Any code-splitting repair must preserve:
- first STL import;
- viewport ready lifecycle;
- Cavity worker startup;
- Segmentation worker startup;
- Sprue/Registration workflow;
- dynamic import error handling;
- exactly one runtime/canvas;
- current cancellation behavior.

Add or update tests where module loading behavior materially changes.

## 12.3 Measure before and after

Record before/after production build sizes in the final report.

The goal is not a vanity number.

The goal is to remove the warning through a meaningful load boundary while preserving behavior.

If analysis proves the remaining large chunk is an unavoidable third-party runtime unit that cannot be split safely, do not hide the warning. Report the evidence and completion must remain `PARTIALLY COMPLETE` unless the project already has an explicit accepted-warning policy.

---

# 13. Objective H — Classify and Repair the Manifold/Vite Browser Compatibility Warning

Observed build warnings mention `node:module` being externalized for browser compatibility from `manifold-3d`.

Do not assume this is harmless because the build exits `0`.

Do not assume it is broken because a warning exists.

## 13.1 Investigate the package entry contract

Inspect:
- installed `manifold-3d` package metadata;
- `exports` / browser conditions;
- current import sites;
- Vite configuration;
- worker imports;
- generated browser bundle behavior.

Determine whether Craft is importing:
- the intended browser/WASM entry;
- a generic module containing Node-only fallback code;
- a package path Vite cannot tree-shake correctly.

## 13.2 Allowed repair direction

Use the package's documented browser-compatible entry/condition if one exists and matches the installed version.

A narrowly justified Vite resolve condition/alias is acceptable only when it maps to an official browser entry and is protected by build + browser tests.

Do not polyfill Node's entire `module` package in the browser just to remove a warning.

## 13.3 Browser proof is mandatory here

After any import/resolve change:
- load the app in a real browser harness;
- exercise at least one Manifold-backed operation if practical;
- verify no uncaught runtime exception;
- verify WASM loads;
- verify worker path still works where used.

If the warning is truly unavoidable upstream but runtime proof is clean, document it as a third-party limitation and do not disguise it.

Again: unresolved warning means `PARTIALLY COMPLETE` unless there is a pre-existing explicit accepted-warning policy.

---

# 14. Objective I — Add Real-Browser Critical-Path Proof

## 14.1 Search before adding tooling

First inspect:
- `package.json` scripts;
- existing browser/e2e dependencies;
- existing Playwright/Cypress/Webdriver files;
- current test fixtures.

Reuse an existing browser harness if present.

If none exists and real-browser proof is required to close current runtime warnings, add the smallest established harness.

If a new harness is needed, Playwright is a reasonable default **only if** it fits current Node/Vite CI and does not introduce unnecessary architecture. Do not add it blindly if another harness already exists.

## 14.2 Minimum smoke scenario

Create one deterministic smoke spec before creating a large E2E suite.

The smoke path should prove as much of the following as the current public UI supports reliably:

```text
open app
→ app shell mounts
→ viewport initializes
→ exactly one canvas
→ import deterministic small STL fixture
→ model reaches ready state
→ model remains present/inspectable
→ open/close Constructed Cutting Plan or another current critical mold action if browser-stable
→ no uncaught page errors
→ no unhandled promise rejections
```

Where WebGL support in headless CI requires documented browser flags/software rendering, configure the smallest reliable settings.

Do not mock the entire viewport runtime in this browser test; otherwise it does not close the gap.

## 14.3 Fixture policy

Prefer a tiny deterministic ASCII STL fixture already in the repository or add one small text fixture.

Do not add a large binary model.

Do not download test geometry from the internet during CI.

## 14.4 Browser harness ownership

Keep browser tests under a clear frontend test/e2e location.

Do not mix them into Python tests.

Do not let the browser harness mutate repository files.

---

# 15. Objective J — Documentation and Semantic Hygiene Closure

## 15.1 Remove stale `.bak` claim

Update `mold/docs/agent/PROJECT_MAP.md` so it no longer claims active `*.bak` files exist if the current tree no longer contains them.

Do not replace one stale inventory sentence with another fragile dynamic claim.

Prefer durable guidance such as:

```text
backup/temp files are not active source and must not be tracked
```

rather than a current count.

## 15.2 Segmentation “draft” residue

Search active production source/tests/docs for obsolete terms such as:

```text
draft session
segmentation draft
automatic draft
manual draft
More Molds
One Mold
make-as-one-mold
make-as-more-molds
```

Do not delete the word `draft` when it refers to genuine unrelated concepts such as Draft Analysis / mold draft angle.

Only remove terminology inherited from the deleted multi-draft Segmentation workflow.

Prefer neutral surviving terms:

```text
segmentation state
segmentation store instance
segmentation session
segmentation result
```

where they match current behavior.

## 15.3 Documentation must reflect completed behavior

Update only documents directly made stale by Execution 04.

Do not rewrite historical Execution 01/02/03 documents to pretend history was different.

Historical execution prompts are records.

Current architecture docs should describe current reality.

---

# 16. Objective K — Cross-System Regression Sweep

Execution 04 touches state boundaries, lifecycle ownership, workers, CI, and potentially lazy-loading.

Therefore focused green tests are not enough.

Run a cross-system regression sweep covering at least:

## 16.1 Viewport
- runtime creation/disposal;
- STL import;
- replacement;
- selection;
- measurement;
- grounding/orientation;
- mold-parts rendering;
- Sprue preview;
- Segmentation visualization;
- Mold Scale runtime;
- exactly one canvas.

## 16.2 Cut by Face / workflow
- create mold parts;
- add/move/remove split;
- final split removal invalidation;
- derived-state invalidation;
- atomic rebuild presentation continuity;
- Undo/Redo.

## 16.3 Segmentation
- planning;
- fit analysis;
- worker execution;
- extension-axis validation;
- commit promotion;
- scale regeneration;
- stale result rejection.

## 16.4 Cavity
- exact/zero-clearance path;
- Minkowski path;
- distance-field path;
- fallback path;
- worker client;
- integration;
- tolerance policy.

## 16.5 Sprue
- create;
- move;
- resize;
- remove;
- pending intent;
- resolved geometry;
- topology invalidation;
- stale async success/failure protection.

## 16.6 Registration
- initial generation;
- post-Cavity;
- post-Sprue;
- post-scale;
- split add/move/remove;
- stale async rejection if applicable;
- Undo/Redo.

## 16.7 App shell
- app mount;
- mobile/drawer state tests;
- status/context surfaces still compile and render;
- no new React warnings.

---

# 17. Loop Engineering — Mandatory Execution Loops

Do not perform Execution 04 as a single large edit.

Use the following loop sequence.

## Loop 0 — Evidence Freeze

**Goal:** know exactly what is broken before changing anything.

Actions:
1. record Git state;
2. run the three known failing frontend tests individually;
3. run full frontend test suite once;
4. run frontend typecheck/lint/build and capture warning classes;
5. run Python Ruff commands and capture the exact first blocker;
6. run `pytest` separately if possible even while Ruff is red, so hidden Python failures are discovered early;
7. inventory current CI jobs;
8. inspect `PROJECT_MAP.md` stale claims;
9. inspect current bundle output sizes.

Exit condition:
- a written local evidence map exists in working notes;
- every known red gate has a reproduction or a reason it no longer reproduces.

## Loop 1 — Characterization Harness

**Goal:** make ambiguous contracts executable before repair.

Actions:
- add/fix the smallest test needed to distinguish authoritative vs presentation geometry;
- make the Cavity fallback failure deterministic;
- characterize current Mold Scale lifecycle ownership;
- add missing current-failure/stale-failure assertions only where needed.

Exit condition:
- tests fail for the intended reason before production repair, when practical.

## Loop 2 — Authoritative/Presentation State Repair

**Goal:** fix Failure A without weakening freshness.

Actions:
- separate strict current authority from bounded display continuity;
- preserve request/document freshness gates;
- add atomic swap tests;
- test terminal failure semantics.

Exit condition:
- Failure A passes;
- stale geometry still cannot feed downstream operations.

## Loop 3 — Registration/Scale Lifecycle Repair

**Goal:** establish one lifecycle owner.

Actions:
- trace scale transition;
- choose the authoritative contract from evidence;
- simplify duplicate transitions;
- align tests and callers to the chosen contract;
- verify downstream invalidation/regeneration and Undo/Redo.

Exit condition:
- Failure B passes for a reason that matches the documented lifecycle;
- no contradictory passing test was silently broken or deleted.

## Loop 4 — Cavity Fallback Repair

**Goal:** make execution metadata and actual fallback behavior agree.

Actions:
- deterministic direct-engine failure;
- narrow catch classification;
- fallback execution;
- truthful result metadata;
- cancellation/stale isolation.

Exit condition:
- Failure C passes;
- direct and planned-distance paths remain green.

## Loop 5 — Python Boundary + Encoding Repair

**Goal:** make Python CI actually test Python.

Actions:
- normalize tracked text encoding;
- define Ruff scope;
- add UTF-8 integrity check;
- run Ruff;
- run full pytest;
- repair any newly exposed Python failures.

Exit condition:
- Ruff + pytest all pass locally.

## Loop 6 — CI/Security Closure

**Goal:** make the stable Quality Gate semantically complete.

Actions:
- add explicit npm audit failure behavior;
- aggregate event-appropriate security jobs;
- preserve pinned actions/permissions/concurrency;
- validate workflow syntax/reasoning.

Exit condition:
- push and PR event logic are both explainable and no failed required security job can be masked by the aggregate gate.

## Loop 7 — Warning Elimination

**Goal:** remove harness and build noise through root-cause repairs.

Actions:
- React `act` warnings;
- React Refresh lint warning;
- bundle analysis/splitting;
- Manifold/Vite warning investigation.

Exit condition:
- warnings are gone, or a genuine third-party blocker is proven and status remains non-complete.

## Loop 8 — Browser Harness

**Goal:** prove the real browser runtime.

Actions:
- reuse/add minimal e2e harness;
- run deterministic smoke path;
- capture page errors/console failures;
- exercise Manifold/WASM path if practical.

Exit condition:
- browser smoke is repeatable and green.

## Loop 9 — Semantic / Dead-Context Sweep

**Goal:** remove stale post-03 residue.

Actions:
- update `PROJECT_MAP.md`;
- remove obsolete Segmentation draft wording;
- search banned/historical residue patterns;
- verify no temp/backup artifacts returned.

Exit condition:
- current docs describe current architecture without fake live Git state or deleted-file claims.

## Loop 10 — Full Green Closure

**Goal:** prove the repository, not a feature.

Actions:
- clean dependency install;
- frontend full gates;
- Python full gates;
- browser smoke;
- repository integrity;
- security audit;
- repeated focused async tests;
- diff review.

Exit condition:
- every mandatory local gate is green.

---

# 18. Harness Engineering / Hardness Discipline

The harness is part of the product repair.

## 18.1 No green-by-mock illusion

A test that mocks the exact layer containing the bug does not prove the bug is fixed.

Use unit seams for deterministic failure injection, but preserve at least one integration test through the real store/orchestrator boundary.

## 18.2 No sleep-based correctness

Never use:

```ts
await new Promise(resolve => setTimeout(resolve, 100));
```

as the primary proof of async ordering.

Prefer controlled deferred promises, explicit worker test doubles, or observable phase transitions.

## 18.3 Stale-result hardness cases

For each repaired async boundary, consider adversarial ordering:

```text
A starts
B starts
A succeeds
B succeeds
```

```text
A starts
B starts
A fails
B succeeds
```

```text
A starts
B starts
B succeeds
A fails late
```

```text
A starts
cancel A
B starts
A posts progress late
```

Only add cases relevant to the actual shared state boundary.

## 18.4 Identity assertions

Where stale commit protection depends on:
- `requestId`;
- `document.revision`;
- `document.fingerprint`;
- model geometry signature;
- lifecycle epoch;

assert the identity contract directly in focused tests.

Do not infer it indirectly only from UI text.

## 18.5 Repeatability gate

Previously failing focused tests and new async lifecycle tests must pass at least 5 consecutive runs before closure.

If a test is flaky:
- fix the synchronization model;
- do not increase timeout as the first response.

## 18.6 Negative assertions

Critical tests must assert what does **not** happen, for example:
- old Registration ID does not survive scale;
- old Sprue resolved target does not survive topology replacement;
- stale request does not set current error;
- last-known-good presentation does not become authoritative;
- direct-engine cancellation does not become fallback;
- skipped dependency review does not hide a PR security failure.

---

# 19. Prompt Engineering Guardrails for the Coding Agent

When choosing among several possible repairs, use this decision order:

1. preserve an existing invariant if it is correct;
2. clarify ownership;
3. delete duplicated behavior;
4. strengthen types/contracts;
5. add the smallest missing state distinction;
6. add regression tests;
7. only then add a new abstraction.

Before each code change, answer internally:

```text
What invariant is broken?
Who owns this state?
What is the minimal repair surface?
Which downstream systems can this change invalidate?
What test proves the repair and prevents regression?
```

Do not optimize for minimum changed lines.

Optimize for minimum new complexity consistent with a durable invariant.

---

# 20. Forbidden Shortcuts

Execution 04 is invalid if it reaches green through any of these shortcuts:

- changing a failing expectation without proving the current production contract is correct;
- loosening `sourceRevision` / `sourceFingerprint` freshness;
- letting stale bodies feed downstream generation;
- setting `usedFallback = true` without a real fallback execution;
- catching every Minkowski exception and always using distance field;
- excluding a real failing Python package from Ruff;
- removing Python tests from CI;
- `continue-on-error: true` for required quality/security checks;
- raising Vite chunk warning threshold to hide the warning;
- suppressing React warnings through console mocks;
- disabling ESLint rules globally;
- deleting difficult regression tests;
- increasing timeouts to hide race conditions;
- using `npm audit fix --force`;
- introducing a frontend↔Python backend bridge;
- replacing the geometry engine;
- redesigning the user interface;
- adding “temporary compatibility” APIs for deleted One Mold/More Molds semantics;
- committing generated browser artifacts or local reports;
- pushing without explicit user permission.

---

# 21. Semantic Search / Grep Gates

Use repository-appropriate search tools (`git grep`, `rg`, IDE search) and inspect matches semantically.

## 21.1 Removed segmentation-mode residue

Search active source for:

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
Segmentation as More Molds
Segmentation as One Mold
make-as-one-mold
oneMold
OneMold
```

Expected result:
- zero active production references unless a concrete historical/test-fixture reason is documented.

## 21.2 Obsolete segmentation-draft residue

Search for `draft` only inside Segmentation-related paths.

Classify each hit:
- obsolete multi-draft residue → rename/remove;
- genuine draft-angle analysis → preserve;
- historical Execution document → preserve.

## 21.3 Repository pollution

Search tracked file names for:

```text
*.bak
*.orig
*.rej
.stage-work
.chapter10
*-diff.txt
*typecheck.txt
```

Expected result:
- no active tracked pollution.

## 21.4 Encoding residue

Search textual source/docs for visible mojibake markers.

Expected result:
- zero unexplained current-text matches.

---

# 22. Recommended Focused Test Order

Do not wait for a 1000+ test suite after every edit.

Use progressively wider rings.

## Ring 1 — exact failures

```bash
npm run test:run -- src/features/mold-generation/workflow/moldWorkflow.integration.test.ts
npm run test:run -- src/features/mold-generation/registration/registrationLifecycle.store.test.ts
npm run test:run -- src/features/mold-generation/cavity-generation/cavityOffset.orchestrator.test.ts
```

Adapt syntax only if current scripts require it.

## Ring 2 — neighboring lifecycle suites

Run focused groups for:
- split-face;
- registration;
- cavity-generation;
- sprue-generation;
- segmentation;
- mold workflow;
- viewport mold/scale presentation.

## Ring 3 — frontend full suite

```bash
npm run test:run
```

## Ring 4 — frontend quality

```bash
npm run typecheck
npm run lint
npm run build
```

## Ring 5 — Python

```bash
ruff check <authoritative-python-scope>
ruff format --check <authoritative-python-scope>
pytest
```

## Ring 6 — browser

Run the current/added browser smoke command.

## Ring 7 — security/integrity

```bash
npm audit --audit-level=high
git diff --check
git status --short
git diff --stat
```

---

# 23. CI Workflow Acceptance Matrix

After edits, reason through both event classes.

## Push to `main`

Required outcome:

```text
Python quality        PASS
Frontend quality      PASS
Repository integrity  PASS
npm/security gate     PASS
Dependency review     SKIPPED if PR-only
Quality gate          PASS
```

## Pull request to `main`

Required outcome:

```text
Python quality        PASS
Frontend quality      PASS
Repository integrity  PASS
npm/security gate     PASS
Dependency review     PASS
Quality gate          PASS
```

If any required child is `failure` or `cancelled`, aggregate Quality Gate must fail.

If an event-required child is unexpectedly `skipped`, aggregate Quality Gate must fail or explicitly detect the misconfiguration.

---

# 24. Browser Acceptance Matrix

Minimum browser smoke evidence:

| Check | Required |
|---|---|
| app loads | yes |
| no uncaught page exception | yes |
| exactly one viewport canvas | yes |
| viewport reaches ready/usable state | yes |
| deterministic STL path exercised | yes where current UI allows |
| model-ready path observed | yes |
| no duplicate runtime on rerender/navigation used by smoke | yes |
| Manifold/WASM path smoke-tested after import/resolve changes | mandatory if such changes are made |
| screenshot artifact | optional, do not require if harness assertion is stronger |

Do not make screenshot pixels the sole correctness assertion for 3D geometry.

---

# 25. Scope Boundaries — Do Not Expand Into Feature Work

Execution 04 does **not** include:
- Generative Design;
- Mesh Repair feature development;
- composite mold generation;
- undercut product UX;
- new CAD editing tools;
- new export formats;
- STEP/IGES import;
- cloud compute;
- frontend↔Python HTTP/WebSocket/subprocess bridge;
- authentication/billing;
- deployment architecture;
- Spline/Webpage 2.0 visual redesign;
- Registration geometry redesign beyond lifecycle correctness;
- new Segmentation algorithm research;
- new Cavity algorithm research beyond fallback correctness;
- new Sprue geometry policy;
- changing product manufacturing defaults.

If a discovered blocker truly requires one of these, stop and report it rather than silently turning Execution 04 into a feature rewrite.

---

# 26. File-Change Discipline

Before editing a file:
- identify why it is in scope;
- find its tests;
- identify importers/consumers;
- identify whether it is active production, test, docs, CI, or generated support.

After editing a file:
- run its nearest focused test/gate;
- inspect diff immediately;
- remove accidental formatting churn unrelated to the repair.

Do not reformat the entire repository as a side effect of fixing one README encoding issue.

---

# 27. Diff Hardness Review

Before the final full suite, inspect:

```bash
git diff --check
git diff --stat
git diff --name-status
```

Then review the actual diff in logical groups:

1. state-model repair;
2. Registration lifecycle;
3. Cavity fallback;
4. Python/encoding;
5. CI/security;
6. test warning cleanup;
7. bundle/import changes;
8. browser harness;
9. docs/semantic cleanup.

For every unexpectedly touched file, answer:

> Why did Execution 04 need this file?

If there is no good answer, revert that file's unrelated change without discarding user work.

---

# 28. Completion Failure Conditions

Final status must be `PARTIALLY COMPLETE` or `BLOCKED` if any of the following remains:

- any of the three known frontend failures still fails;
- any newly exposed current frontend failure remains;
- Python `pytest` did not execute;
- Python `pytest` fails;
- Ruff is green only because real Python files were excluded;
- npm high/critical audit remains unresolved;
- aggregate Quality Gate can mask a required security failure;
- stale geometry becomes authoritative to preserve display continuity;
- Registration/Scale ownership remains contradictory;
- Cavity fallback remains nondeterministic or metadata lies;
- React critical test warnings remain unexplained;
- production bundle warning is merely hidden;
- Manifold browser warning remains unexplained without browser proof;
- no real-browser smoke can be executed and no explicit environment blocker is reported;
- current architecture docs still contain known stale claims introduced/left by Execution 03/04;
- semantic grep finds active deleted-mode compatibility residue;
- repository integrity gate is red.

Do not dilute these conditions in the final report.

---

# 29. Final Report — Required Format

Return the final report in this exact section order.

## 1. Decision

One of:

```text
REMOTE VERIFIED COMPLETE
LOCAL COMPLETE — REMOTE VERIFICATION PENDING
PARTIALLY COMPLETE
BLOCKED
```

Add one sentence explaining why.

## 2. Repository State

Report:
- branch;
- starting HEAD;
- ending HEAD if changed by pre-existing/user actions;
- working-tree status;
- whether unrelated pre-existing changes existed.

Do not claim a push/commit that you did not perform.

## 3. Starting Failures Reproduced

For each known failure:
- reproduced yes/no;
- exact root cause found;
- whether it was production bug, lifecycle contract mismatch, stale test, or environment issue.

## 4. Authoritative vs Presentation Geometry Repair

Explain:
- previous failure;
- final invariant;
- authoritative selector/path;
- presentation-only continuity path;
- why stale bodies cannot feed downstream operations;
- tests added/updated.

## 5. Registration × Mold Scale Lifecycle

Explain:
- chosen lifecycle owner;
- why it matches repository behavior;
- what duplicate/contradictory path was removed or repaired;
- invalidation/regeneration behavior;
- Undo/Redo behavior;
- tests.

## 6. Cavity Fallback Repair

Explain:
- actual root cause;
- deterministic failure harness;
- planned engine vs executed engine semantics;
- fallback metadata;
- cancellation/error classification;
- tests.

## 7. Python CI / Encoding

Report:
- files normalized to UTF-8;
- final Ruff scope and why it is authoritative;
- UTF-8 regression check;
- Ruff results;
- pytest count/result;
- newly exposed Python failures, if any, and repairs.

## 8. CI / Security

Report:
- npm audit gate result;
- dependency review aggregation behavior;
- push-event gate behavior;
- PR-event gate behavior;
- action pinning/permissions preserved;
- any security check not implemented and why.

## 9. Warning Closure

Report separately:
- ESLint warnings;
- React `act(...)` warnings;
- Vite chunk warning;
- Manifold/Vite browser warning.

For each: `FIXED`, `PROVEN THIRD-PARTY LIMITATION`, or `UNRESOLVED`.

`UNRESOLVED` prevents Complete status.

## 10. Browser Harness

Report:
- harness used;
- browser/version if available;
- smoke steps;
- canvas count;
- STL/model-ready proof;
- page/console errors;
- Manifold/WASM proof if relevant.

## 11. Documentation / Semantic Cleanup

Report:
- `PROJECT_MAP` stale claims removed;
- obsolete Segmentation draft semantics removed or classified;
- backup/temp grep result;
- mojibake grep result.

## 12. Files Changed

Group by:
- production state/lifecycle;
- tests;
- CI/security;
- browser harness;
- docs/tooling.

Do not dump an unstructured file list without reasons.

## 13. Harness Results

Include exact commands and outcomes for:
- focused failing tests;
- repeated async tests;
- full frontend tests;
- typecheck;
- lint;
- build;
- npm audit;
- Ruff;
- pytest;
- browser smoke;
- `git diff --check`.

Include test counts where tools report them.

## 14. Bundle / Runtime Measurements

Report:
- main chunk before/after if changed;
- major worker chunk changes if material;
- whether warning threshold was changed;
- whether Manifold import path changed;
- browser regression result.

## 15. Remaining Risks

Write `None known within Execution 04 scope` only if that statement is actually true.

Otherwise enumerate concrete residual risks.

## 16. Remote Verification

Report exact GitHub Actions status only if the final commit has been pushed and inspected.

Otherwise write:

```text
Remote verification pending user push; all reported green results are local.
```

---

# 30. Final Acceptance Checklist

Before sending the final report, answer every item.

## State
- [ ] authoritative/current geometry freshness remains strict;
- [ ] last-known-good presentation is explicitly non-authoritative;
- [ ] atomic rebuild swaps correctly;
- [ ] stale late completion cannot restore old presentation/authority.

## Registration / Scale
- [ ] one lifecycle owner is documented in code/tests;
- [ ] old Registration never survives incorrectly;
- [ ] downstream Cavity/Sprue truth is coherent;
- [ ] Undo/Redo is coherent.

## Cavity
- [ ] deterministic direct-failure harness;
- [ ] fallback actually executes;
- [ ] `usedFallback` is truthful;
- [ ] invalid input is not swallowed;
- [ ] cancellation is not called fallback.

## Frontend
- [ ] `npm ci` pass;
- [ ] typecheck pass;
- [ ] lint pass;
- [ ] build pass;
- [ ] full tests pass;
- [ ] known three failures closed;
- [ ] critical React warnings closed;
- [ ] React Refresh warning closed.

## Python
- [ ] UTF-8 issue repaired;
- [ ] Ruff scope correct;
- [ ] Ruff check pass;
- [ ] Ruff format pass;
- [ ] pytest actually ran;
- [ ] pytest pass.

## Security / CI
- [ ] npm high audit gate pass;
- [ ] dependency review preserved;
- [ ] aggregate gate covers required event checks;
- [ ] pinned actions preserved;
- [ ] least-privilege permissions preserved.

## Build/runtime
- [ ] large-chunk warning closed without threshold hiding;
- [ ] Manifold warning fixed or proven unavoidable with browser proof;
- [ ] real-browser smoke green;
- [ ] one canvas;
- [ ] no page error.

## Context hygiene
- [ ] stale `.bak` documentation claim removed;
- [ ] obsolete Segmentation draft residue removed/classified;
- [ ] no tracked temp/backup artifacts;
- [ ] no unexplained mojibake.

## Repository
- [ ] `git diff --check` pass;
- [ ] final diff reviewed;
- [ ] no unrelated user work discarded;
- [ ] no unauthorized Git operation performed.

If any mandatory box is unchecked, do not report Complete.

---

# 31. Execution Summary for the Coding Agent

Your job is not to make three red tests green in isolation.

Your job is to make the repository trustworthy.

The central engineering corrections are:

```text
strict authority
+
bounded presentation continuity
```

```text
one upstream lifecycle owner
+
truthful downstream invalidation/regeneration
```

```text
deterministic geometry fallback
+
truthful execution metadata
```

```text
language-scoped CI
+
actual tests reached
```

```text
security checks
+
aggregate gate that cannot mask them
```

```text
unit/integration proof
+
real-browser proof
```

Do not stop at symptom repair.

Do not introduce a new architecture unless the current one cannot express the invariant with a smaller change.

Do not trade correctness for a green badge.

Create the green badge by making the correctness executable.

---

# 32. Required End State

The intended end state of Execution 04 is:

```text
Craft main baseline
│
├── Authoritative mold state: strict, current, identity-guarded
├── Presentation continuity: explicit, bounded, non-authoritative
├── Cut by Face / Segmentation: regression-safe
├── Cavity fallback: deterministic and truthful
├── Sprue stale-state protection: preserved
├── Registration / Scale lifecycle: single-owner and coherent
├── Frontend quality: green
├── Python quality: green and actually tested
├── Security: explicit high-severity gate + PR review
├── CI aggregate: event-correct
├── Test harness: warning-clean and race-resistant
├── Browser smoke: real runtime proof
├── Build: warnings closed, not hidden
├── Repository context: current and durable
└── Git diff: clean and explainable
```

Only after this baseline exists should the project move to the next feature architecture or engine expansion.
