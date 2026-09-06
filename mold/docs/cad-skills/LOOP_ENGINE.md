# Loop Engine — Skill Orchestration Architecture

This document is the source of truth for how Skill discovery, routing,
invocation, and verification actually work in this repository. It exists
because a prior version of this repository had documentation (this same
`docs/cad-skills/` directory) that *described* a "Loop Engine" without any
of it being wired to anything Claude Code actually executes — a task that
explicitly asked for Loop Engine usage invoked zero Skills as a result.
This document distinguishes native Claude Code behavior, this
repository's own orchestration code, and conceptual/aspirational
description, so that distinction can never blur again.

## What the Loop Engine is

A small, repository-local, version-controlled system that makes Skill
invocation **provable**, not just claimed:

- `.claude/loop/registry.json` — the canonical list of every real Skill
  in this repository (skill ID, path, description, capabilities, trigger
  keywords, dependencies, contracts).
- `.claude/loop/loop-trace.mjs` — a zero-dependency Node script that
  routes a task to the right Skill(s) deterministically, records an
  execution trace, and verifies afterward whether invocation genuinely
  happened.
- A `PostToolUse` hook in `.claude/settings.json` that fires every time
  the `Skill` tool is used and appends a harness-generated (not
  self-reported) record to `.claude/loop/traces/auto-log.jsonl`.
- The `loop-engine` Skill (`.claude/skills/loop-engine/SKILL.md`) — the
  explicit entry point that ties the above together.

## What the Loop Engine is NOT

- It is **not** a replacement for Claude Code's native Skill discovery.
  Native automatic invocation (the model deciding on its own to call the
  `Skill` tool because a Skill's frontmatter `description` matches the
  task) genuinely works in this repository — this was independently
  verified (see "Evidence this was tested for real" below). The Loop
  Engine adds a way to *prove* that happened, and a guaranteed path for
  when a user wants certainty rather than best-effort.
- It is **not** `docs/agent/WORKFLOW_POLICY.md`'s Decision Matrix, and
  does not replace it. That matrix governs ordinary engineering-loop
  stage routing (Explorer, Geometry Auditor, Diff Reviewer, `mold-test`,
  `mold-commit-ready`, `mold-handoff`, `mold-cad-engineering`,
  `mold-interactive-cad-ux`) and still applies on its own terms. The Loop
  Engine additionally covers the CAD algorithm pipeline (`cad-*` Skills),
  which that matrix does not, and offers itself to any task that
  explicitly wants provable orchestration.
- It is **not** `docs/cad-skills/registry/`, `contracts/`, or
  `tests/test_cad_skills.py`. Those define the CAD pipeline's data
  shapes and validate that those shapes are internally consistent — they
  never call Claude Code's `Skill` tool and are not evidence that a Skill
  ran. Do not cite `test_cad_skills.py` passing as evidence of Skill
  invocation; it never was such evidence.
- It does **not** make a Skill invoke another Skill programmatically.
  Claude Code has no such mechanism, and `docs/agent/WORKFLOW_POLICY.md`
  states this as a deliberate rule: only the parent agent invokes Skills.
  The Loop Engine instead makes the parent agent's own compliance
  auditable after the fact.

## Invocation Mode: Hybrid

Native automatic invocation (Mode A) is real but not, by itself,
provable within a single turn without extra scaffolding — a model
claiming "I invoked Skill X" is not evidence Skill X ran. Pure explicit
orchestration (Mode B) would work but throws away native discovery, which
already works well for narrowly-described Skills. This repository uses
**Hybrid**: native discovery still functions for any Skill with a proper
frontmatter `description`, and the `loop-engine` Skill adds a
deterministic router plus a harness-verified execution trace and
completion gate for when invocation must be provable, not just claimed.

## Entry point

```
/loop-engine <task description>
```

or ask in natural language for the Loop Engine / Skill orchestration
explicitly. `loop-engine`'s own frontmatter description is deliberately
narrow (it does not fire on ordinary engineering requests) — see
`.claude/skills/loop-engine/SKILL.md` for its exact trigger conditions
and the step-by-step procedure it follows.

For ordinary engineering work that doesn't specifically ask for
orchestration proof, keep using `docs/agent/WORKFLOW_POLICY.md`'s
Decision Matrix as before — nothing about that has changed.

**As of Phase 5 of the Proposal-Driven Workflow, invoking `/loop-engine`
itself defaults to a human-approval-gated procedure** (investigate →
compile a proposal → stop for approval → execute only what was approved),
with the previously-described ungated behavior retained as an explicit
"Direct Execution (Compatibility) Mode." This document's description of
routing, invocation, and verification above is unchanged either way — the
default flip is a procedural change in `.claude/skills/loop-engine/SKILL.md`
only. See `docs/cad-skills/PROPOSAL_WORKFLOW.md` for the full architecture.

## Routing process

`node .claude/loop/loop-trace.mjs route "<task text>"`:

1. Lowercases the task text and scores every registered Skill by how many
   of its `triggerKeywords` appear as substrings (multi-word keywords
   score higher than single generic words).
2. Any Skill with a nonzero score is a direct match.
3. Expands the selection to include each matched Skill's `dependencies`
   (transitively), so a task that only names a downstream pipeline step
   still pulls in its prerequisites.
4. Orders the final set by `executionPriority` ascending.
5. If nothing matched, the decision is `matched: false` and
   `selectedSkills: []` — the router never fabricates a selection.
6. Writes a new trace file to `.claude/loop/traces/<runId>.json` and
   prints the `runId` plus the routing decision.

This is deterministic and has no dependency on model judgment — the same
task text always produces the same routing decision.

## Skill lifecycle

1. **Register**: add an entry to `.claude/loop/registry.json` (skillId,
   path, description, capabilities, acceptedTaskTypes, triggerKeywords,
   contracts, dependencies, executionPriority).
2. **Author**: write `.claude/skills/<skillId>/SKILL.md` with YAML
   frontmatter (`name` matching the directory, a `description` containing
   a clear trigger condition) — a Skill with no frontmatter is
   effectively undiscoverable by native auto-suggestion (see "Known prior
   defect" below).
3. **Route**: `loop-engine` (or native auto-suggestion) selects it.
4. **Invoke**: the parent agent calls the `Skill` tool with that
   `skillId`.
5. **Record**: the `PostToolUse` hook auto-logs the invocation; the
   invoking agent also calls `loop-trace.mjs log <runId> <skillId>
   <PASS|FAIL> "<note>"` with the outcome.
6. **Verify**: `loop-trace.mjs verify <runId>` cross-checks required
   Skills against both the hook's auto-log and any explicit `log` calls.
7. **Retire**: remove the Skill directory and its registry entry when no
   longer needed (this is exactly how the three temporary
   `loop-diag-*` fixtures used to build and test this system were
   removed once real, permanent evidence — the trace files and the
   `loop-trace.test.mjs` regression suite — existed in their place).

## Contract flow

Skills that have `inputContract`/`outputContract` set in the registry
point at the JSON Schemas in `docs/cad-skills/contracts/` (the CAD
pipeline Skills only — `mold-*` Skills carry `null` here and define their
own inputs/outputs in prose inside their own `SKILL.md`, which is
sufficient for their narrower, single-purpose procedures). A Skill
invoked through `loop-engine` should be given the relevant contract's
shape as part of its task input when one is registered.

The parent agent owns artifact handoff. It records each accepted output as an
immutable `LoopArtifactEnvelope` under `.claude/loop/artifacts/<runId>/`, resolves
the next `executionOrder.inputSource`, and passes exact artifact references
alongside the authoritative task prompt. The zero-dependency implementation is
`.claude/loop/artifact-handoff.mjs`; its contract is
`docs/cad-skills/contracts/loop-artifact-envelope.schema.json`.

Use `record-artifact <runId> <artifact-envelope-json-path>` to persist an output,
then use `handoff-artifacts <runId> <consumerSkillId>
<artifactId@revision,...>` before invoking the consumer. Records are append-only:
an existing revision cannot be overwritten, revisions cannot skip, and the
content hash covers identity, dependency snapshots, and payload. Every handoff
revalidates accepted status, hash integrity, required artifact types, and the
latest revision of the complete dependency chain.

A missing, stale, rejected, or invalid artifact blocks the dependent step.
Trace files retain artifact IDs, revisions, hashes, producers, handoffs, and
blocked events, but never duplicate artifact payloads and are not the artifact
store.

For segmentation, the order is design, geometry strategy, general segmentation
planning, any project-specific pre-implementation stability gate,
implementation, and post-execution validation. Planning-only requests stop
after an accepted segmentation plan and do not select implementation. The
planning handoff requires accepted Algorithm and Geometry Strategy
Specifications, a project-owned Production Constraint Profile and Segmentation
Policy, and a recorded `SegmentationPlanningRequest` that snapshots all four.
The request identifies opaque, externally owned candidate-strategy sources;
the General Segmentation Engine evaluates and selects their candidate
representations but does not define their engineering methods. The accepted
plan depends on that exact request, so recursive freshness invalidates the plan
when any upstream input changes. The
`execute` command fails closed when a routed segmentation implementation lacks a
fresh accepted `SegmentationPlanSpecification` or when the plan is
`NOT_REQUIRED`/`BLOCKED`. Successful proposal completion also requires an
accepted, fresh `ValidationSuiteReport` from the validation Skill. Therefore,
after proposal approval, segmentation planning and stability analysis run
before `execute`; `execute` authorizes the geometry-modifying implementation
only after the implementer handoff has been recorded and revalidated.

## Execution trace location

`.claude/loop/traces/<runId>.json` — one file per `route` call, containing
`taskText`, the routing `decision`, every `log`ged `invocation`, artifact
lifecycle identity/hand-off evidence, and the final `verify` verdict.
`.claude/loop/traces/auto-log.jsonl` is the
append-only, hook-generated ground truth of every real `Skill` tool
invocation in this repository, independent of any specific run.

## Failure behavior

`verify` prints `LOOP_ENGINE_FAILED` (and writes that verdict into the
trace file) whenever a Skill the router said was required has no
invocation evidence — from the hook or from an explicit `log` call — in
the run's time window. `loop-engine`'s procedure requires reporting this
verdict verbatim rather than describing the task as complete. A Skill
that logs an explicit `FAIL` outcome may be retried once (matching
`docs/agent/ENGINEERING_LOOP.md`'s correction bound); a second failure
must be reported honestly, not silently absorbed.

## How to add a Skill

1. Create `.claude/skills/<skillId>/SKILL.md` with YAML frontmatter
   (`name`, `description` with a clear, ideally literal trigger phrase).
2. Add a matching entry to `.claude/loop/registry.json`.
3. If it's part of the CAD pipeline, also add it to
   `docs/cad-skills/registry/skill-registry.json` and give it a
   `docs/cad-skills/contracts/*.schema.json` file, following the existing
   Skills 0–6 pattern.
4. Run `node --test .claude/loop/loop-trace.test.mjs` to confirm the
   registry is still structurally valid.

## How to test a Skill

- Route a task text that should select it:
  `node .claude/loop/loop-trace.mjs route "<task text that matches its triggerKeywords>"`
  and confirm it appears in `selectedSkills`.
- Invoke it for real via the `Skill` tool.
- Run `node .claude/loop/loop-trace.mjs verify <runId>` and confirm
  `LOOP_ENGINE_PASS`.

## How to verify a Skill was genuinely invoked

Never trust a model's self-report ("I invoked Skill X") on its own.
Concrete evidence, in order of strength:

1. `verify <runId>`'s `confirmedByHook: true` — the harness itself
   recorded the invocation via the `PostToolUse` hook, independent of
   anything the agent claims.
2. Directly grepping the session transcript
   (`~/.claude/projects/<sanitized-cwd>/<session-id>.jsonl`) for
   `"type":"tool_use","name":"Skill"` entries with the matching
   `input.skill` — this is what the hook payload's `transcript_path`
   points at, and what `confirmedByHook` evidence is ultimately backed
   by.
3. `confirmedByExplicitLog: true` alone (an agent-called `log` with no
   hook confirmation) is weaker — it is self-reported and only present as
   a fallback for environments where the hook can't run.

## Evidence this was tested for real

During the repair that produced this document, the full pipeline was
exercised with real Skill invocations, not simulated: a single-skill run,
a multi-skill sequential run with correct dependency ordering, a
forced-failure-then-retry run, an unrouted/unknown-task run that
correctly refused to fabricate a Skill selection, and a deliberate
bypass-attempt run (routed but never invoked) that correctly produced
`LOOP_ENGINE_FAILED`. Native automatic invocation was independently
tested by spawning a fresh subagent with no routing instructions at all —
it decided on its own to call the `Skill` tool based purely on a
diagnostic Skill's frontmatter trigger phrase, and the hook captured that
invocation under a distinct session ID. See the session's final report
and `.claude/loop/traces/` for the concrete run IDs and evidence.

## Known prior defect (fixed)

Three Skills (`mold-test`, `mold-commit-ready`, `mold-handoff`)
previously had no YAML frontmatter at all, which meant they had no
`description` for native auto-suggestion to match against. This has been
fixed — see their `SKILL.md` files.

## Compatibility

- **Claude Code**: fully supported. Uses the `Skill` tool and the
  `PostToolUse` hook mechanism natively.
- **Codex**: Codex has no Skill or hook system (`AGENTS.md`'s Codex
  adapter is deliberately thinner than Claude Code's). Codex can still
  use this Loop Engine's deterministic half directly — running
  `node .claude/loop/loop-trace.mjs route/log/verify` via its own shell
  access — but it must call `log` manually after doing the routed work
  itself, since there is no `Skill` tool or `PostToolUse` hook to
  auto-capture invocation the way Claude Code's does. This is disclosed
  as a real, not fully closed, gap: Codex's evidence is necessarily
  self-reported (`confirmedByExplicitLog`), not hook-confirmed.
- **Antigravity**: **untested and unverified.** Nothing in this
  repository has been run against Antigravity. Do not assume
  compatibility — the JSON contracts and schemas under
  `docs/cad-skills/contracts/` are plain data and should be readable by
  any tool, but `.claude/loop/`'s hook mechanism and the `Skill` tool
  itself are Claude-Code-specific and have no known Antigravity
  equivalent as of this writing.

## Remaining limitations

- Correlating a `route` call to the hook's `auto-log.jsonl` entries uses
  a time-window + working-directory match, not a cryptographic or
  otherwise unforgeable session identifier passed to the Bash tool
  invoking `route`/`log`/`verify` — Claude Code does not expose the
  running session ID to arbitrary Bash commands. In practice this is
  reliable for a single interactive session working on one task at a
  time, but it is not airtight under concurrent Loop Engine runs in the
  same repository at the same time.
- The completion gate (`verify`) is not currently enforced by a `Stop`
  hook that would block the agent from ending its turn without running
  it — `loop-engine`'s procedure requires the agent to run and honor
  `verify` by instruction, not by a hard runtime block. A `Stop` hook
  enforcing this is a possible future strengthening, deliberately not
  built now to keep the framework's footprint small, per this task's own
  scope-discipline instructions.
- `.claude/loop/registry.json` and
  `docs/cad-skills/registry/skill-registry.json` must be kept in sync by
  hand when a `cad-*` Skill's identity changes — they are not
  auto-derived from each other.
