# Craft — Execution 05
## Final Baseline Closure: Browser Harness Recovery + Evaluation Terminal-State Integrity + Warning Closure + Segmentation Semantic Cleanup

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 05/`  
**Observed starting reference while constructing this execution:** `main` at `aa1469daae173beda691021e69bf72845f10d754` (`Update project`)  
**Execution type:** hardening / closure only — no new product feature work  
**Primary objective:** close the remaining post-Execution-04 gaps so Craft has one genuinely green, browser-proven, warning-controlled, state-consistent baseline that can be trusted as the foundation for the next engineering phase.  
**Engineering doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline.

---

# 0. Mission

Execution 05 exists because Execution 04 repaired most of the concrete failures left after Execution 03, but strict post-execution verification found that the repository still cannot honestly be called a fully closed green baseline.

Execution 04 successfully achieved substantial closure:

- the previously failing frontend Vitest suite became green;
- the Registration × Mold Scale lifecycle was repaired;
- Cavity direct-Minkowski → distance-field fallback became deterministic and testable through dependency injection;
- Python Ruff scope was corrected to the actual Python package/test boundary;
- Python CI now reaches and passes `pytest`;
- tracked text is checked for UTF-8 validity;
- ordinary frontend CI now performs a high-severity npm audit;
- the stable Quality Gate aggregates the primary quality jobs plus PR dependency review;
- a Playwright browser-smoke harness was introduced;
- last-known-good visual continuity was added for a replacement evaluation in flight;
- stale derived geometry protections from earlier executions were preserved.

The current remote baseline at the observed starting reference is much stronger than before Execution 04:

```text
Frontend quality:
  typecheck      PASS
  lint           PASS
  build          PASS, with warnings
  Vitest         182 files passed / 2 skipped
                 1069 tests passed / 5 skipped

Python quality:
  Ruff lint      PASS
  Ruff format    PASS
  pytest         357 passed

Repository integrity:
  PASS

npm audit:
  0 vulnerabilities at the observed run
```

However, the same exact GitHub Actions run is still red:

```text
Browser smoke:
  FAILURE

Quality gate:
  FAILURE
```

The browser job did not prove the product path. It timed out while waiting for the configured Playwright web server before the actual smoke test could establish the required browser evidence.

Additional strict code review also found a real lifecycle defect in the current `createMoldParts(...)` failure path:

```text
evaluation.phase
can remain
"evaluating"
after a genuine current failure
```

That means the store can continue behaving as if replacement work is still in flight after the Promise has already failed, which can keep last-known-good presentation logic and capability gating in the wrong state.

Other residual gaps remain:

1. Playwright browser-smoke server startup is broken or insufficiently diagnosed;
2. remote Quality Gate is therefore red;
3. `createMoldParts(...)` does not guarantee a terminal evaluation state on genuine failure;
4. the current presentation selector relies on `evaluation.phase === "evaluating"` as a bounded continuity condition, making the defect above materially relevant;
5. React tests still emit `act(...)` warnings;
6. the production Vite build still emits a large-chunk warning;
7. Vite still reports `node:module` externalization from `manifold-3d`;
8. browser proof is not yet available to classify the Manifold warning as harmless or unsafe;
9. the surviving Segmentation implementation still contains obsolete “draft” wording inherited from the removed multi-draft product model;
10. the Quality Gate can be made more explicit about acceptable versus unacceptable `skipped` results;
11. Playwright failure diagnostics are weak when failure occurs before the browser spec itself can create a normal report.

Execution 05 must close these gaps from root cause.

The target baseline is:

```text
current authoritative document
+ bounded presentation continuity
+ terminal async lifecycle semantics
+ deterministic worker/result commit ownership
+ green frontend
+ green Python
+ green repository integrity
+ green browser smoke
+ green aggregate Quality Gate
+ no unexplained React warnings
+ no unexplained build warnings
+ no obsolete Segmentation mode/draft semantics
= trusted Craft baseline
```

This is a closure execution.

Do not add a new product feature merely because the touched subsystem provides an opportunity.

---

# 1. Non-Negotiable Definition of Complete

Do not report `COMPLETE` because:

- all unit tests pass;
- the Playwright config exists;
- the browser job starts;
- a previous local run passed;
- most warnings are harmless;
- only one CI job remains red;
- a failure path “probably” cannot happen in production;
- the visible result looks right while lifecycle state is internally wrong.

Execution 05 is complete only when every applicable gate below is satisfied with evidence.

---

## 1.1 Frontend quality gate

From:

```text
mold/frontend/
```

run:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
```

Required:

- every command exits `0`;
- zero failing Vitest files;
- zero failing Vitest tests;
- no critical regression test newly skipped;
- no TypeScript error;
- no ESLint error;
- no ESLint warning introduced by this execution;
- no `act(...)` warning in the touched/critical React suites;
- no build warning hidden by raising a warning threshold;
- any remaining third-party build warning must be explicitly classified with reproducible browser evidence and a written reason why changing application semantics merely to silence it would be less correct.

---

## 1.2 Browser proof gate

The existing Playwright harness must become operational.

At minimum, the browser-smoke job must actually execute the spec and prove:

```text
app boots
→ /workspace loads
→ viewport reaches Ready
→ exactly one canvas exists
→ deterministic STL fixture imports through the real runtime
→ imported model reaches ready state
→ canvas count remains exactly one
→ no uncaught page error
→ no unexpected console error
→ app remains usable
```

This must run against the production preview/build path, not a mocked Zustand-only environment.

The browser harness is not considered fixed merely because:

- the web-server timeout was increased;
- `reuseExistingServer` was changed;
- a `sleep` was added;
- the readiness URL was changed to something that does not exercise the actual app;
- the browser test was skipped in CI.

The server-startup cause must be diagnosed.

---

## 1.3 Remote CI gate

The exact pushed commit is acceptable as remotely complete only when the required GitHub Actions jobs for that event are green.

For an ordinary push to `main`, expected required results are equivalent to:

```text
Python quality        success
Frontend quality      success
Browser smoke         success
Repository integrity  success
Dependency review     skipped   # legitimate on non-PR push
Quality gate          success
```

For a pull request, dependency review must be:

```text
success
```

not skipped.

Do not call:

```text
REMOTE VERIFIED COMPLETE
```

unless the exact pushed commit is actually green.

If the coding agent is not authorized to push, it may finish as:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

only if every local acceptance criterion passes.

---

## 1.4 State-machine integrity gate

Every async operation must end in one of the operation’s legitimate terminal states.

No operation may leave:

```text
evaluation.phase === "evaluating"
```

after that operation has genuinely failed and no current evaluation remains in flight.

The current post-Execution-04 concern is specifically:

```text
createMoldParts(...)
```

but this execution must inspect structurally similar paths too.

Required invariant:

```text
evaluation.phase === "evaluating"
IFF
a current, authoritative derived-mold evaluation request is genuinely in flight
```

Do not weaken this to:

```text
evaluation.phase is sometimes stale but the UI still looks fine
```

because capability gates and presentation continuity read this state.

---

## 1.5 Presentation continuity gate

The visible mold may continue showing a last-known-good result only under an explicit bounded replacement-in-flight contract.

Required distinction:

```text
authoritative geometry
!=
presentation geometry
```

when necessary during replacement.

A prior committed result may be presented temporarily only if all of the following remain true:

- a newer evaluation really is in flight;
- the prior result belongs to the same model/session lineage;
- it is not used as authoritative input;
- it cannot be exported or consumed as if it belonged to the current document unless the export contract explicitly requests last-known-good presentation;
- the continuity window ends on success, genuine failure, cancellation, reset, topology invalidation, model replacement, or supersession according to the operation’s intended lifecycle.

---

## 1.6 Warning-control gate

Warnings are not automatically bugs.

But warnings may not remain unexplained.

Execution 05 must close or classify:

```text
React act(...) warnings
Vite large-chunk warning
manifold-3d / node:module externalization warning
```

Rules:

- fix application/test-owned warnings where correctness can be improved;
- do not silence warnings with threshold inflation, console mocking, broad ignore filters, or fake no-op shims;
- a third-party/tooling warning may remain only if:
  - real-browser proof is green;
  - the warning is reproducible;
  - no runtime error occurs;
  - the package’s supported browser contract is verified;
  - an attempted safe application-level repair would require an unjustified alias/polyfill/fork or architecture regression;
  - the final report records it as a controlled external limitation.

---

## 1.7 Segmentation semantic gate

The current product model is:

```text
Constructed Cutting Plan
├── Cut by Face
└── Segmentation
```

There is no active multi-draft Segmentation product model.

Execution 05 must remove obsolete Segmentation “draft” terminology where it refers to the old product/session concept.

Do not touch genuine:

```text
draft angle
draft analysis
draft classification
draft-analysis/
```

because those are actual mold-engineering concepts unrelated to the removed Segmentation draft model.

---

## 1.8 Regression gate

The following previously repaired capabilities must remain green:

- Cut by Face;
- Eraser final-plane derived-state invalidation;
- non-final topology invalidation;
- Cavity generation;
- Cavity deterministic fallback;
- Sprue create/move/resize/remove;
- stale Sprue async commit protection;
- Registration generation;
- Registration after Mold Scale;
- Segmentation printer-fit behavior;
- Segmentation stale-worker guards;
- Segmentation extension axis;
- Segmentation Mold Scale regeneration;
- body visibility continuity;
- model replacement cleanup;
- STL import runtime lifecycle;
- exactly-one-canvas viewport lifecycle.

---

# 2. Source-of-Truth Order — Context Engineering Contract

Use this order:

1. current repository files;
2. current live Git state;
3. reproducible behavior;
4. current tests;
5. current CI logs;
6. current workflow definitions;
7. current dependency/package metadata;
8. stable architecture documentation;
9. this Execution 05 prompt;
10. previous Execution prompts only for historical intent.

If repository state has changed after the observed starting reference:

```text
aa1469daae173beda691021e69bf72845f10d754
```

do not force the repository back to the prompt.

Re-audit the current state and apply the invariant, not the stale line number.

---

# 3. External Research Baseline

Execution 05 was constructed with additional verification against current official documentation.

The following facts are useful investigation constraints, not substitute evidence for this repository.

## 3.1 Playwright `webServer`

Official Playwright documentation establishes:

- `webServer.command` starts the application server before tests;
- `webServer.url` is used as readiness criteria;
- the server is considered ready when the configured URL becomes reachable with an acceptable HTTP response;
- the default startup timeout is 60 seconds;
- `stdout` is ignored by default;
- `stderr` is piped by default;
- `stdout: "pipe"` and `stderr: "pipe"` are available for startup diagnosis;
- `cwd` may be explicitly configured;
- increasing timeout is valid when a server is genuinely slow, but timeout inflation is not root-cause analysis.

Use these facts to diagnose the current startup failure.

## 3.2 Vite preview

Official Vite documentation establishes:

- preview normally uses port `4173`;
- `preview.host` / `--host` controls the bind address;
- `strictPort` causes failure rather than silently moving to another port;
- production preview should serve an already-built production bundle.

Therefore, a deterministic CI smoke path may explicitly bind:

```text
127.0.0.1:4173
```

if repository evidence shows host binding is the actual problem.

Do not change host blindly before reproducing.

## 3.3 Vite code splitting

Current Vite documentation supports:

- dynamic imports as code-splitting boundaries;
- explicit build chunking through current Rolldown output configuration;
- automatic preload handling for async chunks.

Use real dependency/module analysis to split the large bundle.

Do not merely raise:

```text
chunkSizeWarningLimit
```

to make the warning disappear.

## 3.4 React `act(...)`

Current React documentation requires updates caused by test interactions to be awaited/wrapped through the testing environment’s `act(...)` semantics.

React Testing Library normally handles common user interactions when they are awaited correctly.

Do not suppress the warning.

Fix the test scheduling or async interaction.

## 3.5 GitHub Actions `needs`

Current GitHub Actions documentation establishes:

- a job with `needs` normally requires needed jobs to succeed;
- if a needed job fails or is skipped, downstream dependent jobs are skipped unless their `if` condition permits continuation;
- `if: always()` allows an aggregate gate to run even after a dependency fails.

Execution 05 should keep an aggregate Quality Gate that runs after all quality jobs and rejects unacceptable job results explicitly.

## 3.6 Manifold browser support

Current Manifold documentation and package information state that:

- `manifold-3d` is the supported WASM package;
- it is intended to run in modern browsers;
- the documented usage is a normal module import followed by asynchronous WASM initialization.

Therefore:

```text
node:module externalization warning
```

must not be automatically dismissed as “Manifold is Node-only.”

The package claims browser support.

The correct classification depends on real Craft browser execution.

---

# 4. Session Bootstrap — Required Before Any Edit

Start from repository root.

Record:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
```

If the working tree is dirty:

- inventory pre-existing changes;
- preserve them;
- do not attribute them to Execution 05;
- avoid destructive cleanup.

Read at minimum:

```text
AGENTS.md
mold/docs/agent/PROJECT_MAP.md
mold/docs/agent/ENGINEERING_LOOP.md
mold/docs/agent/WORKFLOW_POLICY.md
README.md
```

Then inspect current versions of:

```text
.github/workflows/ci.yml

mold/frontend/package.json
mold/frontend/package-lock.json
mold/frontend/vite.config.ts
mold/frontend/playwright.config.ts
mold/frontend/e2e/
mold/frontend/src/test/

mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
mold/frontend/src/features/mold-generation/workflow/
mold/frontend/src/features/mold-generation/cavity-generation/
mold/frontend/src/features/mold-generation/registration/
mold/frontend/src/features/mold-generation/sprue-generation/
mold/frontend/src/features/mold-generation/segmentation/
mold/frontend/src/features/viewport/
```

Do not make the first code edit until you can explain:

```text
why Browser Smoke cannot reach its web server
```

or, if the failure no longer reproduces, what changed.

---

# 5. Starting Evidence — Reproduce Before Repair

The evidence below was observed on the exact starting reference.

Re-run it.

Do not assume it still holds if the repository changed.

---

## 5.1 Remote CI baseline

Observed GitHub Actions on:

```text
aa1469daae173beda691021e69bf72845f10d754
```

reported:

```text
Frontend quality       success
Python quality         success
Repository integrity   success
Dependency review      skipped on push
Browser smoke          failure
Quality gate           failure
```

The Browser Smoke job successfully completed:

```text
checkout
Node setup
npm ci
Playwright Chromium installation
production build
```

and then failed during:

```text
Run browser smoke spec
```

The observed symptom was consistent with the Playwright web-server startup/readiness phase timing out around the configured 60-second window.

The smoke spec therefore did not provide the intended real-browser evidence.

---

## 5.2 Frontend baseline

Observed:

```text
182 passed test files
2 skipped test files

1069 passed tests
5 skipped tests
```

Do not regress this.

Important currently passing suites include:

```text
moldWorkflow.integration.test.ts
registrationLifecycle.store.test.ts
cavityOffset.orchestrator.test.ts
Viewport.test.tsx
useViewportRuntime.test.tsx
localStlImport.test.ts
splitFace.derivedStateInvalidation.test.ts
segmentation.store.test.ts
segmentationExecution.integration.test.ts
sprueGeneration.test.ts
```

---

## 5.3 React warning baseline

Although the suite passes, current output still includes `act(...)` warnings from critical/UI suites such as:

```text
Viewport.test.tsx
App.test.tsx
MoldBodiesBrowser.test.tsx
```

Examples include state updates originating from:

```text
Viewport
GlobalHeader
NavigationZone
AppShell
MoldBodiesBrowser
```

Passing tests do not close this requirement.

---

## 5.4 Build warning baseline

The production build passes but still reports:

```text
Some chunks are larger than 500 kB after minification.
```

Observed main entry size is around:

```text
~1.1 MB minified
~307 kB gzip
```

The exact number may change after dependency installation or source edits.

Analyze current output, do not hard-code the old size.

---

## 5.5 Manifold/Vite baseline

The current build also reports multiple warnings equivalent to:

```text
Module "node:module" has been externalized for browser compatibility,
imported by manifold-3d/manifold.js
```

A tiny Vite browser-external shim chunk is emitted.

The build exits successfully.

This is not enough to classify the runtime as safe.

Browser proof must decide.

---

## 5.6 `createMoldParts(...)` lifecycle concern

Current `nextEvaluationRequest(...)` constructs:

```text
phase = "evaluating"
```

`createMoldParts(...)` then starts a derived evaluation.

On success, the path commits a terminal complete state.

On stale/superseded failure, the stale outcome is correctly discarded.

But on a genuine current error, the current catch path sets:

```text
workflow = "error"
error = ...
```

without clearly transitioning the current `evaluation` out of:

```text
"evaluating"
```

The presentation selector currently treats:

```text
committed != null
AND
evaluation.phase == "evaluating"
```

as a reason to serve the previous committed bodies for temporary visual continuity.

Therefore this is a state-integrity problem, not merely metadata.

---

## 5.7 Segmentation wording baseline

Current surviving Segmentation store still contains language equivalent to:

```text
isolated draft session
current segmentation draft
Undo changed the segmentation draft
Redo changed the segmentation draft
```

This wording belongs to an obsolete product concept.

The actual Segmentation store/factory itself may remain.

Only the obsolete semantic wording must be removed unless dependency evidence justifies a deeper rename.

---

# 6. Mandatory Working Rules

1. Investigate before editing.
2. Reproduce before repair when practical.
3. Do not hide a failing server by increasing timeout before diagnosing why it is unavailable.
4. Do not replace production preview with a mocked static page.
5. Do not skip browser smoke in CI.
6. Do not use `continue-on-error` on Browser Smoke.
7. Do not mock `console.error` / `console.warn` to hide React warnings.
8. Do not raise `chunkSizeWarningLimit` merely to hide the large chunk.
9. Do not alias or polyfill `node:module` without proving the package actually requires the Node API in the browser path.
10. Do not fork `manifold-3d` in this execution unless the normal documented browser package is proven unusable and a fork is the smallest safe remedy.
11. Do not replace Manifold, Three.js, React, Zustand, Vite, Vitest, Playwright, Ruff, or GitHub Actions architecture.
12. Do not redesign UI.
13. Do not alter manufacturing geometry constants.
14. Do not alter Registration sizing policy.
15. Do not alter Segmentation mathematics unless a reproduced regression proves they are directly responsible.
16. Do not create a second mold-generation state store merely to fix an error-state transition.
17. Do not weaken revision/fingerprint/requestId commit gates.
18. Do not keep `evaluation.phase = "evaluating"` after the current request is finished.
19. Do not treat cancellation as failure.
20. Do not treat genuine current failure as cancellation.
21. Do not let a stale async rejection roll state back over a newer request.
22. Do not make last-known-good presentation authoritative.
23. Do not make export/final geometry silently use a presentation fallback.
24. Do not rename genuine engineering “draft analysis” terminology.
25. Do remove obsolete Segmentation product “draft” terminology.
26. Do not delete passing regression tests merely to reduce output.
27. Do not commit generated Playwright reports.
28. Do not track `dist/`, test results, browser caches, temporary bundle analysis output, or local logs.
29. Do not commit, push, merge, switch branch, alter Git config, or rewrite history unless separately authorized.
30. Every repaired defect must have a regression test or executable harness.
31. Every warning left behind must be explained.
32. Final decision must match evidence.

---

# 7. Objective A — Recover the Browser Smoke Harness

This is the first objective.

Do it before classifying Manifold browser behavior.

---

## 7.1 Reproduce the exact startup failure

From:

```text
mold/frontend/
```

run:

```bash
npm ci
npm run build
npm run e2e
```

If it fails waiting for the web server:

run the preview command manually outside Playwright:

```bash
npm run preview -- --port 4173 --strictPort
```

Then separately verify readiness using the environment’s HTTP tool, for example:

```bash
curl -i http://127.0.0.1:4173/
curl -i http://127.0.0.1:4173/workspace
```

Use the equivalent on Windows if necessary.

Record:

- exact Vite stdout;
- exact Vite stderr;
- bind address;
- actual port;
- exit code;
- whether the process stays alive;
- whether `/` is reachable;
- whether `/workspace` is reachable;
- whether the process binds IPv4, IPv6, or both.

Do not assume host binding is the cause.

---

## 7.2 Improve Playwright startup diagnostics

The current config may hide useful web-server stdout.

During repair, make startup diagnostics explicit.

A valid shape may be equivalent to:

```ts
webServer: {
  command: "...",
  url: "...",
  stdout: "pipe",
  stderr: "pipe",
  ...
}
```

If an explicit `cwd` makes the execution boundary more deterministic, use it.

Do not keep verbose startup logging if it leaks machine-specific data or creates noisy steady-state output without value.

But failure must be diagnosable.

---

## 7.3 Host/port correction

If direct reproduction proves Vite is not reachable through the address Playwright polls, fix the binding explicitly.

For example, if evidence supports it:

```text
--host 127.0.0.1
--port 4173
--strictPort
```

The `webServer.url` and Playwright `baseURL` must match exactly.

Do not use:

```text
localhost
```

in one place and:

```text
127.0.0.1
```

in another if platform resolution is the actual source of nondeterminism.

---

## 7.4 No fake readiness

The readiness URL must correspond to the actual frontend server.

Do not create a separate shell server that returns `200` while the app is not available.

Do not use a dummy health route unless it is served by the same production preview process and adding it is genuinely simpler than checking the actual app.

The preferred contract is:

```text
Vite production preview itself is reachable
```

---

## 7.5 Verify the smoke spec actually runs

After startup repair, prove that Playwright enters the test body.

The spec must still assert the real critical path:

```text
page.goto("/workspace")
viewport Ready
canvas count == 1
real STL fixture upload
model ready
canvas count == 1
no pageerror
no console error
```

Do not reduce this to:

```text
page.goto("/")
expect(title)
```

That would not prove the geometry/runtime path Execution 04 required.

---

## 7.6 Browser-visible model proof

The current smoke path verifies the model reaches the application’s ready status.

Strengthen it only if a stable runtime-visible indicator already exists.

Preferred evidence hierarchy:

1. stable runtime contract that proves imported geometry was attached to the scene;
2. deterministic model-status element already tied to runtime completion;
3. direct DOM/viewer state designed for testability.

Do not add brittle pixel snapshots merely to claim “visible.”

Do not expose Three.js internals globally only for Playwright.

---

## 7.7 Browser console policy

Capture:

```text
pageerror
console error
```

Continue to fail on unexpected errors.

If a third-party library logs a known benign console warning, do not broadly ignore all console warnings/errors.

Classify by exact source/message.

---

## 7.8 Browser failure artifacts

The current failed run produced no useful Playwright artifact because failure occurred during server startup.

Improve failure diagnostics.

Acceptable solutions include:

- pipe web-server stdout/stderr into the job log;
- preserve Playwright traces/reports when a test actually starts;
- upload `test-results/` and `playwright-report/` on failure if those directories exist;
- add a narrow server-start diagnostic log file only if it is generated deterministically and uploaded only on CI failure.

Do not track failure artifacts in Git.

---

## 7.9 Browser acceptance

This objective is complete only when:

```bash
npm run e2e
```

passes locally in a browser-capable environment and the exact equivalent GitHub Actions job can pass after push.

---

# 8. Objective B — Repair `createMoldParts(...)` Terminal-State Integrity

This is the highest-priority code defect.

---

## 8.1 Characterization test first

Add a focused regression that forces a genuine current `createMoldParts(...)` derived-evaluation failure.

Use the existing dependency-injection style.

Do not depend on random WASM failure.

A deterministic test should be able to inject:

```text
runDerivedMoldEvaluation → reject
```

for the current authoritative request.

Start from a coherent committed state where possible.

Then call:

```text
createMoldParts(...)
```

and await the failure.

Before the production repair, prove the test exposes the incorrect lifecycle if the defect still exists.

---

## 8.2 Required post-failure invariant

After a genuine current failure:

```text
evaluation.phase !== "evaluating"
```

and no current request may still be presented as in flight.

The store must end in a coherent state.

There are two acceptable architectural outcomes.

### Option A — Atomic rollback

Equivalent to:

```text
restore previous authoritative document/evaluation/result
retain an explicit operation error
no fake in-flight evaluation
```

Use this if `createMoldParts(...)` is semantically an atomic replacement that should preserve the last valid committed mold when replacement fails.

### Option B — Explicit failed current document

Equivalent to:

```text
current attempted document remains current
evaluation.phase = "failed"
failure metadata is current
presentation continuity ends or is explicitly policy-controlled
```

Use this only if the product contract genuinely treats the attempted document as authoritative even though its derived evaluation failed.

Do not choose based on which test is easiest.

Compare with:

```text
removeSplitFaceAndRebuild(...)
```

and the broader store semantics.

---

## 8.3 Do not clobber newer work

The existing stale/supersession invariant must remain:

```text
old rejection arrives
after newer request owns the document
→ old rejection is discarded
→ newer state remains untouched
```

Add or preserve a test for this.

The fix for genuine failure must not turn stale failure into rollback.

---

## 8.4 Capability recovery

After genuine failure:

- Sprue/Cavity/tool capability must not remain disabled solely because the stale evaluation flag is still `evaluating`;
- any workflow error state must be intentional;
- user must be able to recover through the existing UX lifecycle.

Do not add a new “force unlock” action.

Correct the state.

---

## 8.5 Presentation continuity recovery

If a previous committed result is preserved for visual continuity while replacement is in flight:

```text
start replacement
→ old result may display
→ replacement genuinely fails
→ in-flight condition ends immediately
```

Then the resulting displayed geometry must follow the chosen failure contract:

```text
rollback to old current result
```

or:

```text
failed current definition / no stale presentation
```

but never:

```text
evaluation still says in-flight forever
```

---

## 8.6 Final test matrix for this defect

At minimum:

```text
success path
genuine current failure
stale/superseded failure
cancellation
newer request wins
failure after prior committed result
failure without prior committed result
```

Use the smallest number of tests that proves each distinct invariant.

---

# 9. Objective C — Make Presentation Semantics Explicit and Bounded

Execution 04 introduced a useful last-known-good presentation path.

Execution 05 must harden its contract.

---

## 9.1 Audit every consumer of the body selector

Search all uses of:

```text
selectActiveMoldBodies
createSelectActiveMoldBodies
lastCommittedResult
```

Classify each consumer:

```text
PRESENTATION
AUTHORITATIVE INPUT
EXPORT
TEST
```

No authoritative geometry operation may use a selector that can legally return a previous document’s body set.

If all current uses are presentation-only, prove that in code/tests/docs.

---

## 9.2 Naming

If the selector is truly presentation-only, a neutral rename may be justified, for example:

```text
selectPresentedMoldBodies
createSelectPresentedMoldBodies
```

Do not rename merely for aesthetics.

Rename if it materially prevents future misuse.

If an external/public contract relies on the existing name, preserve compatibility only when evidence proves it is actually external.

Do not create an old-name wrapper solely to avoid updating internal imports.

---

## 9.3 Last-known-good condition

The condition must be stronger than accidental UI state.

Equivalent logic should express:

```text
current committed result?
  use current

else replacement truly in flight
  and previous committed result is valid lineage
  use previous for presentation only

else
  use current definition according to lifecycle contract
```

Do not make:

```text
evaluation.phase == "evaluating"
```

the only semantic fact if another explicit request identity can cheaply improve correctness.

Avoid overengineering.

---

## 9.4 Export boundary

Search for current/future export paths.

If no export exists, document:

```text
no active export consumer found
```

Do not invent one.

If an export path exists and reads presentation bodies, split it to current authoritative geometry.

---

# 10. Objective D — Close React `act(...)` Warnings

Fix the warnings, not the console.

---

## 10.1 Target suites

Start with current warning-producing suites:

```text
src/features/viewport/__tests__/Viewport.test.tsx
src/app/App.test.tsx
src/features/mold-generation/reference-mold-definition/MoldBodiesBrowser.test.tsx
```

Re-run individually and capture exact warning stacks.

---

## 10.2 Typical causes to investigate

Check for:

- fire-and-forget async initialization;
- state-setting effects after assertion;
- direct DOM events instead of awaited user-event helpers;
- missing `await user.click(...)`;
- unresolved microtasks from viewport initialization;
- component unmount before async effect flush;
- Zustand store changes outside the expected React act boundary;
- test helper mounting that triggers asynchronous provider updates.

Do not guess.

Use the warning stack.

---

## 10.3 Repair strategy

Preferred tools:

```text
await userEvent interaction
await waitFor(...)
await findBy...
await act(async () => ...)
```

Use `act(...)` directly only where React Testing Library cannot naturally own the update.

Avoid arbitrary:

```text
await new Promise(resolve => setTimeout(resolve, ...))
```

unless the behavior itself is time-based.

---

## 10.4 No warning silencing

Forbidden:

```text
console.error = ...
vi.spyOn(console, "error").mockImplementation(...)
filter warning text
set test runner silent
```

as a closure mechanism.

A temporary assertion spy used specifically to prove no warning is emitted can be acceptable only if it fails on the warning and is not used to hide it.

---

## 10.5 Verification

Run:

```bash
npm run test:run
```

and inspect output.

No targeted `act(...)` warning should remain.

If a warning comes from an untouched third-party library and is not application-owned, isolate and document it with evidence.

---

# 11. Objective E — Close the Large Main-Chunk Warning

Do this after functional regressions are green.

---

## 11.1 Measure before changing

Capture the current build output.

Identify:

- entry chunk size;
- largest modules contributing to it;
- which heavy domains are eager;
- whether Three.js, geometry engines, reports, or UI libraries dominate;
- which routes/features are needed on initial `/workspace` boot;
- which domains can be safely lazy-loaded.

Use current Vite/Rolldown analysis tooling available in the repository or the smallest temporary local analysis approach.

Do not commit large visualization plugins merely to inspect one bundle unless they provide ongoing value.

---

## 11.2 Preferred splitting strategy

Prefer real semantic lazy boundaries.

Possible candidates must be validated from current dependency graph, such as:

```text
heavy geometry engine initialization
engineering reports not needed at first paint
rare modal/tool flows
secondary analysis modules
worker-only logic accidentally imported by main
```

The current code already dynamically imports some worker-less fallback geometry.

Continue that principle where architecture supports it.

---

## 11.3 Explicit chunking

If semantic dynamic imports alone are insufficient, current Vite supports output code-splitting configuration.

Use explicit chunking only when:

- it reflects stable dependency boundaries;
- it does not create a giant vendor chunk that merely moves the warning;
- it does not duplicate WASM/Three code across chunks;
- it does not create brittle package-name heuristics without explanation.

---

## 11.4 No threshold hiding

Do not “solve” this by:

```ts
chunkSizeWarningLimit: 1200
```

or equivalent.

If the main chunk remains large for a proven architectural reason and the warning cannot be removed without worse performance, final report must say the objective remains open.

Do not declare complete.

---

## 11.5 Regression concerns

After code splitting verify:

- initial app boot still works;
- route works on direct `/workspace` preview navigation;
- browser smoke passes;
- dynamic imports do not throw `vite:preloadError`;
- worker URLs still resolve;
- Manifold WASM still loads;
- no duplicate runtime/canvas;
- no Cavity/Segmentation worker regression.

---

# 12. Objective F — Resolve or Classify the Manifold/Vite `node:module` Warning

Do not touch this before Browser Smoke is operational.

---

## 12.1 Verify package metadata and import path

Inspect installed:

```text
manifold-3d@current-lockfile-version
```

including:

```text
package.json exports
browser conditions
module entry
WASM loader path
```

Compare Craft’s import to the documented package usage.

The package officially supports browser WASM usage.

If Craft imports the documented browser entry correctly, do not invent a Node shim.

---

## 12.2 Reproduce in production browser

With Browser Smoke fixed:

```text
build
preview
Chromium
import STL
exercise path that actually initializes Manifold
```

The smoke fixture should already enter a path meaningful enough to expose a broken WASM/runtime import.

If it does not initialize Manifold, extend the smoke minimally to trigger a safe geometry action that does.

Do not turn the smoke into a full E2E suite.

---

## 12.3 Classification outcomes

### Outcome A — real runtime break

If browser shows:

```text
Cannot access module.createRequire
node:module externalized error
WASM initialization failure
```

then this is a product defect.

Fix the browser import contract.

### Outcome B — build warning, runtime safe

If:

- browser path passes;
- Manifold initializes;
- no console/page error;
- official browser entry is being used;
- warning comes from conditional package code Vite externalizes but browser never evaluates;

then classify as:

```text
controlled third-party/tooling warning
```

Attempt the smallest safe removal only if supported.

Do not add unsafe polyfills merely for clean logs.

### Outcome C — uncertain

If browser does not meaningfully execute Manifold:

```text
NOT CLOSED
```

Do not claim harmless.

---

## 12.4 Dependency upgrades

Do not upgrade Manifold/Vite simply because a newer patch exists unless:

- current release notes/issues demonstrate the warning is fixed;
- upgrade is compatible;
- full regression passes;
- no geometry behavior changes unexpectedly.

This execution is not a dependency modernization project.

---

# 13. Objective G — Finish Segmentation Semantic Cleanup

This is narrow.

---

## 13.1 Search terms

Search active source/tests for obsolete Segmentation product wording:

```text
segmentation draft
Segmentation draft
isolated draft session
current segmentation draft
draft session
DraftA
DraftB
```

Do not globally replace the word:

```text
draft
```

because legitimate mold-engineering draft analysis exists.

---

## 13.2 Target wording

Prefer:

```text
Segmentation session
Segmentation state
Segmentation store instance
isolated Segmentation store
current Segmentation lifecycle state
```

according to context.

For messages:

```text
Undo changed the Segmentation state.
Redo changed the Segmentation state.
```

or better current terminology already used elsewhere.

---

## 13.3 Do not reopen removed architecture

Do not reintroduce:

```text
One Mold
More Molds
Automatic More Molds
Manual More Molds
multiple Segmentation drafts
```

The store factory can remain for testing/isolation if it has real use.

The word cleanup is semantic, not a reason to delete useful dependency injection.

---

# 14. Objective H — Harden the Aggregate Quality Gate

The current gate correctly uses an aggregate job after primary jobs.

Keep that architecture.

---

## 14.1 Explicit result policy

Make acceptable results event-specific.

For push:

```text
python-quality        success
frontend-quality      success
browser-smoke         success
repository-integrity  success
dependency-review     skipped
```

For PR:

```text
dependency-review     success
```

Any required job:

```text
failure
cancelled
unexpected skipped
```

must fail Quality Gate.

Do not rely only on:

```text
contains(needs.*.result, "failure")
```

if an unexpected skipped job could otherwise slip through.

---

## 14.2 Keep `always()`

The Quality Gate should run even if one dependency fails so the repository has one stable red/green aggregate result.

This matches GitHub Actions dependency semantics.

---

## 14.3 No duplicated policy

Do not create multiple different aggregate gates.

One stable Quality Gate should express the event policy.

---

## 14.4 Browser diagnostic artifact

If Browser Smoke fails, upload useful evidence.

Do not require an artifact when no artifact directory exists.

Use `if-no-files-found` behavior deliberately if available.

Failure to upload an optional report should not mask the actual Browser Smoke failure.

---

# 15. Objective I — Full Cross-System Regression

Execution 05 touches state-machine semantics, runtime smoke, build boundaries, tests, and CI.

Run broad regression.

---

## 15.1 Cut by Face

Verify:

```text
open Constructed Cutting Plan
Cut by Face
select split face
Done
parts commit
Cavity
Sprue
Registration
```

Regression tests must preserve:

- final-plane Eraser invalidation;
- non-final plane move invalidation;
- clear selection invalidation;
- undo/redo;
- body visibility;
- derived freshness.

---

## 15.2 Cavity

Preserve:

```text
zero-clearance exact path
direct Minkowski path
distance-field direct path
Minkowski failure → distance-field fallback
both engines fail → real failure
worker stale result rejection
timeout behavior
```

Do not alter Cavity geometry simply to help bundle splitting.

---

## 15.3 Sprue

Preserve:

```text
pre-cavity pending intent
post-cavity resolution
move
resize
entry-neck resize
remove
rebuild
topology invalidation
Mold Scale pending revalidation
stale async rejection
```

Presentation must not resurrect old resolved geometry.

---

## 15.4 Registration

Preserve:

```text
Cut by Face registration
Cavity registration
Sprue registration
Mold Scale regeneration
split add
split move
split remove
Undo/Redo
boolean failure → valid unkeyed mold
```

---

## 15.5 Segmentation

Preserve:

```text
printer-fit-only planning
fitting elongated mold → not-required
multi-axis segmentation
preview
accept
execute
stale source rejection
stale printer rejection
extension axis
extension drag
invalid extension blocks Done
Mold Scale regeneration
repeated regeneration
```

No One/More Mold behavior may return.

---

## 15.6 Viewport/import

Preserve:

```text
one runtime
one canvas
pre-ready STL queueing
latest-file-wins
model replacement disposal
WebGL ready
model status
selection
measurement
orientation
Mold Scale
```

Browser Smoke is an additional layer, not a replacement for unit/runtime tests.

---

# 16. Harness Engineering Loop

Use the following loops.

---

## Loop A — Evidence Map

Before editing:

1. Git state;
2. CI state;
3. browser-server startup path;
4. `createMoldParts` call graph;
5. evaluation request/commit/failure paths;
6. presentation selector consumers;
7. React warning sources;
8. bundle composition;
9. Manifold package entry;
10. Segmentation wording;
11. Quality Gate result policy.

Write a small private working map before code edits.

Do not create a committed report unless it adds durable architectural value.

---

## Loop B — Characterization

Add focused failing proof for:

```text
createMoldParts current failure leaves evaluating
```

Reproduce browser startup failure independently from Playwright.

Capture warning baselines.

---

## Loop C — State Repair

Repair terminal-state semantics.

Run targeted store tests.

Run workflow integration tests.

Inspect selectors/capabilities afterward.

---

## Loop D — Browser Repair

Repair server startup.

Run Playwright locally.

Run production preview manually.

Verify Chromium.

Then classify Manifold behavior.

---

## Loop E — Warning Closure

Fix React act warnings.

Analyze bundle.

Apply meaningful code splitting.

Rebuild.

Re-run browser smoke.

---

## Loop F — Semantic Cleanup

Remove obsolete Segmentation draft wording only.

Run Segmentation tests and typecheck.

---

## Loop G — CI Hardening

Update aggregate gate only after local behavior is stable.

Validate YAML.

Do not make CI green by weakening jobs.

---

## Loop H — Full Regression

Run all frontend/Python/repository gates.

Then inspect Git diff.

---

# 17. Targeted Test Commands

Use exact test paths based on current repository.

Representative targeted sequence:

```bash
cd mold/frontend

npm run test:run -- src/features/mold-generation/workflow/moldWorkflow.integration.test.ts
npm run test:run -- src/features/mold-generation/split-face/splitFace.store.test.ts
npm run test:run -- src/features/mold-generation/registration/registrationLifecycle.store.test.ts
npm run test:run -- src/features/mold-generation/cavity-generation/cavityOffset.orchestrator.test.ts
npm run test:run -- src/features/viewport/__tests__/Viewport.test.tsx
npm run test:run -- src/features/mold-generation/reference-mold-definition/MoldBodiesBrowser.test.tsx
npm run test:run -- src/app/App.test.tsx
npm run test:run -- src/features/mold-generation/segmentation/segmentation.store.test.ts
```

If current Vitest CLI argument forwarding differs, use the correct current syntax.

Do not skip the full suite afterward.

---

# 18. Full Frontend Harness

From:

```text
mold/frontend/
```

run:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
npx playwright install chromium
npm run e2e
```

If Playwright local install requires system dependencies unavailable in the current environment:

- run the maximum available local browser proof;
- do not claim Browser COMPLETE;
- leave exact environment blocker;
- rely on remote CI only after user push.

On GitHub Actions, keep:

```text
playwright install --with-deps chromium
```

if that is the existing proven CI installation path.

---

# 19. Full Python Harness

From:

```text
mold/
```

run:

```bash
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

Do not broaden Ruff back into unrelated frontend files.

Do not narrow it below authoritative:

```text
src/**/*.py
tests/**/*.py
```

unless the package architecture itself changed.

---

# 20. Repository Integrity Harness

From repository root:

```bash
git diff --check
git status --short
git diff --stat
```

Also inspect:

```bash
git ls-files
```

for accidental:

```text
dist/
node_modules/
playwright-report/
test-results/
.tmp/
*.bak
*.orig
*.log
coverage/
```

Run a narrow secret scan over changed text if current repository tooling exists.

Do not add a new heavyweight secret-scanning platform in this execution unless the repository already standardized on one.

---

# 21. Semantic Search Gate

At the end search active frontend code/tests.

## 21.1 Obsolete Segmentation product wording

Search:

```text
isolated draft session
current segmentation draft
segmentation draft
Segmentation draft
DraftA
DraftB
```

Classify every result.

Zero obsolete active production/test wording expected.

Historical Execution documents are allowed to contain historical terminology.

---

## 21.2 Removed product modes

Reconfirm no active return of:

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
Segmentation as One Mold
Segmentation as More Molds
```

Do not rewrite archived historical prompts to make grep zero globally.

Report:

```text
active source/test residue
historical artifact residue
```

separately.

---

## 21.3 Presentation selector

Search:

```text
selectActiveMoldBodies
createSelectActiveMoldBodies
selectPresentedMoldBodies
lastCommittedResult
```

Confirm no authoritative geometry operation accidentally reads a presentation fallback.

---

# 22. Expected Architecture After Execution 05

The desired frontend derived-state architecture is equivalent to:

```text
Imported model / canonical geometry
            ↓
Reference Mold / Cutting topology
            ↓
Authoritative MoldDocument
(revision + fingerprint)
            ↓
Current evaluation request
(requestId)
            ↓
Derived stages
Cavity → Sprues → Registration
            ↓
Commit gate
            ↓
Current FinalMoldResult
```

Presentation may have:

```text
Current FinalMoldResult
        OR
last-known-good prior result
ONLY while a real replacement request is in flight
```

Never:

```text
stale result
→ authoritative geometry input
```

Async rule:

```text
current request succeeds
→ commit

current request genuinely fails
→ terminal failed/rollback state

request is cancelled
→ cancelled lifecycle

request is stale/superseded
→ discard without clobbering newer state
```

Browser proof:

```text
production build
→ production preview
→ Playwright Chromium
→ /workspace
→ real viewport
→ real STL import
→ no page error
```

CI:

```text
Python quality ─┐
Frontend quality ├─→ Quality Gate
Browser smoke   ┤
Repo integrity  ┤
Dependency PR   ┘
```

---

# 23. Files Likely to Change

Do not pre-commit to this list.

Change only files justified by evidence.

Likely candidates include:

```text
.github/workflows/ci.yml

mold/frontend/playwright.config.ts
mold/frontend/e2e/smoke.spec.ts
mold/frontend/package.json
mold/frontend/package-lock.json
mold/frontend/vite.config.ts

mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
mold/frontend/src/features/mold-generation/split-face/splitFace.store.test.ts
mold/frontend/src/features/mold-generation/workflow/moldWorkflow.integration.test.ts

mold/frontend/src/features/viewport/__tests__/Viewport.test.tsx
mold/frontend/src/app/App.test.tsx
mold/frontend/src/features/mold-generation/reference-mold-definition/MoldBodiesBrowser.test.tsx

mold/frontend/src/features/mold-generation/segmentation/segmentation.store.ts
mold/frontend/src/features/mold-generation/segmentation/segmentation.store.test.ts
```

Possible bundle-related changes may touch a composition/import boundary.

Do not move geometry source files solely to manipulate chunk names.

---

# 24. Explicitly Out of Scope

Do not use Execution 05 to implement:

- frontend↔Python runtime bridge;
- backend server;
- API service;
- authentication;
- database;
- cloud deployment;
- Dockerization;
- billing;
- generative design;
- mesh-repair product layer;
- carbon-fiber/fiberglass mold product;
- new CAD tools;
- UI redesign;
- Webpage 2.0 / Spline redesign;
- new Registration geometry policy;
- new Cavity clearance policy;
- new Sprue geometry;
- new Segmentation algorithm;
- undercut redesign;
- export system;
- collaboration;
- telemetry platform;
- performance analytics platform.

If a blocker appears to require one of these, stop and report it separately.

---

# 25. Acceptance Matrix

Execution 05 may be considered locally complete only if all applicable rows are satisfied.

| Requirement | Required |
|---|---|
| Frontend `npm ci` | PASS |
| npm high/critical audit | PASS |
| Frontend typecheck | PASS |
| Frontend lint | PASS |
| Frontend build | PASS |
| Frontend full Vitest | PASS |
| Critical React `act(...)` warnings | ZERO |
| `createMoldParts` genuine failure terminal state | PROVEN |
| stale/superseded failure cannot rollback newer state | PROVEN |
| last-known-good presentation is bounded | PROVEN |
| authoritative consumers do not use stale presentation | PROVEN |
| Playwright web server starts | PASS |
| Playwright spec actually executes | PASS |
| Browser `/workspace` boot | PASS |
| exactly one canvas | PASS |
| deterministic STL import | PASS |
| no uncaught browser page error | PASS |
| no unexpected console error | PASS |
| Manifold browser runtime | PROVEN SAFE or REPAIRED |
| large main-chunk warning | CLOSED |
| Manifold build warning | CLOSED or CONTROLLED EXTERNAL LIMITATION WITH BROWSER PROOF |
| obsolete Segmentation draft wording | REMOVED |
| Python Ruff lint | PASS |
| Python Ruff format | PASS |
| Python pytest | PASS |
| repository UTF-8/integrity | PASS |
| git diff check | PASS |
| no generated artifacts tracked | PASS |
| Quality Gate policy | EVENT-CORRECT |
| remote Quality Gate | GREEN before `REMOTE VERIFIED COMPLETE` |

---

# 26. Decision Vocabulary

Use one of these final decisions.

## `LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION`

Use when:

- every local applicable acceptance requirement passes;
- browser proof passes locally;
- CI workflow is ready;
- agent was not authorized to push;
- remote result is therefore pending.

## `REMOTE VERIFIED COMPLETE`

Use only when:

- exact commit was pushed;
- required remote jobs for that event are green;
- aggregate Quality Gate is green.

## `PARTIALLY COMPLETE`

Use when:

- substantial repair is correct;
- one or more acceptance requirements remain open;
- exact blockers are documented.

## `BLOCKED`

Use when:

- a required dependency/environment/repository condition prevents meaningful continuation;
- continuing would require unjustified scope expansion.

Do not use plain:

```text
COMPLETE
```

without clarifying local versus remote truth.

---

# 27. Required Final Report

Print the report in terminal/chat.

Do not create and commit a separate report file unless explicitly asked.

Use this structure exactly:

```text
Decision
Repository State
Execution 05 Scope
Starting Reproduction
Browser Harness Root Cause
Browser Harness Repair
Browser Proof
createMoldParts Failure-State Root Cause
Evaluation Lifecycle Repair
Presentation Continuity Audit
Authoritative Consumer Audit
React Warning Repair
Bundle Analysis
Bundle Split / Warning Closure
Manifold/Vite Classification
Segmentation Semantic Cleanup
CI Quality-Gate Hardening
Files Added
Files Modified
Files Renamed
Files Deleted
Targeted Frontend Tests
Full Frontend Harness
Playwright Harness
Full Python Harness
Repository Integrity
Semantic Search
Git Diff Review
Remote CI Status
Regression Assessment
Remaining Risks
Out-of-Scope Findings
User Action Required
```

For each command, report:

```text
command
exit code
pass/fail
test count when available
warning count/classification
```

Do not say:

```text
all tests passed
```

without counts if the runner prints counts.

Do not say:

```text
browser verified
```

unless the browser spec actually ran.

---

# 28. Execution Order

Follow this order unless repository evidence proves a dependency requires a small reordering.

```text
1. Record Git state
2. Read agent/project docs
3. Reproduce remote/local frontend baseline
4. Reproduce Browser Smoke server-start failure
5. Run production preview manually and inspect bind/readiness
6. Add/adjust browser startup diagnostics
7. Repair Browser Smoke startup
8. Prove the smoke spec actually executes
9. Add createMoldParts failure characterization
10. Repair evaluation terminal-state semantics
11. Prove stale/superseded result safety
12. Audit presentation-selector consumers
13. Rename/split presentation selector only if justified
14. Fix React act warnings
15. Run focused React suites
16. Analyze production bundle composition
17. Apply meaningful code splitting
18. Re-run build
19. Run Browser Smoke after splitting
20. Classify/fix Manifold node:module warning
21. Clean Segmentation draft wording
22. Harden Quality Gate result policy
23. Run full frontend harness
24. Run full Playwright harness
25. Run full Python harness
26. Run repository integrity checks
27. Run semantic searches
28. Review every diff
29. Print final report
30. Do not commit/push unless separately instructed
```

---

# 29. Diff Review Contract

Before finishing, inspect every changed file.

For each file classify:

```text
BROWSER HARNESS
STATE-MACHINE INTEGRITY
PRESENTATION CONTRACT
TEST WARNING REPAIR
BUNDLE SPLIT
MANIFOLD CLASSIFICATION
SEGMENTATION SEMANTIC CLEANUP
CI POLICY
TEST COVERAGE
NECESSARY DEPENDENCY LOCK UPDATE
```

Any changed file that cannot be classified must be investigated.

Revert unrelated edits.

Do not leave “while I was here” cleanup.

---

# 30. Hard Stop Conditions

Stop expanding scope and report if:

- Browser Smoke requires a new backend;
- production preview only works by disabling the real app route;
- Manifold actually cannot execute in the browser with the supported package and fixing it requires replacing the geometry kernel;
- correct chunking requires an architectural migration larger than this closure execution;
- `createMoldParts` lifecycle repair reveals a broader incompatible state model that cannot be fixed narrowly;
- user changes overlap the same files in a way that makes safe edits impossible;
- CI permissions prevent required verification and there is no local equivalent;
- dependency compromise/security incident is discovered.

Do not hide a hard stop behind partial green tests.

---

# 31. Completion Statement Template

A valid strongest successful final statement is equivalent to:

```text
Decision:
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION

State:
- createMoldParts current failures now leave a coherent terminal state;
- stale/superseded failures cannot overwrite newer state;
- last-known-good mold presentation is bounded to a real replacement-in-flight window;
- Browser Smoke starts the production preview and executes the real Chromium STL-import path;
- frontend, Playwright, Python, and repository integrity harnesses pass locally;
- React act warnings are closed;
- the large entry-chunk warning is closed;
- the Manifold/Vite warning is either removed or classified as a controlled third-party build warning with proven browser-safe runtime;
- obsolete Segmentation draft terminology is removed;
- Quality Gate correctly handles push versus PR dependency-review results.

Remote:
- pending user push / GitHub Actions verification.
```

A remotely verified result may upgrade this to:

```text
REMOTE VERIFIED COMPLETE
```

only after the exact pushed commit has a green aggregate Quality Gate.

---

# 32. Final Engineering Principle

Execution 05 is not finished when the dashboard is cosmetically green.

It is finished when the underlying invariants explain why it is green.

The final baseline must satisfy:

```text
no stale authority
no fake in-flight state
no hidden browser failure
no warning suppression
no unproven geometry runtime
no obsolete workflow semantics
no CI result ambiguity
```

The repository should emerge from Execution 05 as a small, understandable set of explicit contracts:

```text
current document identity
current evaluation identity
terminal async lifecycle
presentation-only last-known-good continuity
real browser proof
deterministic CI policy
```

That is the closure target.
