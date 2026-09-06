# Mold Engineering Loop v1

Tool-agnostic execution engine for engineering work in this repository.
Claude Code and Codex both enter this same process through lightweight,
tool-specific adapters — there is one loop, not two. This document defines
*what happens and in what order*; it does not define *how* any given step
is carried out mechanically, and it does not restate operating rules that
`AGENTS.md` already owns (safety, scope, testing commands, Product/UI and
Geometry/Runtime principles) — read this alongside `AGENTS.md`, not instead
of it.

## Purpose

Guarantee that the same engineering task, handed to either coding agent
available in this repository, moves through the same reasoning shape —
intake, orientation, investigation, decision, implementation, validation,
review, readiness, recording, reporting — and produces the same kind of
accountable, evidence-backed result, regardless of which tool is driving.

## Boundaries

The loop owns the **decision process**: which stages run, in what order,
when to retry, when to escalate, when to stop. It does not own:

- **Execution mechanics** — how investigation, validation, or review are
  actually performed. That is an adapter concern (see
  [Adapter Boundary](#adapter-boundary)).
- **The code edit itself** — always performed directly by the active agent.
  No stage, and no mechanism fulfilling one, edits files on the loop's
  behalf.
- **Repository safety and permissions** — owned by `AGENTS.md` and each
  tool's own permission system (`.claude/settings.json` for Claude Code).
  The loop must respect these; it never reimplements them.
- **Git write operations** — the loop never stages, commits, or pushes.
  Any Git-write-capable stage still requires explicit user authorization
  per `AGENTS.md` Safety and Git Rules.
- **Product or UX negotiation with the user** — when something is
  genuinely ambiguous, the loop escalates outward; it doesn't decide.

## Task Contract

INTAKE normalizes every request into a lightweight, implicit contract — not
a file, not a template to fill out, just the set of things that must be
known before work starts safely. It may come directly from the user's
prompt.

| Field | Notes |
|---|---|
| Objective | What outcome is wanted |
| Expected behavior / output | What "done" looks like |
| Scope | What's in and out of bounds |
| Constraints | Anything explicitly restricting the approach |
| Protected work | Existing uncommitted work that must not be touched |
| Completion criteria | How the agent will know it's finished |
| Decisions already made | Don't re-litigate these |
| Unresolved blocking decisions | See below |

Do not stop for minor ambiguity resolvable from repository evidence or
established convention (`PROJECT_MAP.md`, existing patterns). Stop only
when a missing product, UX, safety, or architectural decision would make
correct implementation impossible without guessing.

## Task Classification

Every task is one of a small set of shapes: **feature, bug,
geometry/runtime bug, UI-only change, documentation-only, refactor,
investigation, review-only, release preparation.** These are the same shapes
`docs/agent/WORKFLOW_POLICY.md` uses for Claude Code's Skill/Subagent
mapping — the loop doesn't redefine them, it uses them (plus risk level) to
select stages.

## Risk Levels

One loop, three risk levels — never three separate loop implementations.
Risk reflects actual blast radius and uncertainty, not the task's label.

### LOW
Small documentation corrections, text changes, limited CSS corrections,
obvious test-expectation fixes, other narrow no-architecture changes.
```
INTAKE → concise ORIENT → IMPLEMENT → appropriate VALIDATE → concise REVIEW → REPORT
```
READINESS may be skipped for non-implementation or trivial documentation work.

### STANDARD
A contained feature, an ordinary bug fix, a UI interaction, a known store/
runtime integration, a limited multi-file change.
```
INTAKE → ORIENT → INVESTIGATE → PLAN → IMPLEMENT → VALIDATE → REVIEW
       → READINESS → RECORD [if justified] → REPORT
```
DESIGN runs only if the task contains an unresolved product, UX,
architecture, or ownership decision.

### HIGH
Geometry, Boolean operations, coordinate transforms, cavity generation,
segmentation, partitioning, architectural change, cross-boundary state
ownership, significant runtime lifecycle behavior, broad regression risk.
```
INTAKE → ORIENT → INVESTIGATE → DESIGN → PLAN → IMPLEMENT
       → multi-level VALIDATE → specialized REVIEW → READINESS → RECORD → REPORT
```

## Stage Contracts

```
INTAKE → ORIENT → INVESTIGATE → DESIGN[cond] → PLAN → IMPLEMENT
       → VALIDATE → REVIEW → READINESS[cond] → RECORD[cond] → REPORT
```
`REPORT` always runs, including when the task is blocked or fails. Not
every task runs every other stage — see Risk Levels above.

**INTAKE** — build the Task Contract; classify the task; assign a risk
level; select candidate stages; detect blocking ambiguity (see Task
Contract above for the stop threshold).

**ORIENT** — read only the durable, task-relevant context needed to work
safely (typically `AGENTS.md`, `PROJECT_MAP.md`, the active adapter) plus live
Git state (`git branch --show-current`, `git rev-parse HEAD`,
`git status --short`) for whatever is actually true right now. Do not load all
documentation blindly; do not reread unchanged context without a reason.

**INVESTIGATE** — determine the narrowest relevant implementation path:
ownership, relevant files, state/runtime flow, integration boundaries,
existing tests, conventions, risks, protected overlaps. Skippable only when
ownership and required scope are already known with sufficient evidence.
Must not expand into unrelated repository exploration.

**DESIGN** *(conditional)* — run when the task requires a new or changed
decision involving UX behavior, user interaction, architecture, state or
runtime ownership, geometry, coordinate spaces, mesh/Boolean operations,
tolerances, data contracts, cross-boundary integration, or multiple
credible implementation approaches. Skip for straightforward, local,
well-specified changes that introduce no new decision. Must resolve the
relevant decision before IMPLEMENT; for high-risk changes, implementation
must not silently pick among materially different options that need user
approval.

**PLAN** — a concise plan covering files/ownership areas likely to change,
the intended integration path, validation strategy, and major risks.
Proportional to the task — no ceremonial plans for trivial work.

**IMPLEMENT** — the active agent performs the smallest complete and correct
change: preserve unrelated behavior, respect current architecture, avoid
parallel state ownership, avoid unrelated refactors or speculative cleanup,
stay inside the Task Contract, preserve protected work, update tests when
justified. The loop coordinates this stage; it never acts as an
independent editor.

**VALIDATE** — select validation by affected scope and risk, not habit
(static/formatting, targeted unit tests, affected integration tests,
typecheck, lint, broader regression, geometry/runtime-specific checks —
concrete commands are an adapter/Skill concern, e.g. `mold-test` in
Claude's adapter). Never claim a check passed unless it was executed
successfully. A skipped check must be disclosed with its reason. Separate
new failures from known unrelated ones.

**REVIEW** — review the actual resulting diff, after justified validation
evidence exists, for correctness, Task Contract compliance, architecture,
state ownership, integration, regression risk, unnecessary scope, missing
tests, disposal/lifecycle risk, geometry/runtime correctness when
relevant, and unrelated or accidental file changes. Require a specialized
review mechanism for high-risk geometry/runtime tasks when the active
adapter provides one. **Review is not commit readiness** — see READINESS.

**READINESS** *(conditional)* — for implementation-bearing tasks once
sufficient validation and review evidence exists. Verdicts: `Ready`,
`Ready with disclosed limitations`, `Not ready`. Never implies a commit was
created; no Git write operation occurs without explicit user
authorization.

**RECORD** *(conditional)* — only when completed or blocked work creates
durable information a cold-resumed session would need: completed
architectural state, unfinished work, exact blockers, validated decisions,
remaining risks, the precise next step. Ask internally: *did this task
reveal durable knowledge future sessions need?* Application tasks must
never automatically redesign the engineering framework itself — a possible
framework improvement may be *reported* as a recommendation, but changing
framework rules, Skills, or Subagents requires a separate, explicit task.

**REPORT** — always runs; see [Reporting Contract](#reporting-contract).

## Correction Rules

Bounded, evidence-based correction only — never speculative, never "to be
thorough." A repeated stage requires new evidence or a materially changed
input.

**Validation correction**: on a VALIDATE failure — diagnose the exact
cause, correct within the original scope, rerun affected validation. At
most **two** validation correction cycles, and a cycle is only permitted
when new concrete evidence exists, the cause is sufficiently understood,
the correction stays inside the Task Contract, and continuing doesn't
endanger protected or unrelated work. After the bound is exhausted: stop,
mark `Not ready` or `Blocked`, run REPORT.

**Review correction**: on a REVIEW blocking finding — one bounded
correction, rerun affected validation, one final REVIEW. Only **one**
post-review correction cycle. If a blocker remains, stop as `Not ready`.
Never build an indefinite review → fix → review → fix loop.

## Escalation Rules

Escalation means **surface the exact issue to the user and stop** — never
"try a different approach autonomously" or "explore unrelated code to
resolve it speculatively." Trigger on:

- a retry bound reached without resolution
- ownership/location cannot be established safely
- a product or UX decision is materially ambiguous
- architectural alternatives require user approval
- required validation cannot run because of the environment
- the objective conflicts with a repository safety rule
- protected or unrelated work would be endangered by continuing
- the requested outcome cannot be proven correct within available evidence
- the task would require uncontrolled scope expansion

## Successful and Blocked Stops

An implementation-bearing task stops **successfully** only when: the
requested behavior is complete, scope stayed controlled, justified
validation executed, no blocking review finding remains, no unsupported
success claim is made, and REPORT ran.

`Ready with disclosed limitations` is allowed when the affected scope is
validated, a broader check is unavailable or has a proven unrelated
failure, the limitation is explicitly disclosed, and it doesn't invalidate
the implemented behavior.

A **blocked** stop happens whenever an Escalation Rule fires or a
Correction Rule bound is exhausted — REPORT still runs, honestly.

## Adapter Boundary

The loop defines stages and their contracts; adapters decide what fulfills
each one.

- **Claude Code adapter** = `docs/agent/WORKFLOW_POLICY.md`. It maps task
  type and risk level onto Claude's actual Skills (`mold-test` →
  VALIDATE, `mold-commit-ready` → READINESS, `mold-handoff` → RECORD) and
  Subagents (`codebase-explorer` → INVESTIGATE, `geometry-auditor` →
  specialized INVESTIGATE/REVIEW, `diff-reviewer` → REVIEW). These names
  belong entirely to that adapter — nothing above this line depends on
  them existing.
- **Codex adapter** = `AGENTS.md`, read directly. Codex has no formal
  Skill/Subagent system, so its adapter is thinner: it fulfills stages
  through direct repository inspection, direct command execution, and
  direct diff review, using Codex-compatible Skills or agents if and when
  any exist. It still walks the same stages, honors the same decision
  points, correction bounds, escalation triggers, and stop conditions, and
  produces evidence in the same [Reporting Contract](#reporting-contract)
  shape — a thinner mechanism, not a different process.
- **Future adapters** plug in the same way: map the eleven stage contracts
  onto whatever mechanisms that tool has. The loop's stage list, ordering,
  and rules do not change when an adapter's underlying mechanisms do.

## Reporting Contract

REPORT always produces a structured result containing:

1. Task Contract summary
2. Task classification
3. Risk level
4. Stages executed
5. Stages skipped and why
6. Adapter mechanisms used
7. Files changed
8. Behavior or documentation implemented
9. Validation executed
10. Exact results
11. Review findings
12. Readiness verdict, when applicable
13. Remaining limitations, risks, or blockers
14. Git status summary
15. Recommended next action

Never conceal a failure. Never describe incomplete work as complete.
