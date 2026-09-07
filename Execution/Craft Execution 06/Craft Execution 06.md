# Craft — Execution 06
## Final Stabilization Closure Before the Next Engineering Phase

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 06/`  
**Observed starting reference:** `main` at `68d72f12a6bb38960abc504156ede7362cdf5748` (`Update project`)  
**Execution type:** final hardening / performance / browser-proof closure only  
**Primary objective:** close the four remaining baseline gaps and leave one trusted, remotely-green, browser-proven Craft baseline before work begins on Generative Design, Mesh Repair, or any other new engineering engine.  

---

# 0. Mission

Execution 06 is intentionally smaller and more focused than Executions 03–05.

Do **not** treat it as another broad refactor.

The repository has already crossed the important correctness threshold:

- root CI exists and is operational;
- frontend typecheck/lint/build/tests are green;
- Python Ruff/pytest are green;
- npm high-severity audit is green;
- browser smoke starts successfully in CI;
- the real app boots in Chromium;
- the viewport reaches Ready;
- deterministic STL import works in the real browser runtime;
- exactly one canvas remains alive;
- stale async result ownership is guarded;
- `createMoldParts(...)` now reaches a terminal failed state on a genuine current failure;
- Segmentation obsolete draft terminology was cleaned up;
- remote Quality Gate on `main` is currently green.

The remaining work is narrow:

1. remove the surviving React `act(...)` warnings from the active test harness;
2. analyze and materially reduce the ~1.1 MB eager frontend entry chunk without hiding the warning threshold;
3. extend browser evidence from “app boots + STL imports” to at least one **real Manifold-backed geometry operation** in Chromium;
4. make the aggregate Quality Gate reject every unexpected `skipped` result explicitly.

Execution 06 exists to close those four items, run one final cross-system regression sweep, and then **stop hardening work** unless the execution uncovers a new correctness blocker.

The target state is:

```text
trusted document state
+ deterministic async ownership
+ green frontend
+ green Python
+ green dependency audit
+ warning-clean React critical tests
+ bounded production bundle loading
+ real-browser geometry proof
+ explicit CI result policy
+ exact remote green SHA
= final Craft stabilization baseline
```

When this execution is complete, the next execution should belong to the next product/engine phase rather than another generic stabilization cycle.

---

# 1. Definition of Complete

Do not report `COMPLETE` merely because GitHub Actions is green.

Execution 06 is complete only when all applicable requirements below are satisfied with evidence from the **current repository state**.

## 1.1 React test-harness closure

Required:

- the currently reproducible `act(...)` warnings in active/critical React suites are removed at their scheduling root cause;
- no warning is hidden with `console.error` mocking;
- no global suppression filter is introduced;
- no arbitrary sleep is added to “let React settle”;
- direct store/runtime updates that cause React renders are awaited or wrapped through the correct testing interaction boundary;
- test teardown does not leave scheduled React work behind;
- the final critical-suite log contains no unexplained React scheduling warning.

## 1.2 Production bundle closure

Required:

- measure the current production bundle before changing it;
- identify the modules responsible for the ~1.1 MB eager entry chunk;
- move genuinely non-bootstrap-heavy geometry/features behind real async boundaries where behavior permits;
- do not raise `build.chunkSizeWarningLimit` to hide the issue;
- do not create meaningless vendor chunks that are still eagerly fetched on first boot;
- do not duplicate geometry engines across chunks;
- do not break worker loading, WASM loading, or browser preview;
- the final build must no longer emit the current unexplained default large-chunk warning.

If the agent proves that reaching the default Vite threshold would require a correctness or architecture regression, stop and report the exact blocker instead of silently changing the threshold. In that case Execution 06 is **not complete**.

## 1.3 Real-browser geometry closure

The Playwright harness must prove more than STL import.

At least one deterministic, real, production-browser operation must execute through Craft’s existing Manifold-backed geometry path.

Preferred proof path:

```text
production build / preview
→ app boot
→ deterministic closed STL import
→ real current mold workflow state
→ one Manifold-backed geometry operation
→ real geometry result committed/presented
→ no page error
→ no unexpected console error
```

The preferred operation is **Cavity generation** because it exercises real subtractive geometry and directly addresses the remaining uncertainty around the `manifold-3d` browser warning.

If the current UI cannot drive a deterministic Cavity path without adding brittle product-only selectors or redesigning UX, the fallback may be a test-harness-only browser probe that invokes the **existing production geometry service** in a real browser page. It must not:

- mock Manifold;
- replace Manifold with a fake implementation;
- duplicate the production Boolean algorithm;
- call a Node-only implementation;
- use jsdom as the browser proof;
- bypass the actual production `manifold-3d`/WASM module.

The fallback is acceptable only if it proves the same production module executes a real Boolean/geometry operation in Chromium.

## 1.4 Explicit Quality Gate closure

For a push to `main`, the aggregate gate must explicitly require:

```text
python-quality        success
frontend-quality      success
browser-smoke         success
repository-integrity  success
dependency-review     skipped
```

For a pull request to `main`, it must explicitly require:

```text
python-quality        success
frontend-quality      success
browser-smoke         success
repository-integrity  success
dependency-review     success
```

Any other result for any required job is a failure.

In particular, the aggregate gate must reject an unexpected:

```text
skipped
cancelled
failure
action_required
timed_out
```

where applicable to the jobs represented in `needs`.

Do not depend only on:

```text
contains(needs.*.result, 'failure')
contains(needs.*.result, 'cancelled')
```

because that does not state the allowed result matrix strongly enough.

## 1.5 Full local verification closure

From `mold/frontend/`:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
npm run e2e
```

From `mold/`:

```bash
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

From repository root:

```bash
git diff --check
```

Required:

- every command exits `0`;
- no new critical test is skipped;
- no new lint/typecheck suppression is introduced;
- no high/critical npm advisory remains;
- no unexplained React `act(...)` warning remains in the critical/touched suites;
- the current large-chunk warning is closed, not hidden;
- browser geometry proof passes.

## 1.6 Remote verification closure

The exact pushed commit is complete only when the required GitHub Actions run for that exact SHA is green.

Do not call the execution remotely complete based on:

- an older SHA;
- a local run;
- a green unit-test-only run;
- a green frontend job with a red browser job;
- a green browser job with an unexpectedly skipped required job.

If the coding agent is not authorized to push, the strongest allowed decision is:

```text
LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION
```

If the exact pushed SHA is green and every Execution 06 acceptance criterion is satisfied, the final decision may be:

```text
REMOTE VERIFIED COMPLETE — FINAL STABILIZATION BASELINE
```

---

# 2. Source-of-Truth Order

Use this order:

1. current repository files;
2. live Git state;
3. reproducible local behavior;
4. current tests;
5. current production build output;
6. current GitHub Actions workflow definitions;
7. exact remote CI logs for the pushed SHA;
8. current dependency metadata;
9. stable architecture documentation;
10. this Execution 06 prompt;
11. older Execution prompts only for historical intent.

The observed starting SHA is not a command to reset the repository.

If `main` has advanced beyond:

```text
68d72f12a6bb38960abc504156ede7362cdf5748
```

re-audit the current state and implement the invariant against the new authoritative state.

---

# 3. External Research Baseline

Use these facts as constraints; repository evidence still wins.

## 3.1 React testing

Current React guidance recommends async `act(...)` semantics so scheduled updates finish before assertions. React Testing Library normally wraps common render/user-interaction helpers, but direct asynchronous state changes, external store updates, worker/runtime callbacks, or un-awaited interactions can still escape the expected act boundary.

Implication for Craft:

- fix the interaction/scheduling source;
- prefer awaited user interactions and observable-state waits;
- use direct `act(...)` only when the test is intentionally driving a state transition outside normal RTL helpers;
- do not suppress the warning.

## 3.2 Vite code splitting

Current Vite supports dynamic imports as real code-splitting boundaries and automatically handles async-chunk preload optimization. Vite 8 reports the large-chunk warning against the uncompressed JavaScript chunk size and uses a default warning threshold of 500 kB.

Implication for Craft:

- split at meaningful feature/runtime boundaries;
- do not “fix” the warning by raising the threshold;
- first-boot code should not eagerly include heavy geometry features that are not required to render the initial workspace shell;
- the final output must be measured, not guessed.

## 3.3 Vite + WASM

Current Vite supports browser WebAssembly assets and URL/init-oriented WASM loading patterns. Craft must preserve the existing production runtime contract and only change Manifold loading if browser evidence demonstrates a real need.

Do not introduce a speculative alias/polyfill solely to silence a build message.

## 3.4 Manifold browser support

The Manifold project documents `manifold-3d` as its TS/JS/WASM package and states that its WASM module runs in modern browsers. Its own repository includes browser-oriented frontend examples.

Implication for Craft:

- the surviving `node:module` externalization warning should be classified by **real Chromium geometry execution**, not by assumption;
- if real Boolean geometry succeeds with no runtime error, record the warning as a controlled third-party bundling limitation only if it still cannot be removed safely;
- if real geometry fails, repair the package/WASM loading contract from root cause.

## 3.5 GitHub Actions `needs`

GitHub Actions documents that a job depending on `needs` is normally affected by failed/skipped dependencies, and `if: always()` is the mechanism for an aggregate gate that must still run after dependency failures/skips.

Implication for Craft:

- keep the aggregate Quality Gate running with `always()`;
- explicitly compare each required job result against the allowed event-specific result;
- never treat “not failure/cancelled” as equivalent to “correct result.”

---

# 4. Scope Boundaries

Execution 06 must remain a closure execution.

Do not add:

- Generative Design;
- Mesh Repair;
- undercut solving;
- new mold product modes;
- new Segmentation strategy modes;
- new Registration policy;
- new Sprue UX;
- new Cavity UX;
- frontend↔Python RPC/HTTP/WebSocket integration;
- a new geometry kernel;
- a new state-management system;
- a new test framework;
- a new bundler;
- a new routing framework;
- a general performance observability platform.

Allowed changes are only those required to close the four remaining baseline gaps and preserve the existing behavior.

---

# 5. Objective A — Close React `act(...)` Warnings

## 5.1 Reproduce first

Run the full frontend test suite and capture every current React `act(...)` warning.

Create a temporary investigation map in working notes, not a permanent new architecture document:

```text
warning
→ test file
→ component
→ triggering interaction/state update
→ async source
→ ownership
→ root cause
```

Known suites from the current baseline include warnings associated with active React tests such as:

```text
Viewport.test.tsx
App.test.tsx
MoldBodiesBrowser.test.tsx
```

Do not assume these are the only warnings. Reproduce current logs.

## 5.2 Root-cause classes to inspect

Inspect for:

- un-awaited `userEvent` calls;
- direct DOM event dispatch outside testing-library helpers;
- direct Zustand store mutations that synchronously/asynchronously trigger mounted React subscribers;
- promises resolved after the test assertion completes;
- timers/microtasks not advanced through an awaited test boundary;
- worker/runtime mock callbacks that publish state after the test has moved on;
- render helpers that return before initial async effects settle;
- cleanup/unmount occurring while callbacks remain queued.

## 5.3 Repair rules

Prefer, in order:

1. await the real user interaction;
2. await the observable UI/state outcome (`findBy*`, `waitFor`, deterministic promise ownership);
3. if the test intentionally mutates an external store directly, wrap only that specific transition with async `act(...)`;
4. make mock/runtime completion ownership explicit if the test previously leaked a callback.

Do not:

- wrap the entire test in one giant `act`;
- add `await new Promise(resolve => setTimeout(resolve, ...))`;
- mock `console.error` to hide warnings;
- add global warning filters;
- weaken assertions;
- disable Strict Mode merely to remove warnings.

## 5.4 Acceptance tests

Required proof:

```text
critical warning-producing suites
→ PASS
→ zero unexplained act(...) warnings
```

Then:

```text
npm run test:run
```

must still pass globally.

---

# 6. Objective B — Reduce the Eager Production Entry Chunk

## 6.1 Baseline measurement

Before changing imports, run the current production build and record:

```text
entry chunk filename
uncompressed size
gzip size
largest async chunks
WASM asset size
number of emitted JS chunks
current warning text
```

Do not use memory values if the current build differs from the previously observed ~1.1 MB entry chunk.

## 6.2 Identify the eager import graph

Trace the initial workspace boot import graph.

Classify heavy modules into:

```text
BOOT-REQUIRED
USER-ACTION-REQUIRED
GEOMETRY-OPERATION-REQUIRED
TEST/DEV-ONLY
```

Pay particular attention to:

- `three` and viewport runtime dependencies;
- `manifold-3d` and WASM initialization;
- BVH / mesh acceleration packages;
- Cavity engine code;
- Sprue engine code;
- Registration engine code;
- Segmentation execution code;
- heavy geometry utilities imported by barrel/index files;
- feature-level modules imported only because a top-level index re-exports them eagerly.

## 6.3 Preferred splitting strategy

Prefer **behavioral async boundaries** over arbitrary vendor grouping.

Examples of valid boundaries, only if supported by the current code graph:

```text
workspace shell / lightweight controls
        ↓ user imports model
viewport/runtime geometry loader
        ↓ user invokes Cavity
Cavity / Manifold-heavy path
        ↓ user invokes other advanced geometry feature
feature-specific geometry chunk
```

Do not force every engine into its own chunk if that increases duplication or creates repeated WASM initialization.

## 6.4 Manifold ownership rule

There must remain one clear production initialization/ownership path for `manifold-3d`.

Do not accidentally create:

```text
Cavity chunk → Manifold instance A
Segmentation chunk → Manifold instance B
Registration chunk → Manifold instance C
```

if the current architecture expects one shared initialized module/runtime.

The goal is delayed loading, not duplicated kernels.

## 6.5 Barrel-import audit

Search feature `index.ts` files and high-level imports for eager re-export fan-out.

A typical failure pattern to eliminate when proven is:

```text
App imports one tiny symbol from feature/index.ts
→ feature/index.ts re-exports geometry engine
→ geometry engine imports Manifold
→ Manifold becomes part of initial entry graph
```

Prefer direct/lightweight entrypoints or split public barrels by runtime layer when evidence shows this is the cause.

Do not reorganize the entire repository for naming aesthetics.

## 6.6 Bundler configuration rule

Use `build.rolldownOptions` / output chunk configuration only after code-level async boundaries are understood.

A manually named vendor chunk is not a win if it is still eagerly imported during bootstrap.

Do not:

```text
raise chunkSizeWarningLimit
turn off size reporting
mark critical dependencies external without a deployment contract
switch bundlers
```

## 6.7 Acceptance

Required:

- initial boot still works;
- production preview still works;
- viewport still reaches Ready;
- STL import still works;
- workers still load;
- Manifold/WASM still loads when required;
- frontend tests stay green;
- browser tests stay green;
- the current default Vite large-chunk warning is gone without threshold inflation.

Record before/after bundle measurements in the final report.

---

# 7. Objective C — Prove a Real Manifold Geometry Operation in Chromium

## 7.1 Preserve the current smoke proof

Do not remove or weaken the current browser smoke assertions:

```text
/workspace loads
viewport Ready
exactly one canvas
STL imports
model reaches Ready
exactly one canvas remains
no page error
no unexpected console error
```

## 7.2 Add one geometry proof

Extend the browser harness with one deterministic geometry operation.

Preferred hierarchy:

### Path A — real product workflow

Use the actual current application UI/runtime to reach a real operation, preferably:

```text
import deterministic closed STL
→ enter current mold workflow
→ create required base mold state
→ run Create Cavity
→ observe a deterministic successful committed result
```

Use stable accessible roles/labels/testable product state already present.

Do not redesign production UI merely to make Playwright easier.

### Path B — production-service browser probe

If Path A is objectively too brittle or impossible with the current UX without broad UI work, create the smallest test-only browser probe that imports and invokes the same existing production geometry service/module.

The probe must execute under Chromium against the production bundle/toolchain.

It must perform a real deterministic geometry operation such as subtract/Boolean through the existing Manifold-backed code.

The assertion must prove geometry changed truthfully, for example one or more of:

```text
result body count is expected
result is manifold/valid according to existing production validator
result volume is less than source mold volume after subtraction
result bounds match expected tolerance
no geometry operation failure reasonCode
```

Use existing tolerances/contracts. Do not invent a second validation standard.

## 7.3 Manifold warning classification

After the browser geometry operation passes, inspect the production build warning again.

If the `node:module` externalization warning still appears but:

- production build succeeds;
- real Chromium geometry succeeds;
- no page error occurs;
- no unexpected console error occurs;
- no Node-only API is actually reached in the browser path;

then record it as a **controlled third-party bundling warning** only if safe removal would require an unjustified package fork/polyfill/alias or architecture change.

Do not classify it as harmless before the real geometry proof passes.

If the browser geometry operation fails because of Manifold loading, repair the actual WASM/module loading boundary using the package’s supported browser path.

## 7.4 Acceptance

At least one Playwright test must now prove:

```text
real Chromium
+ production build/preview
+ real manifold-3d/WASM
+ real geometry operation
+ deterministic successful result
+ no page errors
+ no unexpected console errors
```

---

# 8. Objective D — Make Quality Gate Result Semantics Explicit

## 8.1 Keep current structure

Preserve:

```yaml
if: always()
```

for the aggregate Quality Gate so it still executes after failures/skips.

## 8.2 Replace broad negative checks with an allowed-result matrix

The gate should explicitly inspect each `needs.<job>.result`.

Conceptually:

```text
python-quality must equal success
frontend-quality must equal success
browser-smoke must equal success
repository-integrity must equal success

if push:
  dependency-review must equal skipped

if pull_request:
  dependency-review must equal success
```

Any mismatch fails the gate with a job-specific error message.

Do not add a second CI workflow solely for this check.

## 8.3 Acceptance

Static workflow review must demonstrate that:

- an unexpected skipped browser job cannot produce a green Quality Gate;
- an unexpected skipped frontend job cannot produce a green Quality Gate;
- an unexpected skipped Python job cannot produce a green Quality Gate;
- dependency review is allowed to skip only on non-PR push;
- dependency review is required to succeed on PR.

The real remote run for the final pushed SHA must then show the expected event-specific matrix.

---

# 9. Final Regression Sweep

Execution 06 touches test scheduling, import boundaries, browser geometry execution, and CI semantics. These are cross-cutting enough that previously closed behavior must be re-proven.

At minimum preserve automated coverage for:

## 9.1 Viewport/runtime

```text
mount
→ one canvas
→ Ready
→ STL import
→ latest-file-wins behavior
→ unmount cleanup
→ remount without duplicate runtime/canvas
```

## 9.2 Cut by Face

```text
select face
→ create mold parts
→ derived result
→ plane edit invalidates stale topology
→ final eraser invalidation remains correct
```

## 9.3 Cavity

```text
valid closed input
→ production cavity path succeeds
→ deterministic fallback behavior remains covered
→ current/stale async commit semantics remain correct
```

## 9.4 Sprue

```text
create
move
resize
remove
pending-vs-resolved intent semantics
stale async success/rejection cannot mutate newer state
```

## 9.5 Registration

```text
normal generation
Mold Scale regeneration
Segmentation sizing policy path
```

## 9.6 Segmentation

```text
printer-fit planning
worker stale guards
extension boundary
Mold Scale regeneration
Undo/Redo lifecycle
```

## 9.7 Browser geometry

```text
production preview
real Chromium
real deterministic geometry operation
no page/console error
```

---

# 10. No-Tech-Debt Rules

Do not close one warning by creating another hidden debt.

Execution 06 must not introduce:

- `@ts-ignore` or broad type escapes to make tests quiet;
- `console.error` suppression for React warnings;
- `chunkSizeWarningLimit` inflation;
- `npm audit fix --force` without explicit dependency analysis;
- duplicate Manifold instances caused by careless splitting;
- product behavior changes solely to make Playwright easier;
- test-only fake geometry replacing real browser geometry;
- CI `continue-on-error` for required gates;
- `|| true` around required validation commands;
- new skipped critical tests;
- a new “temporary” compatibility layer after this final baseline;
- a new architecture framework unrelated to the four objectives;
- TODOs for work that is required for Execution 06 completion.

Future product features are not technical debt and must not be pulled into this execution.

---

# 11. Suggested Work Order

Follow this order unless current repository evidence proves a dependency requires a different sequence.

## Phase 1 — Baseline capture

1. confirm live branch/HEAD/status;
2. run current build and record chunk sizes/warnings;
3. run current tests and capture every `act(...)` warning;
4. run current Playwright smoke;
5. inspect current CI workflow result logic.

## Phase 2 — React warning closure

1. fix the smallest root scheduling issues;
2. run affected suites after each repair;
3. run full Vitest once warning-producing suites are clean.

## Phase 3 — Bundle graph reduction

1. inspect eager import graph;
2. identify one or more real lazy-load boundaries;
3. refactor imports without changing domain behavior;
4. measure before/after;
5. confirm no duplicate Manifold/runtime initialization.

## Phase 4 — Browser geometry proof

1. attempt deterministic real product-path Cavity proof;
2. if impossible without broad UI work, implement the minimal production-service browser probe;
3. classify Manifold warning from actual browser evidence.

## Phase 5 — Quality Gate hardening

1. make allowed results explicit;
2. keep `always()`;
3. make failure messages job-specific.

## Phase 6 — Full harness

Run every required frontend, Python, repository, and browser command.

## Phase 7 — Remote verification

If authorized:

1. commit the final closure;
2. push once;
3. inspect the exact workflow run for the exact SHA;
4. do not push speculative extra “CI fixes” without reproducing the cause locally when possible.

---

# 12. Evidence Requirements

The final report must contain measurements and not generic claims.

## 12.1 React warnings

Report:

```text
before: N act(...) warning occurrences / affected suites
root causes fixed: ...
after: 0 unexplained warnings in the targeted/critical suites
```

If non-critical third-party test warnings remain, name them exactly and explain why they are outside application ownership. Do not silently ignore them.

## 12.2 Bundle

Report:

```text
before entry chunk: ___ kB uncompressed / ___ kB gzip
after entry chunk:  ___ kB uncompressed / ___ kB gzip
largest async chunks: ...
large-chunk warning: present/absent
```

Also report which feature/runtime boundary became lazy and why it is semantically safe.

## 12.3 Browser geometry

Report:

```text
browser: Chromium
path: product UI | production-service probe
fixture: ...
operation: ...
result evidence: ...
page errors: 0
unexpected console errors: 0
```

## 12.4 CI

Report exact job results for the final SHA.

---

# 13. Stop Conditions

Stop and report instead of forcing a false completion if any of the following is proven:

- the large bundle cannot be reduced below the current warning without breaking mandatory first-boot functionality;
- `manifold-3d` cannot execute the required geometry operation in the supported production browser path;
- removing a React warning requires hiding a genuine asynchronous lifecycle bug;
- CI behavior differs from the event-result model in a way the current workflow cannot truthfully represent;
- a new P0/P1 product correctness regression is discovered during the final sweep.

In these cases, do not claim final closure.

Create the smallest evidence-backed follow-up blocker description instead.

---

# 14. Final Decision Rules

Allowed final decisions:

## `REMOTE VERIFIED COMPLETE — FINAL STABILIZATION BASELINE`

Only if:

- React critical warnings are closed;
- the current large-chunk warning is closed without threshold inflation;
- real Chromium geometry operation passes;
- Quality Gate result matrix is explicit;
- all local frontend gates pass;
- all local Python gates pass;
- dependency audit passes;
- repository integrity passes;
- exact remote SHA is green.

## `LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION`

Only if every local criterion passes but the agent is not authorized to push or remote verification has not yet occurred.

## `PARTIALLY COMPLETE`

Use when implementation is materially correct but one or more required closure criteria remain open.

## `BLOCKED`

Use when a proven external/toolchain/package/runtime blocker prevents a required criterion and no safe repository-local repair exists.

---

# 15. Final Report Format

Use exactly this structure.

## 1. Decision

One allowed decision string plus one concise reason.

## 2. Repository State

```text
branch:
HEAD:
working tree:
comparison base:
```

## 3. React Harness Closure

```text
warnings before:
root causes:
files changed:
warnings after:
```

## 4. Bundle Closure

```text
before entry size:
after entry size:
new async boundaries:
large-chunk warning:
duplicate-runtime check:
```

## 5. Browser Geometry Proof

```text
browser:
fixture:
operation:
path:
geometry assertion:
page errors:
console errors:
```

## 6. Manifold Classification

State one:

```text
CLOSED — warning removed safely
CONTROLLED EXTERNAL WARNING — browser geometry proven, no safe app-local removal
BLOCKED — real browser geometry failure remains
```

Explain evidence.

## 7. Quality Gate Semantics

Show allowed push matrix and PR matrix and confirm unexpected skip behavior.

## 8. Frontend Verification

```text
npm ci:
npm audit --audit-level=high:
typecheck:
lint:
build:
Vitest:
Playwright:
```

## 9. Python Verification

```text
editable install:
ruff check:
ruff format --check:
pytest:
```

## 10. Regression Matrix

Report status for:

```text
Viewport lifecycle
STL import
Cut by Face
Eraser invalidation
Cavity
Sprue
Registration
Segmentation
Mold Scale
Undo/Redo
stale async ownership
browser geometry
```

## 11. Files Changed

List production, test, CI, and configuration files separately.

## 12. Remote Verification

```text
pushed SHA:
workflow run:
python-quality:
frontend-quality:
browser-smoke:
repository-integrity:
dependency-review:
quality-gate:
```

## 13. Remaining Risks

Required statement if complete:

```text
No known in-scope stabilization blocker remains.
Future feature work is intentionally out of scope for Execution 06.
```

If something remains, name it and downgrade the decision accordingly.

## 14. Phase Closure

If and only if the decision is `REMOTE VERIFIED COMPLETE — FINAL STABILIZATION BASELINE`, end with:

```text
The Execution 01–06 stabilization phase is closed.
Use this exact green SHA as the baseline for the next engineering phase.
Do not open another generic hardening execution unless new evidence reveals a regression.
```

---

# 16. Final Instruction to the Coding Agent

Do not optimize for the appearance of closure.

Optimize for evidence that the remaining four gaps are genuinely gone.

This execution is intentionally the last stabilization execution of this phase.

Therefore:

- fix only what is still open;
- measure before and after;
- preserve all prior correctness repairs;
- do not expand product scope;
- do not hide warnings;
- do not weaken CI;
- do not fake browser geometry;
- do not split bundles arbitrarily;
- do not duplicate Manifold/WASM initialization;
- do not declare remote completion without the exact green SHA.

Once the four remaining closure items are proven and the exact remote commit is green, stop.

The next work should belong to the next engineering layer of Craft.
