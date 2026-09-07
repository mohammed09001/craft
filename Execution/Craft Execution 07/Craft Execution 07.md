# Craft — Execution 07
## Final Production-Artifact and Bundle-Policy Closure Before the Next Engineering Phase

**Repository authority:** `mohammed09001/craft`  
**Execution folder:** `Execution/Craft Execution 07/`  
**Observed starting reference while constructing this execution:** `main` at `87585c200a5a6e9e93d679741af36818b6de2bee` (`Update project`)  
**Execution type:** final narrow closure / production-hygiene / bundle-policy verification  
**Primary objective:** close the two remaining post-Execution-06 gaps without reopening broad stabilization work, then leave Craft ready to move into the next engineering phase.  
**Engineering doctrine:** Prompt Engineering + Context Engineering + Loop Engineering + Harness Engineering + Hardness Discipline.

---

# 0. Mission

Execution 07 is intentionally smaller than Execution 06.

It must not become another general refactor.

Execution 06 successfully closed the major remaining stabilization gaps:

- React `act(...)` warnings were repaired at their scheduling boundary;
- the eager application entry was reduced from roughly `1.1 MB` minified to roughly `384 kB`;
- a real Chromium test now executes a real Manifold-backed Cavity Boolean through the production Worker/WASM path;
- the aggregate GitHub Actions Quality Gate now checks an explicit allowed-result matrix;
- frontend typecheck/lint/build/tests are green;
- Python Ruff/pytest are green;
- browser smoke is green;
- repository integrity is green;
- npm high/critical audit is green;
- the exact current `main` CI run is green.

The final post-Execution-06 audit found only two remaining closure gaps:

1. **the test-only `e2e-harness.html` is currently configured as a normal Vite build entry**, meaning an ordinary production `npm run build` emits the E2E harness into `dist/`;
2. **the default Vite large-chunk warning still appears** because the lazy shared `three.module` chunk is approximately `546.7 kB`, even though the eager application entry is already below the default `500 kB` threshold.

These are not current P0/P1 correctness failures.

They are final production-artifact and build-policy hygiene issues.

Execution 07 exists to close them cleanly and then stop stabilization work.

The target state is:

```text
normal production build
→ ships only production application entries
→ no test-only browser harness artifact

E2E production-like build
→ explicitly includes the test harness
→ Playwright still executes:
   app boot + STL import
   real Cavity / Manifold Worker / WASM Boolean

bundle policy
→ eager app remains materially reduced
→ no unexplained generic large-chunk warning
→ no artificial architecture damage merely to satisfy a generic threshold
→ explicit measurable bundle regression limits

full CI
→ green on exact final SHA
```

If these requirements are achieved and no new correctness regression appears, this stabilization phase is closed.

Do not create another generic hardening execution after this one unless a new concrete regression is discovered.

---

# 1. Definition of Complete

Execution 07 is complete only if all applicable requirements below are satisfied.

---

## 1.1 Production artifact isolation

A normal production build:

```bash
npm run build
```

must not emit or expose the test-only E2E harness.

At minimum, after the normal build the following must be absent:

```text
dist/e2e-harness.html
```

and any JS chunk that exists solely because of:

```text
src/test-harness/cavityGeometryProbe.ts
```

must also be absent from the production artifact graph.

The production application must still build and boot normally.

---

## 1.2 E2E harness preservation

The browser proof added in Execution 06 must not be deleted.

There must remain an explicit test-oriented build path that includes:

```text
e2e-harness.html
src/test-harness/cavityGeometryProbe.ts
```

and Playwright must still prove:

```text
real Chromium
→ real production Worker
→ real manifold-3d WASM
→ real Cavity Boolean subtraction
→ deterministic geometry result
→ no page error
→ no unexpected console error
```

The test harness must be isolated from normal production shipping, not removed.

---

## 1.3 Bundle closure

The current eager app chunk is already approximately:

```text
384.46 kB minified
115.94 kB gzip
```

Do not regress it materially.

The current remaining Vite warning is caused by a lazy/shared Three.js chunk around:

```text
546.70 kB minified
137.48 kB gzip
```

Execution 07 must close the **unexplained generic warning state** using one of the two allowed paths below.

### Preferred Path A — real safe chunk reduction

If repository evidence shows the Three.js chunk can be reduced below the default Vite threshold by:

- removing accidental barrel fan-out;
- moving additional non-bootstrap Three-dependent features behind genuine async boundaries;
- using supported granular Three imports;
- removing duplicate or unused dependencies;
- improving current Rolldown code-splitting boundaries;

then do so.

Required:

```text
no duplicate Three runtime
no duplicated WebGL renderer
no broken worker
no broken selection
no broken viewport
no deep-import hack that depends on undocumented package internals
no side-effect ordering regression
```

### Allowed Path B — explicit bundle-budget policy

If investigation proves that:

- the remaining `three.module` chunk is genuinely lazy;
- the eager app entry is already below the meaningful application budget;
- the >500 kB chunk is a shared third-party runtime boundary;
- splitting it further requires brittle internal imports, code duplication, a Three fork, or behavior-risking manual chunking;

then do **not** distort the architecture merely to satisfy Vite's generic threshold.

Instead:

1. establish an explicit Craft bundle-budget gate;
2. measure the eager entry separately from lazy/shared vendor chunks;
3. enforce the budgets in CI;
4. only after that gate exists, configure Vite so the generic warning no longer produces unexplained noise.

This is not permission to hide bundle growth.

It is permission to replace a generic one-size-fits-all warning with a stricter project-specific budget contract.

Execution 07 is complete under Path B only if the custom budget would fail on a meaningful regression.

---

## 1.4 No threshold-only shortcut

This is forbidden:

```ts
chunkSizeWarningLimit: 600
```

with no independent bundle budget.

This is also forbidden:

```text
"Three is big, ignore it."
```

The warning may be suppressed only after a stronger explicit budget policy is in place and the final report proves why that policy is more meaningful.

---

## 1.5 Full regression closure

After the production/E2E build split and bundle policy changes:

```text
Frontend quality        success
Browser smoke           success
Python quality          success
Repository integrity    success
Quality gate            success
```

must remain true on the exact final pushed SHA.

---

# 2. Source-of-Truth Order

Use this order:

1. current repository files;
2. live Git state;
3. current package scripts;
4. current Vite configuration;
5. current production build output;
6. current Playwright configuration/specs;
7. current GitHub Actions workflow;
8. reproducible local behavior;
9. exact remote CI logs;
10. this Execution 07 document;
11. older Execution documents only for historical intent.

The observed starting SHA is evidence, not a reset instruction.

If `main` has advanced beyond:

```text
87585c200a5a6e9e93d679741af36818b6de2bee
```

re-audit current state before editing.

---

# 3. External Research Baseline

Use current official tooling behavior as constraints.

Repository evidence remains authoritative for Craft.

---

## 3.1 Vite conditional configuration

Current Vite supports configuration as a function receiving values including:

```text
command
mode
isSsrBuild
isPreview
```

Therefore a test-only build entry does not need to exist in every production build.

A build can use an explicit mode such as:

```text
e2e
```

and the Vite config can include the E2E entry only for that mode.

Do not use a public `VITE_*` environment variable merely to control secret behavior.

There is no secret here, but `mode` is the cleaner build-configuration boundary.

---

## 3.2 Vite modes

Current Vite behavior:

```text
vite build
→ mode = production

vite build --mode e2e
→ command = build
→ mode = e2e
```

This makes it suitable to distinguish:

```text
normal shippable production artifact
```

from:

```text
production-like browser-test artifact
```

while preserving the same bundler/toolchain.

---

## 3.3 Multiple HTML entry points

Current Vite supports multi-page builds by explicitly providing multiple HTML entry points.

That means the current `e2e-harness.html` output exists because it is explicitly configured as an additional build input.

The correct isolation mechanism is to remove that input from normal production configuration and add it only in the E2E build configuration.

---

## 3.4 Rolldown code splitting

Current Rolldown supports automatic and advanced code splitting.

Manual grouping can alter evaluation order and side-effect timing.

Therefore:

- prefer natural dynamic-import boundaries;
- investigate module ownership before manual splitting;
- do not force Three internals into arbitrary chunks unless the runtime remains deterministic;
- a custom budget is preferable to risky chunk surgery when the remaining chunk is a legitimate lazy third-party boundary.

---

# 4. Starting Evidence

Reproduce this evidence before editing.

At the observed starting reference, the production build emitted approximately:

```text
app-*.js                         384.46 kB minified
three.module-*.js                546.70 kB minified
manifold-*.wasm                  541.47 kB raw
```

and also emitted:

```text
dist/e2e-harness.html
```

because the Vite input object contains both:

```text
app
e2e-harness
```

for all builds.

The build still prints:

```text
Some chunks are larger than 500 kB after minification.
```

The real-browser E2E suite currently contains two passing proofs:

```text
1. app boots + deterministic STL import
2. real Manifold-backed Cavity Boolean through production Worker path
```

The current remote frontend suite reports:

```text
182 passed test files
2 skipped test files
1070 passed tests
5 skipped tests
```

Python reports:

```text
357 passed
```

npm audit reports:

```text
0 vulnerabilities
```

Do not regress these baselines.

---

# 5. Scope Boundaries

Execution 07 must remain narrow.

Do not add:

- Generative Design;
- Mesh Repair;
- new mold workflows;
- new Cavity algorithms;
- new Segmentation algorithms;
- new Registration policy;
- new Sprue geometry;
- new UI;
- backend;
- API server;
- database;
- authentication;
- deployment platform;
- Docker;
- telemetry;
- new geometry kernel;
- Three.js replacement;
- Manifold replacement;
- new test framework;
- new bundler.

Allowed changes are only those necessary to:

```text
isolate test-only build artifacts
close bundle-warning policy
preserve all current proof
```

---

# 6. Objective A — Separate Production Build From E2E Build

This is the first objective.

---

## 6.1 Audit current build ownership

Inspect:

```text
mold/frontend/package.json
mold/frontend/vite.config.ts
mold/frontend/playwright.config.ts
.github/workflows/ci.yml
mold/frontend/e2e-harness.html
mold/frontend/e2e/
mold/frontend/src/test-harness/
```

Map:

```text
npm run build
→ Vite mode
→ build inputs
→ dist outputs

npm run e2e
→ expected dist
→ preview server
→ browser specs
```

Do not edit until this flow is understood.

---

## 6.2 Required production behavior

A normal production build must conceptually behave as:

```text
vite build
mode=production
input:
  app/index.html only
```

It must not build:

```text
e2e-harness.html
```

as a public entry.

---

## 6.3 Required E2E behavior

Create or preserve an explicit production-like E2E build path.

A preferred shape is equivalent to:

```text
vite build --mode e2e
```

with inputs:

```text
app/index.html
e2e-harness.html
```

The exact npm script name may be:

```text
build:e2e
```

or another repository-consistent name.

Do not invent multiple competing E2E modes.

One explicit mode is enough.

---

## 6.4 Vite configuration shape

Prefer a conditional Vite config based on the config callback:

```text
defineConfig(({ command, mode }) => ...)
```

The principle is:

```text
production mode:
  app input only

e2e build mode:
  app + e2e-harness
```

Do not gate this with random runtime state.

Build configuration should be deterministic from the command/mode.

---

## 6.5 TypeScript compilation boundary

If the E2E test harness source is part of the frontend TypeScript project, normal typecheck may still compile it.

That is acceptable.

The requirement is about **shipping artifacts**, not hiding test source from static analysis.

Do not weaken typecheck just to isolate output.

---

## 6.6 Production artifact test

Add a deterministic verification step.

After:

```bash
npm run build
```

prove:

```text
dist/e2e-harness.html does not exist
```

Also verify that a chunk whose only entry/owner is the cavity test harness is not emitted.

Do not rely only on manual inspection.

Use the smallest durable repository-native check.

Possible forms:

```text
Node script
shell check in CI
small Vitest/config test
```

Choose one source of truth.

---

## 6.7 E2E artifact test

After the E2E-specific build:

```text
e2e-harness.html must exist
```

and:

```text
npm run e2e
```

must still run both browser specs.

Do not make Playwright silently depend on stale `dist/` from a prior developer build.

The E2E workflow must create the artifact it needs deterministically.

---

## 6.8 CI ownership

Frontend Quality must validate the real production artifact.

Browser Smoke must validate the E2E production-like artifact.

Conceptually:

```text
frontend-quality:
  npm run build
  verify production artifact excludes harness

browser-smoke:
  build E2E artifact
  run Playwright
```

Do not let Browser Smoke change the meaning of the normal production build.

---

# 7. Objective B — Re-Audit the Remaining Three.js Chunk

Do not immediately change Vite warning settings.

Investigate first.

---

## 7.1 Measure exact current output

Run:

```bash
npm run build
```

and record:

```text
app entry size
Three shared chunk size
largest other JS chunk
WASM size
gzip sizes
number of JS chunks
warning text
```

Then run the E2E build and record whether its output materially changes shared chunks.

Keep production and E2E measurements separate.

---

## 7.2 Identify why Three is one ~546 kB chunk

Trace current imports into the Three shared chunk.

Classify consumers:

```text
BOOT VIEWPORT
LAZY VIEWPORT RUNTIME
MEASUREMENT
SELECTION
HIGHLIGHT
BVH
MOLD VISUALIZATION
TEST-HARNESS ONLY
```

Determine whether the chunk is:

```text
one large third-party module
```

or:

```text
multiple separable Three-related modules grouped together
```

This distinction determines Path A versus Path B.

---

## 7.3 Check for accidental eager ownership

Execution 06 successfully moved many geometry engines behind dynamic boundaries.

Reconfirm no new or overlooked static import pulls Three-heavy code into the eager `app` chunk.

The eager app must remain below the established budget.

If an accidental static edge exists, fix it.

---

## 7.4 Avoid false optimization

Do not split Three purely by filename.

Do not create:

```text
three-part-1
three-part-2
```

with arbitrary manual groups.

Do not deep-import undocumented internal files merely to reduce a warning.

Do not duplicate Three copies across async chunks.

Do not create multiple renderer/runtime singletons.

---

# 8. Objective C — Preferred Path A: Real Chunk Reduction

Use this path only if evidence supports it.

---

## 8.1 Natural boundaries first

Look for real lazy boundaries such as:

```text
viewport runtime creation
measurement subsystem
selection/BVH support
mold visualization
rare geometry inspection tools
```

If a subsystem is not needed until user action, move its owning import behind the existing async runtime boundary.

Do not move code asynchronously if current synchronous semantics are required.

---

## 8.2 Granular supported imports

If Craft currently imports a broad Three barrel where supported public submodule imports would reduce retained code, use supported package entry points only.

Do not depend on unstable internal source paths unless Three officially exposes them.

---

## 8.3 Rolldown manual splitting

Use `output.codeSplitting` only after natural boundaries have been exhausted.

Before manual grouping:

- inspect side effects;
- inspect execution order;
- inspect shared singleton assumptions;
- inspect worker imports;
- inspect WebGL runtime initialization.

A smaller warning is not worth a runtime-order regression.

---

## 8.4 Acceptance for Path A

Path A succeeds if:

```text
normal production build:
  no test harness
  eager app within budget
  no chunk > default threshold
  no generic large-chunk warning

E2E:
  both browser tests pass

frontend:
  full suite passes
```

---

# 9. Objective D — Allowed Path B: Explicit Craft Bundle Budget

Use this only if Path A is proven unsafe or architecture-negative.

---

## 9.1 Required evidence before choosing Path B

The final report must prove:

```text
Three chunk is lazy/shared
eager app is already below budget
further splitting requires one or more of:
  brittle deep imports
  duplicated Three runtime
  risky manual execution-order changes
  package fork
  architecture distortion
```

Do not choose Path B merely because Path A takes effort.

---

## 9.2 Create project-specific budgets

Define explicit budgets from the current known-good baseline.

Do not use arbitrary round numbers with no relationship to measured output.

A reasonable policy should include at least:

```text
Eager application entry maximum
Largest lazy/shared JS chunk maximum
```

Recommended engineering shape:

```text
eager app:
  current ≈ 384 kB
  budget with small regression margin

largest lazy/shared JS:
  current ≈ 547 kB
  budget with small regression margin
```

The exact limits must be justified in the final report.

Avoid a huge buffer such as:

```text
1.5 MB
```

which would make the gate meaningless.

---

## 9.3 Bundle budget enforcement

Add a deterministic automated check.

It must:

1. inspect the actual build output;
2. identify the application entry;
3. measure relevant JavaScript chunks;
4. fail if the established budget is exceeded;
5. print measured values on failure.

Do not parse human Vite console text if a structured build artifact or bundler hook can provide a more reliable source.

Possible robust approaches include:

```text
small Vite/Rolldown plugin using generated bundle metadata
small post-build Node script
manifest-backed budget script
```

Choose the smallest maintainable option.

---

## 9.4 Only then adjust generic Vite warning

After the custom budget gate is working and tested, the generic warning threshold may be adjusted only enough to stop known controlled lazy-vendor noise.

The config must explain:

```text
why the project-specific budget is authoritative
```

This is not “warning suppression.”

The custom budget becomes the stricter regression contract.

---

## 9.5 Required negative test

Prove the budget mechanism fails.

Do not permanently enlarge a real bundle just to test it.

Instead, test the budget evaluator with deterministic synthetic metadata/file sizes or a unit-test seam.

Required proof:

```text
within budget → pass
over eager budget → fail
over lazy budget → fail
```

---

# 10. Objective E — Preserve Real Browser Geometry Proof

The E2E isolation change must not weaken the proof added in Execution 06.

---

## 10.1 Preserve the two browser tests

Expected:

```text
e2e/smoke.spec.ts
e2e/cavityGeometry.spec.ts
```

Both must remain active.

---

## 10.2 Preserve real production geometry imports

`cavityGeometryProbe.ts` must continue importing the actual production modules.

Do not duplicate the Boolean algorithm into the test harness.

Do not mock:

```text
Worker
manifold-3d
WASM
Cavity generation
```

for this browser proof.

---

## 10.3 Preserve deterministic geometry assertions

The Cavity probe should continue verifying meaningful geometry, including current deterministic equivalents of:

```text
original volume
removed volume
result volume
body count
watertight/manifold validity
blocker count
```

Do not reduce it to:

```text
result.ok === true
```

only.

---

## 10.4 Production isolation must not mean runtime divergence

The E2E build may add a test-only HTML entry.

It must still build production source modules with the same Vite/TypeScript toolchain.

Do not create a separate fake geometry application.

---

# 11. Objective F — Preserve Quality Gate Semantics

Execution 06 fixed the aggregate result matrix.

Do not simplify it.

Required push semantics:

```text
python-quality        success
frontend-quality      success
browser-smoke         success
repository-integrity  success
dependency-review     skipped
```

Required PR semantics:

```text
python-quality        success
frontend-quality      success
browser-smoke         success
repository-integrity  success
dependency-review     success
```

Unexpected `skipped` for required quality jobs must remain a failure.

---

# 12. Objective G — Final Regression Sweep

Execution 07 touches build boundaries, not core manufacturing algorithms.

Nevertheless run full regression because import/code-splitting changes can alter runtime behavior.

---

## 12.1 Viewport

Verify:

```text
workspace boot
one canvas
STL import
selection
measurement
orientation
Mold Scale
```

---

## 12.2 Cut by Face

Preserve:

```text
split add
split move
split remove
Eraser invalidation
Done
Undo/Redo
```

---

## 12.3 Cavity

Preserve:

```text
direct path
fallback path
worker path
real browser Worker/WASM path
```

---

## 12.4 Sprue

Preserve:

```text
generation
move
resize
remove
revalidation
stale-result protection
```

---

## 12.5 Registration

Preserve:

```text
base registration
post-Cavity registration
post-Sprue registration
Mold Scale regeneration
```

---

## 12.6 Segmentation

Preserve:

```text
planning
preview
execute
stale guards
extension axis
printer-fit behavior
```

---

# 13. Required Harness

From:

```text
mold/frontend/
```

run normal production verification:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm run build
npm run test:run
```

Then verify production artifact isolation.

Then run the explicit E2E build path.

Then:

```bash
npm run e2e
```

Required browser result:

```text
2 passed
0 failed
```

unless additional legitimate E2E tests have been added.

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

From repository root:

```bash
git diff --check
```

---

# 14. Bundle Measurement Report

The final report must include a concise before/after table equivalent to:

```text
Metric                       Before Exec07      After Exec07
-------------------------------------------------------------
Eager app JS                 ~384 kB            ...
Largest lazy/shared JS       ~547 kB            ...
Production E2E harness       PRESENT            ABSENT
Normal build warning         PRESENT            ...
E2E browser tests            2 pass             ...
Frontend tests               1070 pass          ...
Python tests                 357 pass           ...
```

Do not claim optimization without numbers.

---

# 15. No-Tech-Debt Rules

Forbidden shortcuts:

- do not delete the E2E geometry proof;
- do not leave `e2e-harness.html` in normal production output;
- do not rely on a stale prebuilt `dist`;
- do not raise `chunkSizeWarningLimit` without an independent bundle budget;
- do not set an excessively loose bundle budget;
- do not deep-import undocumented Three internals merely to reduce size;
- do not fork Three;
- do not replace Three;
- do not duplicate Three runtime across chunks;
- do not remove WebGL functionality;
- do not disable Vite warnings globally;
- do not filter CI logs;
- do not disable browser smoke;
- do not skip Cavity browser proof;
- do not weaken Quality Gate;
- do not add `continue-on-error`;
- do not alter manufacturing geometry;
- do not rewrite Cavity/Segmentation math;
- do not add new product functionality;
- do not commit `dist/`;
- do not commit Playwright reports;
- do not commit temporary bundle-analysis output;
- do not push unless separately authorized.

---

# 16. Suggested Work Order

Follow this order.

---

## Phase 1 — Baseline

1. record Git branch / SHA / status;
2. run normal production build;
3. record emitted entries;
4. record bundle sizes;
5. run current E2E;
6. record current CI architecture.

---

## Phase 2 — Production artifact isolation

1. convert Vite config to conditional config if required;
2. define one E2E build mode;
3. normal build → app only;
4. E2E build → app + harness;
5. add production artifact assertion;
6. verify Playwright still works.

---

## Phase 3 — Three.js investigation

1. inspect build graph;
2. classify Three consumers;
3. search accidental static ownership;
4. decide Path A or Path B;
5. record decision evidence.

---

## Phase 4A — Safe chunk reduction

Only if justified:

1. move valid boundaries async;
2. remove barrel fan-out;
3. use supported imports;
4. rebuild;
5. browser test;
6. full frontend test.

---

## Phase 4B — Explicit bundle budget

Only if Path A is architecture-negative:

1. define budgets;
2. implement budget evaluator;
3. add positive/negative tests;
4. run evaluator on real build;
5. only then quiet generic Vite threshold noise;
6. preserve measured regression protection.

---

## Phase 5 — Full regression

Run all frontend, browser, Python, and repository gates.

---

## Phase 6 — Remote verification

After user-authorized push:

1. fetch exact workflow run for exact SHA;
2. confirm every required job;
3. confirm Quality Gate;
4. print final decision.

---

# 17. Stop Conditions

Stop and report instead of expanding scope if:

- eliminating the Three chunk requires forking Three;
- eliminating the warning requires breaking supported public imports;
- a custom bundle budget cannot reliably identify the eager entry;
- E2E isolation requires a second application architecture;
- browser geometry proof fails after build isolation and root cause is outside touched build configuration;
- normal production build cannot exclude the harness without breaking Vite preview;
- a new P0/P1 manufacturing correctness defect is discovered.

A new correctness defect should be reported separately.

Do not bury it inside bundle cleanup.

---

# 18. Decision Rules

Use one of the following.

---

## `REMOTE VERIFIED COMPLETE — STABILIZATION PHASE CLOSED`

Use only when:

- normal production build excludes E2E harness;
- E2E build includes it;
- both Playwright tests pass remotely;
- bundle warning is either truly eliminated through safe splitting or replaced by a stricter explicit Craft bundle budget;
- eager app has not materially regressed;
- frontend is green;
- Python is green;
- repository integrity is green;
- Quality Gate is green;
- exact pushed SHA is verified.

This is the desired end state.

---

## `LOCAL COMPLETE — READY FOR USER PUSH / REMOTE VERIFICATION`

Use when all local acceptance criteria pass but the agent was not authorized to push.

---

## `PARTIALLY COMPLETE`

Use when one of the two closure gaps remains.

Examples:

```text
production harness isolated
but bundle policy still unresolved
```

or:

```text
bundle policy closed
but normal production artifact still contains test harness
```

---

## `BLOCKED`

Use when a stop condition prevents correct completion without architecture expansion.

---

# 19. Final Report Format

Print the final report.

Do not create another committed report document unless explicitly requested.

Use this structure:

```text
Decision
Repository State
Observed Starting SHA
Final SHA
Execution 07 Scope
Production Build Before
Production Build After
E2E Build Design
Production Artifact Isolation
Production Artifact Assertion
E2E Harness Preservation
Bundle Investigation
Three.js Chunk Classification
Path Chosen: A or B
Bundle Budget / Chunk Reduction
Bundle Measurements
Vite Warning State
Frontend Typecheck
Frontend Lint
Frontend Build
Frontend Tests
Browser Tests
Cavity Chromium Geometry Proof
Python Ruff
Python Format
Python Tests
Repository Integrity
Quality Gate
Files Added
Files Modified
Files Deleted
Regression Assessment
Remaining Warnings
Remaining Risks
Remote CI
Phase Closure
User Action Required
```

---

# 20. Final Acceptance Checklist

Before declaring completion, answer every line:

```text
[ ] normal production build excludes e2e-harness.html
[ ] normal production build excludes test-harness-only JS ownership
[ ] E2E build explicitly includes e2e-harness.html
[ ] E2E build is deterministic and not dependent on stale dist
[ ] app boot browser test passes
[ ] real Cavity / Worker / Manifold / WASM browser test passes
[ ] eager app entry does not materially regress from ~384 kB
[ ] remaining Three chunk is understood
[ ] Path A or Path B is explicitly documented
[ ] generic large-chunk warning is no longer unexplained
[ ] if Path B: independent bundle budget exists
[ ] if Path B: budget has negative tests
[ ] no threshold-only suppression
[ ] no Three fork
[ ] no duplicate renderer/runtime
[ ] no manufacturing behavior changed
[ ] frontend typecheck passes
[ ] frontend lint passes
[ ] frontend build passes
[ ] frontend tests pass
[ ] npm high/critical audit passes
[ ] Python Ruff passes
[ ] Python format passes
[ ] Python pytest passes
[ ] repository integrity passes
[ ] Quality Gate semantics preserved
[ ] exact remote SHA is green before remote-complete claim
```

---

# 21. Final Instruction to the Coding Agent

Treat Execution 07 as the final cleanup patch of the stabilization era.

The repository does not need another broad hardening rewrite.

Do not optimize for making logs cosmetically pretty.

Optimize for these two truths:

```text
1. production must ship only production artifacts;
2. bundle regressions must be measured by a policy that reflects Craft's real runtime architecture.
```

The preferred final architecture is:

```text
NORMAL PRODUCTION BUILD
  index.html
  production app chunks
  production lazy runtime chunks
  production WASM/workers
  NO E2E HTML ENTRY
  NO TEST-HARNESS ENTRY

E2E BUILD
  normal production app
  + e2e-harness.html
  + test-only browser probe entry

BUNDLE POLICY
  eager application budget
  + lazy/shared chunk budget
  + CI enforcement
```

When those invariants are proven and the exact final `main` SHA is remotely green, print:

```text
REMOTE VERIFIED COMPLETE — STABILIZATION PHASE CLOSED
```

Then stop stabilization work and move Craft into the next engineering phase.
