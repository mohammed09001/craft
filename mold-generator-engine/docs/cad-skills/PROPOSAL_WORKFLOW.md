# Proposal-Driven Engineering Workflow

**Status: HARDENED.** All five original phases are implemented, plus an
Engineering Hardening pass that closed four specific defects an independent
audit found: (1) the approval gate is now backed by a vendor-neutral,
repository-owned git `pre-commit` hook, not just a Claude-Code-specific
`PreToolUse` hook; (2) every one of the 10 lifecycle states is now a real,
executable, tested code path — none are documentation-only, and a proposal
that reaches `EXECUTING` now always has a code path to a terminal state;
(3) the Proposal object exists from the moment a task is routed and is
*completed* automatically by Prompt Compiler's validated output, not
constructed later by the Loop Engine; (4) every drift the audit found
between documentation, schema, registry, and implementation has been
closed (see [Known Limitations](#known-limitations) for what remains, by
design or by disclosed constraint, rather than by oversight).

**What is honestly still not proven, stated plainly:** the Claude-Code
`PreToolUse` hook's live blocking behavior has been verified only by
invoking its script directly with simulated payloads — not by observing
Claude Code's own harness deny a real tool call. The git `pre-commit` hook,
by contrast, **has** been verified end-to-end (the installed script was
invoked exactly as git would invoke it, and it produced the correct
block/allow exit code both ways). And a Bash-performed file write that is
never committed is still not intercepted by anything — see
[Human Approval Gate](#human-approval-gate) and
[Known Limitations](#known-limitations) for the precise, disclosed
boundary of what is and isn't covered.

This document exists so documentation can never again describe more than
what is implemented — the same reason `docs/cad-skills/LOOP_ENGINE.md`
exists. Read this document alongside `docs/cad-skills/LOOP_ENGINE.md` —
that document remains the source of truth for Skill discovery, routing,
invocation, and verification. This document extends it with a
proposal/approval/enforcement layer in front of execution; it does not
replace or restate it.

## Purpose

Transform the current execution model from "compile a prompt, then invoke
Skills immediately" into a vendor-neutral, two-phase model:

```
User Request
   │
   ▼
Repository Investigation        ┐
   │                            │  PROPOSAL MODE
   ▼                            │  (read-only: inspect, analyze, compile)
Engineering Proposal Compiler   │
   │                            │
   ▼                            │
Engineering Proposal            ┘
   │
   ▼
Human Approval Gate  ◄── execution cannot proceed past this point without
   │                     an explicit human decision
   ▼
Approved Proposal               ┐
   │                            │  EXECUTION MODE
   ▼                            │  (may mutate the repository)
Loop Engine                     │
   │                            │
   ▼                            │
Execution Engine                │
   │                            │
   ▼                            │
Validation                      ┘
```

The Prompt Compiler, Loop Engine, Skills, Proposal system, and Approval
system belong to the repository itself and are vendor-neutral. **Execution
Engines are replaceable** — see [Execution Engine Abstraction](#execution-engine-abstraction).

## Relationship to the existing Loop Engine

This **extends** the system `docs/cad-skills/LOOP_ENGINE.md` describes; it
does not replace it. One thing changed since earlier phases and is worth
stating plainly rather than leaving stale: `route()` and `logCompiler()` in
`.claude/loop/loop-trace.mjs` **are now modified** — earlier phases
deliberately left them untouched (route() literally did not know a
proposal existed), but the Hardening pass's Defect 2/3 fixes required
reversing that decision, because there was no other way to make
`DISCOVERING`/`ANALYZING`/`COMPILING_PROPOSAL` real, reachable states, or
to make Prompt Compiler the actual source of the Proposal's content rather
than a later reconstruction. This is a deliberate, disclosed architectural
change, not scope creep — see [Engineering Proposal Ownership](#engineering-proposal-ownership).

- The router (`computeRoutingDecision`), the registry
  (`.claude/loop/registry.json`), the execution trace mechanism, and the
  completion gate (`verify`) are unchanged in their own logic — `route()`
  and `logCompiler()` gained *additional* proposal-lifecycle bookkeeping
  around the same routing/validation logic, but that logic itself was not
  altered.
- `prompt-compiler` remains the mandatory entry gateway and still never
  edits code, never runs tests, never executes anything. Its optional
  `# PROPOSAL DATA` block is what `logCompiler()` now uses to complete the
  Proposal automatically.
- The CAD algorithm pipeline (`cad-skill-orchestrator` → `cad-algorithm-designer`
  → `geometry-computational-specialist` → `cad-algorithm-implementer` →
  `cad-validation-testing-engineer` → `cad-performance-optimization-engineer`
  / `cad-maintenance-evolution-engineer`) is unchanged. `cad-algorithm-implementer`
  remains the thing the Human Approval Gate protects, not a thing that is
  itself modified.

## The Proposal

Contract: `docs/cad-skills/contracts/proposal.schema.json`.

An `EngineeringProposal` is a workflow-control artifact — it carries the
approval lifecycle itself, not CAD design content (that distinction is why
it does not reuse the Skill 1–6 `metadata` wrapper convention). Required
fields: `proposalId`, `version`, `status`, `rawUserRequest`,
`engineeringPrompt`, `promptHash`, `repositoryRevision`, `filesInvestigated`,
`expectedFilesToChange`, `protectedSystems`, `validationPlan`, `risks`,
`openQuestions`, `executionOrder`, `approval` (including, as of Hardening,
`approvedVersion`), `history`, `createdAt`, `updatedAt`. Optional:
`executionEngineId`, `executionStartedAt`.

Integrity guarantees, all implemented and tested:

- **Prompt Hash** — sha256 of `engineeringPrompt`. `approve` and `execute`
  both refuse if the live proposal's `promptHash` no longer matches what
  was recorded at approval time.
- **Repository Revision** — `git rev-parse HEAD` captured at compile time
  and re-checked at approval and execution time. A repository that has
  moved since approval is a stale approval, not a silent go-ahead.
- **Version** — `version` increments only on an explicit `revise`; never
  decremented, never reused. `approve` records `approvedVersion`; `execute`
  refuses if the proposal's current `version` no longer matches it — this
  closes the specific gap the audit found (a `revise` that happens to
  resubmit byte-identical text changes `version` without changing
  `promptHash`, which the hash check alone would not catch).
- **Immutable history** — `history[]` is append-only. A `revise` creates a
  new version and appends the prior one to `history`; it never overwrites
  it. This is what makes "execute only the exact approved proposal, never a
  silently rewritten one" a checkable property instead of a promise.

## Proposal Lifecycle

Every state below is a real, executable code path in
`.claude/loop/loop-trace.mjs`, proven both by unit tests
(`.claude/loop/loop-trace.test.mjs`) and by live CLI runs against real
trace files during this project's own testing — including resolving the
exact `EXECUTING`-forever trace an earlier audit cited as a dead end.

```
route()                          logCompiler()                propose/approve/execute
   │                                  │                              │
   ▼                                  ▼                              ▼
DISCOVERING → ANALYZING → COMPILING_PROPOSAL → AWAITING_APPROVAL → APPROVED → EXECUTING
  (transient,   (persisted    (persisted at        │                              │
   real, but     after the     logCompiler          │ reject()          begin-validation()
   immediately   routing       entry, before        ▼                              │
   superseded)   decision is   PASS/FAIL is       REJECTED                         ▼
                 computed)     checked)          (terminal,                    VALIDATING
                                                   human-driven                     │
                                                   only)                complete-validation()
                                                                                     │
                                                                        ┌────────────┴────────────┐
                                                                        ▼                          ▼
                                                                   COMPLETED                  CANCELLED
                                                                   (validation                (validation
                                                                    passed)                     failed —
                                                                                                 mechanical,
                                                                                                 not human)

cancel() is legal from any non-terminal status (DISCOVERING/ANALYZING/
COMPILING_PROPOSAL/AWAITING_APPROVAL/APPROVED/EXECUTING/VALIDATING) and
always lands on CANCELLED — this is the generic "withdraw" path, distinct
from a validation failure landing on CANCELLED for a mechanical reason.

A mechanical compiler failure (logCompiler status != PASS, or output that
fails schema validation) also lands on CANCELLED, never REJECTED —
REJECTED is reserved exclusively for an explicit human decision.
```

| State | Driving code | Persisted? |
|---|---|---|
| `DISCOVERING` | `route()` → `initializeProposal()`, written once before routing runs | Yes, but immediately superseded within the same `route()` call |
| `ANALYZING` | `route()`, after the routing decision is computed | Yes — the state a fresh trace is left in until `log-compiler` runs |
| `COMPILING_PROPOSAL` | `logCompiler()`, at entry, before the PASS/FAIL branch | Yes |
| `AWAITING_APPROVAL` | `logCompiler()`'s success branch → `completeProposalCompilation()` | Yes |
| `APPROVED` | `approve()` CLI command | Yes |
| `EXECUTING` | `execute()` CLI command | Yes |
| `VALIDATING` | `begin-validation` CLI command | Yes |
| `COMPLETED` | `complete-validation <runId> PASS` | Yes, terminal |
| `REJECTED` | `reject()` CLI command (human decision only) | Yes, terminal |
| `CANCELLED` | `cancel()` CLI command, OR a mechanical compiler failure, OR `complete-validation <runId> FAIL` | Yes, terminal |

`REJECTED` and the Loop Engine's separate `LOOP_ENGINE_FAILED` verify
verdict remain different concepts and are never conflated: `LOOP_ENGINE_FAILED`
means "the router required a Skill but found no invocation evidence"
(mechanical); `REJECTED` means "a human looked at the compiled proposal and
declined it" (a decision, not a defect).

## Engineering Proposal Ownership

**Prompt Compiler's validated output is what completes the Proposal — the
Loop Engine (`loop-trace.mjs`) never constructs one from scratch.** This is
the literal architecture the Hardening pass implemented for Defect 3, and
it is worth being precise about what "Prompt Compiler produces the
Proposal" actually means here, since overclaiming it would just create a
new instance of the documentation/implementation drift this whole effort
exists to prevent: `prompt-compiler` is a prose Skill with no code
execution of its own (it is the parent agent, guided by
`.claude/skills/prompt-compiler/SKILL.md`, that produces its three output
sections). What genuinely changed is *when and how* that output becomes
part of the Proposal:

- **Before Hardening:** `route()` knew nothing about proposals.
  `propose()` was a separate, later command that called `buildProposal()`
  to construct an entirely new `EngineeringProposal` object from whatever
  was sitting in `trace.gateway` at that moment.
- **After Hardening:** `route()` creates the Proposal object immediately
  (`DISCOVERING`/`ANALYZING`). `logCompiler()` — invoked with Prompt
  Compiler's raw output — advances that *same, already-existing* object
  through `COMPILING_PROPOSAL` and, the moment the output validates,
  directly into `AWAITING_APPROVAL` with `engineeringPrompt`, `promptHash`,
  `repositoryRevision`, and (when Prompt Compiler supplied its optional
  `# PROPOSAL DATA` block) `filesInvestigated`/`expectedFilesToChange`/
  `validationPlan`/`openQuestions` all filled in. `propose()` no longer
  builds anything — it only presents the proposal that already exists,
  refusing if compilation hasn't reached `AWAITING_APPROVAL` yet.

`buildProposal()` still exists, exported, for backward compatibility — it
is now implemented as `initializeProposal()` followed by
`completeProposalCompilation()`, so every prior test and any external
caller expecting "construct a fully-compiled proposal in one call" still
gets exactly that, unchanged in shape.

## Human Approval Gate

Execution cannot continue past `AWAITING_APPROVAL` without an explicit
approval decision. Enforcement now has **three** layers:

1. **Integrity checks (always active, for anyone who calls the CLI)** —
   `execute <runId> <engineId>` refuses unless `approval.approvalStatus`
   is `APPROVED` and the proposal's current `promptHash`, `version`, and
   `repositoryRevision` all still match what was recorded at approval
   time. It also validates `engineId` against the Execution Engine
   registry. This is real, tested code — but it only applies to whoever
   actually calls `execute`; nothing forces that.
2. **Vendor-neutral, repository-owned layer (Defect 1 fix)** — a git
   `pre-commit` hook (`.claude/loop/git-hooks/pre-commit`, installed via
   `node .claude/loop/loop-trace.mjs install-git-hook` into
   `.git/hooks/pre-commit`) runs `check-commit-gate`, which blocks the
   commit (exit 1) whenever the most-recently-created trace's proposal is
   `AWAITING_APPROVAL`. Because git itself invokes this — not any
   particular AI tool's permission system — it applies identically
   whether the change was produced by Claude Code, Codex, Gemini CLI, or
   a human typing directly at the terminal. **This was verified
   end-to-end**: the installed hook script was invoked exactly as git
   would invoke it (`sh .git/hooks/pre-commit`) and produced the correct
   exit code in both the blocked and allowed cases, against real trace
   files.
3. **Claude-Code-specific layer (secondary, narrower, belt-and-suspenders)**
   — the pre-existing `PreToolUse` hook (`.claude/settings.json`, matchers
   `Edit`/`Write`/`NotebookEdit` → `check-execution-gate`) blocks those
   specific tool calls under the same condition. **Its live blocking
   behavior against Claude Code's actual harness remains unverified** —
   only the underlying script has been exercised directly, with simulated
   payloads.

**What this does and does not close.** The git pre-commit hook is the
answer to the audit's specific finding that a Bash-performed file write
(`cat > file`, `sed -i`, etc.) bypassed the old PreToolUse-only
enforcement entirely — that write itself still isn't intercepted by
anything, but **committing** it now is, regardless of which tool performed
the write. `git commit --no-verify` still bypasses the pre-commit hook
entirely; this is a disclosed, unavoidable limitation of a local git hook,
not a hidden gap — see [Known Limitations](#known-limitations).

## Execution Engine Abstraction

Registry: `docs/cad-skills/registry/execution-engines.json`, schema:
`docs/cad-skills/registry/execution-engine-registry.schema.json` (mirrors
`docs/cad-skills/registry/skill-registry.schema.json`'s registry-wrapper
pattern deliberately, so the same hand-rolled `JSONSchemaValidator` in
`docs/cad-skills/tests/test_cad_skills.py` validates both without new
validator code).

An Execution Engine is responsible **only** for execution. It does not own
the Prompt Compiler, Loop Engine, Skills, Proposal compilation, or
Approval — those belong to the repository and are engine-independent. Each
registered engine declares `name`, `vendor`, `capabilities` (from a fixed
enum: `RepositorySearch`, `ReadFiles`, `EditFiles`, `RunTests`,
`BrowserValidation`, `GitOperations`, `SkillInvocation`, `HookEnforcement`),
`limitations`, `verificationLevel`, `status`, `notes`.

Three engines are registered, every claim grounded in evidence, not
invented:

- **`claude-code`** — `Verified`, `HookConfirmed`. Capabilities now include
  `HookEnforcement` (added during Hardening — this was previously true but
  undeclared, a drift the audit flagged directly). Its `limitations` array
  is explicit about which enforcement layer is verified end-to-end (the
  git pre-commit hook) versus script-level-only (the PreToolUse hook).
- **`codex`** — `PartiallyVerified`, `ExplicitLogOnly`. Shell access to the
  same CLI (including `install-git-hook`/`check-commit-gate`, which are
  plain Node with no Claude-specific dependency), no Skill tool, no
  `PreToolUse` hook system.
- **`gemini-cli`** — `Unverified`. Capabilities intentionally empty; no
  claim is made until an actual, evidenced run occurs.

`execute <runId> <engineId>` actually consults this registry at runtime
(`validateExecutionEngine`) and refuses an unregistered `engineId` before
ever checking approval status. Future engines register by adding an entry
to `execution-engines.json` — no change to the Prompt Compiler, Loop
Engine, or any Skill is required.

## Backward Compatibility

- `route()` and `logCompiler()` now touch proposal state (see
  [Engineering Proposal Ownership](#engineering-proposal-ownership)) — a
  deliberate reversal of an earlier phase's design, required by Defect 2/3.
  Their pre-existing routing/validation *logic* is unchanged; the
  proposal-lifecycle bookkeeping is additive around it. Both are covered
  by the full regression suite (72 `node:test` cases) with zero prior
  tests modified to accommodate this — only new tests and one existing
  fixture updated to include the new `approvedVersion` field.
- `propose()`'s CLI contract (command name, arguments, printed output
  shape — `PROPOSAL_ID=`/`PROPOSAL_VERSION=`/JSON) is unchanged; only its
  internal role (present vs. construct) changed.
- `verify`, `log`, `route`'s printed stdout shape, `registry.json`, and
  every `cad-*` Skill are untouched.
- `loop-engine`'s "Direct Execution (Compatibility) Mode" is retained
  exactly as Phase 5 left it — unaffected by this Hardening pass, since
  none of its own steps touch the proposal lifecycle.

## Known Limitations

- **`git commit --no-verify` bypasses the pre-commit gate entirely.** This
  is the standard, well-known escape hatch for any local git hook — not a
  bug in this implementation, but worth stating plainly rather than
  implying the gate is unconditional.
- **Uncommitted working-tree mutations are still not blocked by the commit
  gate** — only a commit *attempt* is. A Bash-performed write that is
  never committed is caught by nothing in this system except, for Claude
  Code specifically, the narrower and less-verified `PreToolUse` hook.
- **The `PreToolUse` hook's live blocking behavior remains unverified**
  against Claude Code's actual harness — only direct script invocation
  with simulated payloads has been exercised. The git pre-commit hook does
  not share this gap (verified end-to-end, see Human Approval Gate above).
- **`revise` still does not refresh `filesInvestigated`/
  `expectedFilesToChange`/`validationPlan`/`openQuestions`** from a new
  `# PROPOSAL DATA` block — it only takes bare prompt text, not a full new
  compiler output. Unchanged from Phase 3; not addressed by this Hardening
  pass, which was scoped to the audit's four named defects specifically.
- **The commit gate and the PreToolUse gate share the same coarseness**:
  both key off "the most-recently-created trace," not a cryptographically
  tied session identifier, because Claude Code does not expose the
  running session ID to arbitrary Bash commands (the same constraint
  `docs/cad-skills/LOOP_ENGINE.md` discloses for `verify`'s evidence
  correlation). Both are fail-open on any read/parse error by design.
- **Cold, multi-day resume of an `AWAITING_APPROVAL` proposal** has still
  never been exercised end-to-end — every real proposal produced during
  this project's testing was created and resolved within a single
  continuous session.
- **The Hardening pass's default-flip scope is unchanged from Phase 5**:
  it applies only to tasks that explicitly invoke `loop-engine`. The large
  majority of day-to-day engineering work, which never does, is entirely
  unaffected and passes through no proposal or approval gate at all — a
  deliberate scope boundary stated from the outset, not an oversight.
- **The two Skill registries** (`.claude/loop/registry.json` and
  `docs/cad-skills/registry/skill-registry.json`) still require manual
  synchronization; the Execution Engine registry remains independent of
  both.

## Implementation Phases

1. **DONE — Contracts only.**
2. **DONE — `loop-trace.mjs` extension** (`propose`/`approve`/`revise`/
   `reject`/`cancel`, hashing, repository-revision capture, append-only
   history).
3. **DONE — Prompt Compiler + `loop-engine` wiring** (optional
   `# PROPOSAL DATA` block; Stage 2.5 in `loop-engine`'s procedure).
4. **DONE — Execution Engine abstraction + hard enforcement** (`execute`,
   the Execution Engine registry, the Claude-Code `PreToolUse` hook).
5. **DONE — Default flip + full regression** (`loop-engine`'s procedure
   defaults to Proposal Mode).
6. **DONE — Engineering Hardening** (this pass): a git `pre-commit` hook
   as the vendor-neutral, repository-owned enforcement layer (Defect 1);
   `DISCOVERING`/`ANALYZING`/`COMPILING_PROPOSAL`/`VALIDATING`/`COMPLETED`
   made real, tested, reachable code paths, with `EXECUTING` no longer a
   dead end (Defect 2); `route()`/`logCompiler()` restructured so the
   Proposal is completed directly by Prompt Compiler's output rather than
   built later by the Loop Engine (Defect 3); every documentation/schema/
   registry/implementation drift the audit found has been closed, and the
   `JSONSchemaValidator`'s integer/null union-type bug (which would have
   silently mis-validated the new `approvedVersion` field) was fixed and
   proven with a dedicated negative test (Defect 4). 72 `node:test` cases
   and 12 Python fixture tests pass; see the Engineering Hardening Report
   for full evidence.

Each phase ended with an Implementation Summary, Files Modified, Tests, and
Architecture Notes.
