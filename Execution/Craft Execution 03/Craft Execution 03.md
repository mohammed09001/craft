# Craft — Execution 03
## Repository Hardening Closure: Async State Integrity + Green CI + Security + Context Hygiene + Architecture Boundaries

**Repository authority:** `mohammed09001/craft`  
**Repository root:** repository root → `mold/` → `frontend/`  
**Execution folder:** `Execution/Craft Execution 03/`  
**Observed starting reference while constructing this execution:** `main` at `065d914b70dd0ab50e21154c1316f2d92aead93d` (`Update project`)  
**Execution philosophy:** evidence-first, remove ambiguity, repair invariants instead of symptoms, delete dead code before adding abstractions, preserve product behavior, leave no known red quality gate, stale state path, misleading repository context, or unclassified high-risk dependency.

---

# 0. Mission

Execution 03 is a **hardening and closure execution**, not a feature phase.

Execution 01 simplified the Constructed Cutting Plan architecture and repaired the primary stale topology/derived-state bug.

Execution 02 then:
- closed most Sprue topology-revalidation gaps;
- consolidated the surviving Segmentation semantics;
- moved CI to a real repository-root workflow;
- exposed previously hidden repository-wide quality failures.

A repository audit after Execution 02 found that the project still cannot honestly be called closed because:

1. a stale/cancelled asynchronous Sprue evaluation can still reach a rejection path that mutates newer state;
2. the real GitHub Actions quality gate on `main` is red;
3. frontend lint blocks build/tests in CI;
4. Python Ruff blocks formatting/tests in CI;
5. the dependency install reports high-severity npm vulnerabilities that are not yet classified and closed;
6. `CURRENT_HANDOFF.md` contains stale branch/HEAD/working-tree claims and can mislead coding agents;
7. active source, historical artifacts, backup files, and ambiguous experimental code are still mixed in the repository;
8. the root README is not a truthful architectural entry point;
9. frontend and Python engine responsibilities are not stated strongly enough as current source-of-truth boundaries;
10. an additional TypeScript `src/mold-generation` area has unclear runtime ownership and must be classified;
11. obsolete “draft” semantics still survive in active Segmentation comments/tests;
12. the newly-created CI should be hardened so stale workflow runs and insecure dependency changes do not become recurring maintenance debt.

Execution 03 must close those issues without redesigning Craft's product behavior.

The goal is not “make the warnings disappear.”

The goal is:

```text
one authoritative state transition model
one truthful quality baseline
one truthful repository context
one explicit architecture boundary
zero known unresolved high/critical dependency risk without an explicit blocker
zero ambiguous active-vs-historical code surfaces
```

---

# 1. Definition of Complete

Do not report `COMPLETE` unless all applicable requirements below are proven.

## 1.1 Product-state integrity

All asynchronous operations that can mutate mold-derived state must obey a current-request/current-document commit contract.

At minimum:
- stale success cannot commit;
- stale failure cannot commit;
- stale cancellation cannot mark a newer request as failed;
- stale progress cannot overwrite newer progress;
- topology replacement invalidates topology-dependent Sprue truth;
- preserved Sprue intent remains explicitly unresolved until rebuilt;
- Undo/Redo restores coherent snapshots;
- no old worker completion can mutate newer authoritative mold state.

## 1.2 Frontend quality

From `mold/frontend/`, all must pass:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:run
```

No lint rule may be disabled merely to make the gate green.

No `any` may be replaced by another equally-unsound escape hatch such as:
- `unknown as any`;
- broad `eslint-disable`;
- file-wide rule suppression;
- unsafe cast chains;
- arbitrary `@ts-ignore`.

If a narrowly justified suppression is genuinely required by a third-party boundary, it must be local, explained, and tested. Prefer an exact type.

## 1.3 Python quality

From `mold/`, all must pass:

```bash
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

Do not weaken Ruff configuration to make old violations disappear.

Fix code to satisfy the configured contract.

## 1.4 Repository integrity

From repository root:

```bash
git diff --check
git status --short
```

No conflict markers, accidental generated artifacts, tracked secrets, temporary reports, editor backups, or stale generated output may remain.

## 1.5 Security

All known high/critical npm advisories must be:
- eliminated through safe dependency updates; or
- proven not present after lockfile refresh; or
- if no safe upstream remediation exists, explicitly classified as a hard blocker.

Do not report `COMPLETE` while an unmitigated high/critical vulnerability remains merely because it is inconvenient.

Do not run destructive upgrades blindly.

In particular, do not use:

```bash
npm audit fix --force
```

as a substitute for understanding dependency impact.

## 1.6 Agent context

No committed document presented to coding agents as “current repository state” may contain stale dynamic facts such as:
- a hard-coded current branch;
- a hard-coded current HEAD;
- claims that files are currently uncommitted;
- claims about a local working tree that cannot be true for every clone/session.

Dynamic repository state must be discovered from Git at session start.

## 1.7 Architecture ownership

Every currently tracked engine/source area must be classified as:
- active runtime;
- active offline/core engine;
- contract-only boundary;
- test/support;
- historical/archive;
- dead and deleted.

No codebase may remain in an “unclear whether active” state.

This does **not** require frontend↔Python runtime integration in Execution 03.

It requires that current ownership be truthful and explicit.

---

# 2. Starting Evidence — Verify Before Editing

The following evidence was observed while constructing this execution.

Treat the repository as authoritative and re-verify it before edits.

Observed current root CI:

```text
.github/workflows/ci.yml
```

Observed CI jobs:
- Python quality (`mold/`);
- Frontend quality (`mold/frontend/`);
- Repository integrity.

Observed real GitHub Actions result for the current `main` commit:
- repository integrity passed;
- frontend typecheck passed;
- frontend lint failed;
- frontend build/tests were skipped;
- Python install passed;
- Ruff failed;
- Ruff format/pytest were skipped.

Observed frontend lint failures include:
- `mold/frontend/src/features/mold-generation/geometry/__tests__/manifoldProvenance.experiment.test.ts`
- `mold/frontend/src/features/mold-generation/registration/RegistrationGenerationService.ts`
- `mold/frontend/src/features/mold-generation/registration/registrationPlanner.test.ts`
- `mold/frontend/src/features/mold-generation/registration/registrationPlanner.ts`
- `mold/frontend/src/features/mold-generation/sprue-generation/SprueGenerationService.ts`
- `mold/frontend/src/features/mold-generation/workflow/moldEvaluationCoordinator.ts`

Observed Python Ruff failures include files under:
- `src/engineering_analysis/session/`
- `src/engineering_reports/`
- `src/mold_generator_engine/config/`
- `src/mold_generator_engine/pipeline/detailed_mold_analysis/`
- corresponding tests.

Observed `pyproject.toml` already defines:
- Python `>=3.13,<3.14`;
- Ruff target `py313`;
- Ruff lint rules including `E4`, `E7`, `E9`, `F`, `I`, `B`, `UP`;
- Ruff formatter.

Observed frontend package scripts already define:
- `typecheck`;
- `lint`;
- `build`;
- `test:run`.

Observed repository context pollution at `mold/` includes at least:
- `.chapter10/`
- `.stage-work/`
- `a3-runtime-diff.txt`
- `viewport-appearance-typecheck.txt`

Observed project documentation states that several `*.bak` files exist beside active mold-generation code.

Observed root `README.md` does not provide a meaningful current project entry point.

Observed `mold/docs/agent/CURRENT_HANDOFF.md` contains stale dynamic state, including an old branch/HEAD and claims about then-uncommitted work.

Observed project architecture currently contains:
- active browser-side mold generation under `mold/frontend/src/features/mold-generation/`;
- a Python core engine under `mold/src/mold_generator_engine/`;
- `engineering_analysis` and `engineering_reports` Python packages;
- a contract-only frontend `engine-integration` boundary;
- an additional TypeScript `mold/src/mold-generation/` area whose active build/runtime relationship is unclear.

Re-verify every item.

If the repository changed after this prompt was written, follow current evidence and document the divergence.

---

# 3. Mandatory Working Rules

1. Start at repository root.
2. Record branch, HEAD, `git status --short`, and whether the working tree is clean.
3. Read `AGENTS.md`, `mold/docs/agent/PROJECT_MAP.md`, `mold/docs/agent/CURRENT_HANDOFF.md`, `mold/docs/agent/ENGINEERING_LOOP.md`, `mold/docs/agent/WORKFLOW_POLICY.md`, and relevant feature READMEs before editing.
4. Treat live repository evidence as more authoritative than this prompt.
5. Never discard unrelated user work.
6. Do not commit, push, merge, switch branches, rewrite history, or change Git settings unless the user separately authorizes it.
7. Do not add compatibility shells for obsolete semantics.
8. Prefer removing dead code to wrapping it.
9. Prefer strengthening an existing invariant/commit gate to creating a parallel mechanism.
10. Do not hide a failing gate by weakening lint, tests, security checks, or CI.
11. Every behavioral repair must have a focused regression test.
12. Every architecture cleanup must have evidence proving removed/moved code is not an active runtime dependency.
13. Do not add a new framework for a problem the current architecture can solve with a smaller contract.
14. No secrets, tokens, credentials, machine-specific absolute paths, or copied local environment data in tracked files.
15. Do not change manufacturing constants, mold geometry policy, Registration sizing, cavity clearance, Sprue profile geometry, or Segmentation mathematics unless a failing invariant proves current code cannot remain correct without a narrow dependency-safe change.

---

# 4. Objective A — Close the Stale Async Sprue Failure Race

## 4.1 Confirm the failure path

Trace:

```text
rebuildSprueDefinitions
→ runDerivedMoldEvaluation
→ derivedMoldEvaluation.workerClient
→ success / failure / cancellation
→ state commit
```

Current success is expected to use a freshness/commit gate.

Current failure/catch path must be inspected independently.

Do not assume that because success is guarded, failure is guarded.

Reproduce the race before changing code.

Minimum race:

```text
topology A
→ Cavity A
→ start Sprue evaluation request A
→ before A settles, replace topology with B
→ A is cancelled/rejected
→ verify whether A's catch/rejection mutates B's current evaluation/error state
```

The test must fail before the repair if the current bug is still present.

## 4.2 Introduce one async commit contract

Do not patch only one `catch` if the same class of defect exists elsewhere.

Audit every async mutation path in the mold-generation lifecycle, including at least:
- Cavity worker;
- derived mold evaluation worker;
- Sprue rebuild/edit operations;
- Segmentation worker;
- Segmentation Mold Scale regeneration;
- Registration generation if asynchronous;
- progress callbacks;
- cancellation callbacks;
- worker error callbacks.

For every async operation, identify:
- request ID;
- source document revision;
- source document fingerprint;
- lifecycle epoch if applicable;
- source model/geometry signature if applicable.

A mutation is allowed only when its captured identity still matches current authoritative state.

The contract is:

```text
capture request identity at start

await / worker message / rejection / progress

before ANY state write:
    confirm request identity still belongs to current authoritative state

if current:
    commit

if stale:
    discard silently as stale/cancelled
```

Do not convert stale cancellation into a current `failed` state.

## 4.3 Failure semantics

Distinguish at least:

```text
current genuine failure
stale result
explicit cancellation
superseded request
worker infrastructure failure
```

A superseded/cancelled request is not a failure of the new request.

A stale request must not:
- set `error`;
- set current `evaluation.phase = failed`;
- set current `sprueStatus`;
- clear a newer result;
- overwrite newer progress;
- restore old presentation;
- restore old body IDs;
- overwrite new topology lineage.

## 4.4 Prefer existing commit-gate concepts

Inspect:
- `canCommitMoldEvaluation`;
- Segmentation commit gates;
- document revision/fingerprint gates;
- worker request IDs.

If the existing gate can be extended to validate both success and failure/progress completion, do that.

Do not create a second “almost identical” freshness system.

If a new helper is justified, it should encode one clear invariant and be reused where appropriate.

## 4.5 Worker cancellation

A persistent Worker that rejects superseded requests is acceptable only if the store layer treats cancellation/supersession correctly.

Do not assume terminating the Worker is the only way to achieve correctness.

Correctness belongs at both levels:
- cancellation communicates intent;
- authoritative-state freshness gates prevent stale commit.

Use cancellation for efficiency/clarity.

Use commit identity for correctness.

## 4.6 Required tests

Add focused tests for:

### A. stale success

```text
request A starts
newer document/request B becomes authoritative
A succeeds
A cannot commit
```

### B. stale rejection

```text
request A starts
newer document/request B becomes authoritative
A rejects/cancels
A cannot mark B failed
```

### C. stale progress

If progress is externally committed, old progress cannot overwrite the current request.

### D. current failure

A genuine current request failure must still surface correctly.

### E. topology replacement during Sprue evaluation

After new topology becomes authoritative:
- old resolved Sprue geometry is absent;
- old target body IDs are absent;
- preserved intent is pending;
- current Cavity/Registration lifecycle is truthful;
- late old completion cannot alter new state.

---

# 5. Objective B — Finish Sprue Intent vs Resolved Geometry Semantics

Audit:

```text
sprueDefinitions
sprues
SprueOperationDefinition
SprueDefinition
SpruePresentationDefinition
selectSpruePresentationDefinitions
viewport Sprue renderer
Sprue tools
```

## 5.1 Required invariant

These are not equivalent:

```text
pending user intent
resolved manufactured Sprue geometry
invalid/stale intent
```

No consumer may infer “resolved” merely because a presentation DTO exists.

## 5.2 Do not overengineer

If the current renderer already visually and behaviorally distinguishes pending intent from resolved geometry, preserve it.

Do not redesign Sprue UX simply to create a prettier type model.

However, if the same DTO creates ambiguity that has already caused incorrect behavior, separate the contract narrowly.

A valid solution may be:
- a stronger discriminated union;
- a separate pending-intent presentation path;
- a selector that produces a truthful status-tagged shape;
- stricter consumer checks.

Choose the smallest design that makes illegal interpretation difficult.

## 5.3 Required proof

Tests must prove:
- pending intent has no resolved depth;
- pending intent has no authoritative resolved target body IDs;
- pending intent cannot enter resolved Boolean geometry;
- resolved presentation requires current resolved geometry;
- topology invalidation cannot make old resolved geometry appear current.

---

# 6. Objective C — Make Frontend CI Green Without Weakening the Contract

## 6.1 Fix exact lint failures first

Re-run:

```bash
cd mold/frontend
npm ci
npm run typecheck
npm run lint
```

Fix current errors at their source.

Expected classes include:
- `@typescript-eslint/no-explicit-any`;
- unused parameters/variables;
- `prefer-const`;
- experiment/test typing.

## 6.2 Type repairs

For each `any`, determine the actual boundary type.

Acceptable strategies:
- derive a type from an imported API;
- create a narrow local structural interface;
- use `unknown` followed by real runtime narrowing;
- use generic parameters already exposed by the library;
- type test doubles explicitly.

Do not use `unknown` as a cosmetic replacement if code immediately casts it unsafely.

## 6.3 Unused values

Do not merely rename unused arguments to `_x` if the configured lint rule still rejects them.

Choose based on semantics:
- remove the parameter if contract permits;
- use the value if it is part of the intended invariant;
- restructure the callback;
- if a public interface requires it, make the interface use explicit and documented rather than hiding the lint error.

## 6.4 Experiment tests

If `manifoldProvenance.experiment.test.ts` is an active regression test, type and maintain it.

If it is exploratory and not intended for CI, move it out of active test discovery or delete it if Git history is sufficient.

Do not keep exploratory files named `*.test.ts` in the active quality surface if they are not real tests.

## 6.5 Full frontend closure

After lint passes:

```bash
npm run build
npm run test:run
```

Fix failures caused by current code.

The purpose of this execution is to establish a green baseline.

---

# 7. Objective D — Make Python CI Green Without Weakening Ruff

Current Ruff configuration is deliberate.

Do not disable `UP`, `I`, `F`, `B`, or other selected rules to get green.

## 7.1 Use Ruff safely

Start with:

```bash
cd mold
ruff check .
```

Use safe automatic fixes only where behavior-neutral, then inspect the diff.

Expected classes include:
- import sorting;
- `collections.abc` imports;
- `StrEnum` modernization;
- `datetime.UTC`;
- unnecessary quoted annotations;
- unused imports;
- modern generic syntax.

Do not apply unsafe fixes blindly.

## 7.2 Python 3.13 target is authoritative

The project already targets Python 3.13.

Modernization to Python 3.13-native syntax is allowed when:
- it matches configured `requires-python`;
- tests prove behavior;
- public serialized values remain unchanged.

For Enum migration, confirm external/string behavior before and after.

## 7.3 Full Python closure

Run:

```bash
ruff check .
ruff format .
ruff format --check .
pytest
```

Do not leave a formatting-only CI failure.

---

# 8. Objective E — Harden GitHub Actions

The current root CI must remain.

Do not move it back under `mold/.github`.

## 8.1 Add workflow concurrency

Prevent obsolete CI runs from wasting resources or presenting stale feedback.

Use a workflow-scoped concurrency key conceptually equivalent to:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Use a correct current GitHub Actions expression.

Do not create a group name that collides with unrelated workflows.

## 8.2 Stable quality-gate identity

Consider adding one final lightweight aggregator job such as:

```text
quality-gate
```

that depends on:
- frontend quality;
- Python quality;
- repository integrity;
- security/dependency checks added by this execution.

The purpose is to expose one stable branch-protection status name.

Do not hide individual failures.

## 8.3 Action pinning

Audit every external `uses:` entry.

Prefer verified full-length commit SHA pinning.

Do not invent SHAs.

Resolve the official action's current trusted commit and pin it.

If the environment cannot verify an action SHA, do not guess; disclose the blocker.

## 8.4 Minimum permissions

Keep workflow token permissions at least privilege.

Do not add write permissions merely for convenience.

## 8.5 Do not make CI “green by skipping”

No:
- global `continue-on-error: true`;
- `|| true` around lint/tests/security;
- conditions that skip failing packages on `main`;
- path filters that prevent required checks from reporting.

---

# 9. Objective F — Dependency Security Closure

The latest observed `npm ci` reported high-severity vulnerabilities.

Do not treat the count alone as proof of exploitable product risk.

Do not ignore it either.

## 9.1 Capture exact audit evidence

From `mold/frontend/` run:

```bash
npm audit --json
npm audit
```

Record:
- advisory/package;
- severity;
- direct vs transitive;
- dependency path;
- production vs development;
- fix availability;
- whether remediation requires a breaking major update;
- actual use in Craft.

## 9.2 Remediation priority

Order:

1. eliminate vulnerable versions with non-breaking safe updates;
2. update direct dependencies when tests remain green;
3. refresh transitive versions through supported parent updates;
4. only consider major upgrades after tracing impact;
5. never use forced upgrades without understanding the resulting dependency graph.

## 9.3 High/critical completion rule

At the end:
- no unclassified high/critical advisory;
- no fixable high/critical advisory left unfixed;
- no production high/critical advisory left merely documented.

If an upstream dependency has no safe fix:
- prove the exact dependency path;
- prove whether it is reachable in production;
- document available mitigation;
- mark Execution 03 `PARTIALLY COMPLETE` or `BLOCKED`, not `COMPLETE`.

## 9.4 Add prevention, not only cleanup

Add `.github/dependabot.yml` for the actual package ecosystems that exist.

At minimum evaluate:
- npm in `/mold/frontend`;
- pip/Python in `/mold`;
- GitHub Actions at repository root.

Use a reasonable update cadence such as weekly unless repository evidence supports another cadence.

Do not add package ecosystems that do not exist.

## 9.5 Dependency review

Because the repository is public, evaluate adding GitHub's official dependency review action on pull requests.

Configure it to block newly introduced vulnerable dependencies at an appropriate severity threshold.

Prefer `high` or stricter unless current product policy requires otherwise.

If adding the action:
- pin to a verified full commit SHA;
- keep permissions minimal;
- ensure it runs on pull requests to `main`.

Dependency review prevents new debt.

It does not replace cleaning the current dependency baseline.

---

# 10. Objective G — Repair Agent Context Engineering

`CURRENT_HANDOFF.md` currently mixes durable architecture/workflow information with ephemeral local repository state.

That is unsafe for an agent-first repository.

## 10.1 Dynamic facts must come from Git

At the start of every agent task, live commands must determine:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git log -1 --oneline
```

Committed documentation must not pretend those are permanent truths.

## 10.2 Refactor or remove CURRENT_HANDOFF

Audit every reference to:

```text
docs/agent/CURRENT_HANDOFF.md
```

Choose one of two outcomes.

### Option A — keep it as durable handoff policy

Remove:
- current branch;
- current HEAD;
- claims about current uncommitted files;
- claims about local installed hooks as if universal;
- old task-specific “resume here” statements that no longer apply.

Keep only durable information that remains true across clones.

### Option B — remove it if redundant

If everything useful already belongs in:
- `PROJECT_MAP.md`;
- `ENGINEERING_LOOP.md`;
- `WORKFLOW_POLICY.md`;
- feature READMEs;

delete `CURRENT_HANDOFF.md` and update all reading-order references.

Prefer deletion over keeping a document whose purpose requires it to become stale.

## 10.3 Agent bootstrap contract

Update bootstrap docs only as necessary so that:

```text
stable docs explain architecture and rules
live Git commands explain current repository state
tests/CI explain current validation truth
```

Do not copy the same state paragraph into several files.

One fact should have one durable owner.

## 10.4 Prevent recurrence

Add the smallest practical guard.

Possible approaches:
- documentation policy + test;
- repository-integrity check for forbidden dynamic-state patterns in durable handoff docs;
- remove the dynamic handoff concept entirely.

Do not create a large documentation framework.

---

# 11. Objective H — Repository Hygiene / Context Pollution Removal

Coding agents search the entire repository.

Historical noise inside active source paths is therefore an engineering problem, not only tidiness.

## 11.1 Build an inventory

Audit at least:

```text
mold/.chapter10/
mold/.stage-work/
mold/a3-runtime-diff.txt
mold/viewport-appearance-typecheck.txt
**/*.bak
**/*.tmp
**/*.orig
**/*-diff.txt
**/*-typecheck.txt
```

Also inspect any other generated/review artifacts found.

For each item classify:

```text
active runtime
active test fixture
durable documentation
historical artifact
temporary/generated artifact
dead backup
unknown
```

No `unknown` may remain at closure.

## 11.2 Delete recoverable backup artifacts

If a `.bak` or diff snapshot is not an active test fixture or required input:
- delete it from the active tree;
- rely on Git history for recovery.

Do not move dead backups into another active source folder.

## 11.3 Archive only true durable history

If historical documents have ongoing value:
- place them under an explicit archive/documentation namespace;
- add a short archive README saying they are non-authoritative;
- ensure active code does not import from archive.

Do not archive temporary command output that Git history already preserves.

## 11.4 Ignore recurring temporary artifacts

Update `.gitignore` only after understanding which artifacts are genuinely temporary.

Do not ignore legitimate source by broad wildcard.

If an artifact is already tracked, remove it from tracking as part of the cleanup.

## 11.5 Protect agent search quality

The active code tree should not contain old alternate implementations with names that look authoritative.

At closure, a repository search for a production function should not routinely return:
- current implementation;
- `.bak` implementation;
- old diff snapshot;
- stage copy;
- abandoned duplicate.

---

# 12. Objective I — Resolve the Ambiguous `src/mold-generation` TypeScript Area

Project documentation currently reports a TypeScript mold-generation area under the otherwise-Python `mold/src/` tree whose relationship to the active frontend is unclear.

This ambiguity must end.

## 12.1 Trace actual usage

Search:
- imports;
- package/build configuration;
- tsconfig references;
- test references;
- generated artifacts;
- docs;
- CI;
- scripts.

Determine whether `mold/src/mold-generation/` is:
- actively compiled/used;
- a shared library;
- historical;
- experimental;
- dead.

## 12.2 Closure rule

If active:
- document exactly who imports it;
- document why it belongs under `mold/src/`;
- ensure it is actually covered by a build/test gate.

If not active:
- delete it if Git history is sufficient; or
- move only genuinely durable design documentation out of the source tree.

Do not leave ambiguous executable-looking code in `src/`.

No “maybe future” source directory may masquerade as active production code.

---

# 13. Objective J — Make Current Engine Ownership Explicit

Execution 03 must not attempt a rushed frontend↔Python integration.

Instead, resolve the current architecture ambiguity.

## 13.1 Current observed architecture

The repository currently contains two major logic domains.

### Browser/runtime domain

```text
mold/frontend/
```

including active interactive mold generation.

### Python core domain

```text
mold/src/mold_generator_engine/
```

including staged engineering/moldability/generation analysis.

Current project documentation says they are not runtime-connected.

That is acceptable as a current state only if ownership is explicit.

## 13.2 Create one authoritative boundary document

Create or update one durable architecture document, preferably under:

```text
mold/docs/architecture/
```

or reuse `PROJECT_MAP.md` if it is clearly the correct owner.

It must state:

```text
What runs in the browser today?
What runs in Python today?
What is contract-only?
What is not wired?
Which domain is authoritative for each current user-visible behavior?
What logic must not be duplicated across domains?
Where would a future bridge enter?
```

Do not include branch/HEAD/current-worktree metadata.

## 13.3 Source-of-truth matrix

Document at least:

```text
STL import/rendering
interactive viewport
reference mold geometry
Cut by Face
Cavity
Sprue
Registration
Segmentation
moldability analysis
pull-direction analysis
generation-readiness
Python mold-generation planning
frontend engine-integration contracts
```

For each, identify current owner.

If two implementations intentionally exist, state why and whether one is active, experimental, analysis-only, compatibility, or awaiting a future bridge.

No silent duplication.

## 13.4 No premature integration

Do not add:
- HTTP server;
- WebSocket;
- subprocess bridge;
- local service daemon;
- new backend framework;
- RPC protocol;

merely to “solve” architectural ambiguity.

A runtime bridge is a separate product/architecture phase.

Execution 03's job is to make current boundaries honest, not invent the future architecture under time pressure.

---

# 14. Objective K — Rewrite the Root README as a Real Repository Entry Point

Replace the current minimal/encoding-broken root README with a normal UTF-8 Markdown README.

It should answer, concisely:

```text
What is Craft?
What lives in mold/frontend?
What lives in mold/src?
What is actually runtime-connected today?
How do I run frontend development?
How do I run frontend verification?
How do I run Python verification?
Where are architecture docs?
Where are agent operating rules?
What is intentionally not implemented yet?
```

Do not duplicate low-level module documentation.

Link to durable docs.

Do not put dynamic branch/HEAD status in README.

Do not claim production readiness that CI/tests do not prove.

---

# 15. Objective L — Finish Segmentation Semantic Cleanup

Execution 02 removed the old product-mode architecture but some “draft” terminology may remain in active comments/tests.

Search for:

```text
draft session
segmentation draft
useDraftA
useDraftB
oneMold
OneMold
make-as-one-mold
moreMolds
MoreMolds
make-as-more-molds
Automatic More Molds
Manual More Molds
SegmentationModeStore
SegmentationModeSnapshot
useSegmentationModeStore
```

Classify every match.

Remove or rename obsolete semantic residue in:
- production identifiers;
- comments;
- active test names;
- fixtures;
- docs.

Do not change a generic term `draft` if it accurately describes an unrelated engineering concept such as draft angle.

Context matters.

---

# 16. Cross-System Regression Matrix

After changes, explicitly test these workflows.

## 16.1 Cut by Face

```text
model
→ Cut by Face
→ commit
→ Cavity
→ Sprue
→ Registration
```

Verify coherent current output.

## 16.2 Eraser / topology deletion

```text
committed Cut by Face
→ derived state exists
→ remove final topology input
```

Verify:
- no stale committed body;
- no stale Sprue resolved geometry;
- no stale Registration;
- no stale body visibility ownership;
- no stale selector fallback.

## 16.3 Mold Scale

```text
Cut by Face
→ Cavity
→ Sprue
→ Mold Scale
```

Verify:
- base mold changes;
- topology-dependent outputs invalidate;
- preserved intent is pending;
- no stale async completion mutates post-scale state.

## 16.4 Segmentation

```text
model
→ Segmentation
→ accept
→ execute
→ commit
→ Cavity
→ Sprue
```

Verify current behavior preserved.

## 16.5 Segmentation replacement while Sprue evaluation is active

Mandatory race regression.

## 16.6 Segmentation Mold Scale regeneration

```text
Segmentation committed
→ Cavity
→ Sprue
→ Mold Scale
→ Segmentation regeneration in-flight
```

Verify:
- Cavity unavailable/blocked while required;
- old resolved Sprue does not reappear;
- late old rejection does not mark current state failed;
- fresh topology remains authoritative.

## 16.7 Undo / Redo

At least one topology-changing path with Sprue state.

Undo must restore a coherent snapshot, not a hybrid of old geometry and new validation state.

Redo must restore the matching later snapshot.

---

# 17. CI / Security Regression Matrix

## 17.1 Local frontend

```bash
cd mold/frontend
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:run
```

## 17.2 Local Python

```bash
cd mold
python -m pip install -e ".[dev]"
ruff check .
ruff format --check .
pytest
```

## 17.3 Repository

```bash
cd <repo-root>
git diff --check
git status --short
```

## 17.4 Security

```bash
cd mold/frontend
npm audit
npm audit --json
```

## 17.5 Agent documentation

Verify:
- no stale dynamic repo-state claims;
- reading order is coherent;
- README is UTF-8 and renders normally;
- architecture boundary document is internally consistent;
- active-vs-archive distinction is clear.

---

# 18. GitHub Actions Closure

If the user authorizes a push after implementation, inspect the actual remote workflow run.

Do not claim remote CI success from local tests.

Record:
- run URL/ID;
- commit SHA;
- each job result;
- whether build/tests actually ran;
- dependency/security result.

If no push is authorized, report:

```text
Remote CI verification: NOT RUN — awaiting user-authorized push
```

This is a verification state, not permission to push.

---

# 19. No-Technical-Debt Rules for This Execution

The phrase “no technical debt” in this execution means:

1. do not leave the known async race unfixed;
2. do not leave the known local quality failures unfixed;
3. do not disable quality rules to hide failures;
4. do not leave unclassified high/critical dependency risk;
5. do not leave stale agent context as authoritative;
6. do not leave dead backup code next to production code;
7. do not leave an ambiguous executable source tree unclassified;
8. do not add duplicate freshness/commit systems when an existing one can be generalized;
9. do not add a frontend↔Python integration framework before its architecture is designed;
10. do not create compatibility layers for removed One Mold/More Molds semantics;
11. do not preserve temporary files because deleting them feels risky when Git history already exists;
12. do not mark TODOs as closure for issues that are in scope now;
13. do not convert a proven defect into a “known limitation” to reach `COMPLETE`;
14. do not add large new abstractions without multiple proven consumers;
15. do not rewrite working product behavior while fixing quality/style-only failures.

Future features are not technical debt merely because they are not implemented.

Ambiguous current ownership is technical debt.

Explicitly bounded future integration is not.

---

# 20. Research-Informed Engineering Constraints

Apply these principles during implementation:

## 20.1 Async cancellation

Cancellation and freshness are complementary.

An abort/cancel signal may stop or reject async work, but stale completion must still be prevented from mutating newer authoritative state.

Treat cancellation reason as lifecycle information, not automatically as a current product failure.

## 20.2 CI concurrency

Cancel obsolete in-progress runs for the same workflow/ref so developers do not wait on feedback for superseded commits.

## 20.3 Dependency review

Prevent newly-introduced vulnerable dependencies at PR time.

Do not rely on dependency review to clean the current baseline.

## 20.4 Dependabot

Use automated update PRs to reduce future dependency drift.

Do not auto-merge blindly.

## 20.5 GitHub Actions supply-chain security

Prefer immutable action references pinned to verified full commit SHAs.

Keep workflow token permissions minimal.

## 20.6 Ruff

Use Ruff's configured linter/formatter as the source of truth.

`ruff format --check` is a verification gate; do not replace it with a weaker style check.

---

# 21. Implementation Order

Follow this order unless repository evidence proves a dependency requires a different sequence.

## Phase 0 — Evidence freeze

Record repo state and current failures. Do not edit yet.

## Phase 1 — Characterization

Add failing tests for stale Sprue rejection and topology replacement race.

## Phase 2 — Async state repair

Fix the root commit-identity invariant. Run focused tests.

## Phase 3 — Sprue semantic closure

Only if characterization proves presentation contract remains behaviorally ambiguous.

## Phase 4 — Frontend quality closure

Fix lint/type issues, then build/tests.

## Phase 5 — Python quality closure

Fix Ruff/format issues, then pytest.

## Phase 6 — Security baseline

Audit npm dependency graph, apply safe remediations, rerun full frontend regression.

## Phase 7 — CI hardening

Add concurrency, stable gate, dependency prevention, action pinning as justified.

## Phase 8 — Agent context repair

Remove dynamic committed state and repair bootstrap docs.

## Phase 9 — Repository hygiene

Delete/relocate proven artifacts. Classify `src/mold-generation`.

## Phase 10 — Architecture boundary

Write one durable ownership/source-of-truth document.

## Phase 11 — Root README

Create the truthful entry point after architecture facts are settled.

## Phase 12 — Semantic sweep

Remove stale Segmentation product-mode terminology.

## Phase 13 — Full verification

Run every gate from fresh/clean state.

## Phase 14 — Diff audit

Inspect the entire diff for scope creep, rule weakening, unused abstractions, generated files, secrets, stale comments, and new TODO debt.

---

# 22. Forbidden Shortcuts

Do not:

```text
disable ESLint rules
disable Ruff rules
add continue-on-error
append || true
skip tests on main
skip build because typecheck passed
hide npm audit output
use npm audit fix --force without analysis
convert all any to unknown as any
use ts-ignore as bulk repair
swallow every Worker error
treat every cancellation as success
treat every cancellation as failure
terminate all workers as the only correctness mechanism
delete user intent only to avoid lifecycle design
preserve stale resolved geometry for convenience
create a second Sprue store
create a second freshness system
create a new backend service
add HTTP/WebSocket just to connect frontend/Python
keep .bak code “for safety”
keep stale branch/SHA docs “for reference”
copy the same architecture truth into multiple competing documents
```

---

# 23. Expected Files to Inspect

This is a navigation aid, not an exhaustive allowlist.

Inspect at least:

```text
.github/workflows/ci.yml
README.md
mold/pyproject.toml
mold/.gitignore
mold/docs/agent/PROJECT_MAP.md
mold/docs/agent/CURRENT_HANDOFF.md
mold/docs/agent/ENGINEERING_LOOP.md
mold/docs/agent/WORKFLOW_POLICY.md
AGENTS.md / mold/AGENTS.md as applicable
CLAUDE.md / mold/CLAUDE.md as applicable

mold/frontend/package.json
mold/frontend/package-lock.json

mold/frontend/src/features/mold-generation/split-face/splitFace.store.ts
mold/frontend/src/features/mold-generation/workflow/moldEvaluationCoordinator.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.workerClient.ts
mold/frontend/src/features/mold-generation/workflow/derivedMoldEvaluation.worker.ts
mold/frontend/src/features/mold-generation/workflow/*
mold/frontend/src/features/mold-generation/sprue-generation/*
mold/frontend/src/features/mold-generation/registration/*
mold/frontend/src/features/mold-generation/segmentation/*
mold/frontend/src/features/mold-generation/cavity-generation/*
mold/frontend/src/features/viewport/*
```

Also inspect all current tests around those modules, `mold/src/mold-generation/`, repository artifacts listed earlier, `*.bak` files, dependency manifests, and GitHub Actions references.

---

# 24. Focused Semantic Grep Gate

At the end, search active production/test/docs scope for obsolete product semantics:

```text
oneMold
OneMold
make-as-one-mold
moreMolds
MoreMolds
make-as-more-molds
Automatic More Molds
Manual More Molds
SegmentationModeStore
SegmentationModeSnapshot
useSegmentationModeStore
```

Also search for context-debt markers:

```text
Branch:
HEAD:
uncommitted right now
current working tree
```

Do not blindly require zero matches across historical execution documents or Git history.

The requirement applies to active authoritative docs/code where terms are obsolete or misleading.

Search for backup/artifact patterns:

```text
*.bak
*.orig
*.tmp
*-diff.txt
*-typecheck.txt
.stage-work
```

Every active-tree match must be classified.

---

# 25. Acceptance Tests — Product State

Execution 03 must contain automated regression evidence for all feasible items:

1. stale Sprue success discarded;
2. stale Sprue rejection discarded;
3. current Sprue failure still surfaces;
4. cancellation does not poison newer request state;
5. Segmentation replacement invalidates resolved Sprue geometry;
6. preserved Sprue intent becomes pending;
7. Mold Scale invalidates topology-dependent Sprue state;
8. Segmentation regeneration cannot accept stale worker completion;
9. Cut by Face final-plane removal remains stale-body-safe;
10. Undo/Redo restores coherent topology + Sprue state;
11. selector cannot surface stale committed mold result;
12. pending Sprue cannot masquerade as resolved geometry.

Use the lowest-level test that actually proves the invariant.

---

# 26. Acceptance Tests — Quality / Repository

Required closure:

```text
Frontend typecheck: PASS
Frontend lint: PASS
Frontend build: PASS
Frontend tests: PASS

Python Ruff check: PASS
Python Ruff format check: PASS
Python pytest: PASS

git diff --check: PASS
```

Security:

```text
High/critical npm advisories:
0 unclassified
0 safely-fixable left unfixed
0 production high/critical accepted silently
```

Context:

```text
No stale dynamic repo-state claims in authoritative agent docs
```

Repository:

```text
No unclassified active backup/stage artifacts
No ambiguous src/mold-generation ownership
Root README valid UTF-8 and truthful
```

---

# 27. Remote Branch Protection / Repository Settings

Repository settings are outside ordinary tracked code.

Do not change them without explicit authorization.

However, the final report should recommend the exact required status check name if the repository owner wants to configure a ruleset.

If a stable aggregator job was added, report its exact check name.

Recommended repository-owner follow-up after the workflow is green:
- require the stable quality gate before merging to `main`;
- require dependency review if added;
- keep secret scanning/push protection enabled;
- consider requiring actions to be pinned to full commit SHAs.

Do not claim these settings are active unless verified.

---

# 28. Final Diff Audit

Before final reporting:

```bash
git diff --check
git status --short
git diff --stat
git diff
```

Review every changed file.

Ask:

```text
Did this file need to change?
Did we weaken a rule?
Did we add a wrapper instead of deleting debt?
Did we preserve product behavior?
Did we accidentally reintroduce One Mold/More Molds semantics?
Did we add a new source-of-truth document that duplicates another?
Did we create a new TODO?
Did we leave a debug artifact?
Did we add a dependency without security review?
Did we add a broad cast?
Did we add a stale branch/SHA claim?
```

No unexplained changes.

---

# 29. Final Report Format

Return exactly these sections.

## 1. Decision

One of:

```text
COMPLETE
PARTIALLY COMPLETE
BLOCKED
```

Do not use `COMPLETE` if an in-scope known defect remains.

## 2. Repository State

Report branch, HEAD, working tree state at start, and working tree state at finish.

## 3. Async State Integrity

Report reproduced stale failure path, root cause, repair, success/failure/progress/cancellation guards, and tests.

## 4. Sprue Integrity

Report intent vs resolved geometry behavior, topology replacement, Mold Scale, Undo/Redo, and presentation semantics.

## 5. Frontend Quality

Report exact results for:

```text
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:run
```

## 6. Python Quality

Report exact results for:

```text
ruff check .
ruff format --check .
pytest
```

## 7. Dependency Security

Report before audit counts, advisories remediated, dependency changes, remaining high/critical issues, and why any remaining issue blocks completion.

## 8. CI Hardening

Report concurrency, action pinning, dependency review, Dependabot, stable quality-gate check name, and workflow permissions.

Only report what was actually implemented.

## 9. Context Engineering

Report what happened to `CURRENT_HANDOFF.md`, which docs are authoritative now, how live Git state is discovered, and recurrence prevention.

## 10. Repository Hygiene

Report deleted artifacts, archived durable history, `.gitignore` changes, and `.bak` cleanup.

## 11. Architecture Ownership

Report browser runtime owner, Python owner, engine-integration status, `src/mold-generation` classification, and source-of-truth document.

## 12. Semantic Cleanup

Report obsolete Segmentation terms removed and legitimate remaining matches.

## 13. Files Changed

Group by subsystem.

## 14. Regression Matrix

Report product workflow tests run and results.

## 15. Remote Verification

One of:

```text
GitHub CI: PASS at <sha/run>
GitHub CI: FAIL at <sha/run> — <reason>
GitHub CI: NOT RUN — no authorized push
```

## 16. Remaining Risks

For `COMPLETE`, this section should contain no known in-scope technical debt.

Future feature work may be listed separately as non-debt future scope.

## 17. Deleted-Code / Debt Confirmation

Explicitly state whether:
- dead backup code remains;
- stale agent-state docs remain;
- red quality gates remain;
- unclassified high/critical dependency risk remains;
- ambiguous executable source areas remain.

---

# 30. Completion Standard

The standard is not:

```text
"tests related to my patch pass"
```

The standard is:

```text
Craft now has a trustworthy green baseline.
```

The standard is not:

```text
"the old async result probably cannot win"
```

The standard is:

```text
every async mutation path that matters proves it still owns current state before it writes.
```

The standard is not:

```text
"README says there are two engines"
```

The standard is:

```text
every current engine/source area has explicit ownership and no ambiguous active status.
```

The standard is not:

```text
"we know npm has vulnerabilities but they are probably dev-only"
```

The standard is:

```text
the dependency graph was inspected, high/critical issues were remediated or execution is not marked complete.
```

The standard is not:

```text
"CURRENT_HANDOFF was accurate once"
```

The standard is:

```text
committed docs contain durable truths; live Git provides live state.
```

Execution 03 ends only when the repository can be trusted by:
- the user;
- CI;
- the next coding agent;
- the next refactor;
- and the next feature phase.

No hidden red gate.

No stale worker write.

No stale repository truth.

No ambiguous active code.

No silently accepted high-risk dependency.

No compatibility debris from deleted product modes.
