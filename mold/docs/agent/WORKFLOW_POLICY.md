# Workflow Policy

**Claude Code's adapter to `docs/agent/ENGINEERING_LOOP.md`.** The loop
defines the universal stage sequence, decisions, correction bounds,
escalation triggers, and stop conditions; this document maps those stages
onto Claude Code's actual Skills and Subagents. It does not redefine the
loop's retry, escalation, or stop rules — see that document for those. This
is not architecture, not a handoff, and not a Skill or Subagent itself —
see [Relationship to Other Documents](#relationship-to-other-documents) for
where that content actually lives.

## Purpose

Give the parent agent a consistent, low-friction decision procedure for
choosing between direct work and invoking a specialist (Skill or Subagent),
so specialist use is deliberate rather than reflexive.

## Guiding Principle

The parent agent owns orchestration. Skills and Subagents never invoke each
other autonomously — only the parent agent decides whether a specialist is
needed, in what order specialists run, and when the workflow ends.

## General Rules

- Start with the smallest investigation necessary; do not survey the whole
  repository when the task names a specific file or symptom.
- Avoid unnecessary specialists — a specialist earns its cost in accuracy or
  context isolation, not habit.
- Never invoke multiple specialists when one is sufficient.
- Do not re-invoke the same specialist without new evidence to give it.
- Stop gathering evidence once it's sufficient to act; more investigation
  is not automatically more correct.
- Implementation (writing or editing code) always remains the parent
  agent's responsibility — no Skill or Subagent in this repository edits
  files.

## Decision Matrix

`✓` = normally used · `~` = only if the specific condition below applies ·
`—` = not applicable to this task type.

| Task Type | Typical Loop Risk | Explorer | Geometry Auditor | Diff Reviewer | mold-test | mold-commit-ready | mold-handoff | mold-cad-engineering | mold-interactive-cad-ux |
|---|---|---|---|---|---|---|---|---|---|
| New feature | STANDARD | ✓ | ~ geometry involved | ✓ | ✓ | ✓ | ~ session-ending | ~ CAD-facing | ~ new interaction |
| Bug fix | STANDARD | ✓ | ~ geometry/runtime symptom | ✓ | ✓ | ✓ | ~ session-ending | ~ CAD-facing | ~ interaction-facing |
| Geometry/runtime bug | HIGH | ✓ | ✓ | ✓ | ✓ | ✓ | ~ session-ending | ✓ | ~ interaction affected |
| UI-only change | STANDARD | ~ if location unclear | — | ✓ | ✓ (targeted) | ✓ | ~ session-ending | — | ~ direct manipulation involved |
| Documentation-only | LOW | — | — | ~ if substantial | — | ✓ | ~ session-ending | — | — |
| Refactor | STANDARD or HIGH | ✓ | ~ geometry involved | ✓ | ✓ | ✓ | ~ session-ending | ~ CAD-facing | ~ interaction-facing |
| Investigation (no edit) | — | ✓ | ~ geometry question | — | — | — | — | — | — |
| Code review request | — | — | ~ geometry involved | ✓ | — | — | — | ~ geometry involved | ~ interaction involved |
| Release preparation | HIGH | — | — | ~ final pass | ✓ (broader) | ✓ | ✓ | — | — |

"Typical Loop Risk" is a default per `docs/agent/ENGINEERING_LOOP.md`'s
three risk levels — actual blast radius and uncertainty can move a task up
or down a level; this column is a starting point, not an override.
"Session-ending" means: invoke `mold-handoff` when the working state changes
enough that a fresh agent resuming later would need it — not after every
task. See [Escalation Rules](#escalation-rules).

## Standard Pipelines

Default ordering: when both `mold-test` and Diff Reviewer are used for a
task, `mold-test` runs first, so Diff Reviewer can assess whether current
validation supports the change's claimed confidence and flag anything still
missing. This applies to every task type below, including UI-only changes
and refactors, which have no separate diagram but follow the same shape as
Bug. A parent agent may run Diff Reviewer earlier as a deliberate
intermediate diagnostic pass, but a final Diff Reviewer pass after
`mold-test` is still required — an early diagnostic pass does not satisfy
that requirement. See `docs/agent/ENGINEERING_LOOP.md`'s Correction Rules
for how many such cycles are permitted; this document only fixes the
ordering, not the retry bound.

**Feature**
```
User → Explorer → (Geometry Auditor only if needed) → Implementation
     → mold-test → Diff Reviewer → mold-commit-ready → (mold-handoff if session ends)
```

**Bug**
```
User → Explorer → Implementation → mold-test → Diff Reviewer → mold-commit-ready
```

**Geometry/runtime bug**
```
User → Explorer → Geometry Auditor → Implementation
     → mold-test → Diff Reviewer → mold-commit-ready
```

**Documentation-only**
```
User → Implementation (direct edit, parent agent) → Diff Reviewer (if substantial)
     → mold-commit-ready → (mold-handoff if session ends)
```

**Investigation**
```
User → Explorer → Report
```
No implementation step. If the question is geometry-specific, use Geometry
Auditor instead of or alongside Explorer.

**Release preparation**
```
User → mold-test (broader regression) → Diff Reviewer (final pass)
     → mold-commit-ready → mold-handoff
```

## Escalation Rules

- **Explorer is sufficient** when the task is locating code, tracing
  ownership, or answering "where/what" — no correctness judgment required.
- **Geometry Auditor becomes necessary** when the task involves coordinate
  transforms, Three.js runtime ownership, Boolean/geometry validity, or a
  visual/geometric symptom whose cause isn't already known — not for
  ordinary UI, state, or non-geometric logic changes.
- **mold-cad-engineering becomes necessary** whenever a change is
  CAD-facing — it touches geometry, coordinate spaces, tolerance, topology,
  runtime ownership, tool lifecycle, or workflow staleness/invalidation.
  Mandatory for geometry/runtime bugs; conditional elsewhere on whether the
  change is actually CAD-facing. Not needed for pure UI layout, styling, or
  non-geometric logic. Its review depth scales with the Engineering Loop's
  risk level (the Skill's own "When This Skill Applies" section defines
  this) — do not request a full section-by-section review for a LOW-risk
  change.
- **mold-interactive-cad-ux becomes necessary** whenever a change adds or
  alters direct manipulation, viewport interaction, or how a user reaches a
  CAD capability — not for a change that is purely internal/engineering
  with no interaction surface, and not for plain layout or styling that
  involves no direct manipulation. Its review depth scales the same way.
- **Interconnected Systems Stability Engineer becomes necessary** when a
  task's INVESTIGATE stage shows it touches more than one interconnected
  system (viewport runtime, tool/keyboard lifecycle, mold-generation
  pipeline stages, cross-store state ownership) or is HIGH risk per
  `docs/agent/ENGINEERING_LOOP.md` — not for a narrow, already-understood,
  single-store change. It is investigation-only: see
  `docs/agent-skills/interconnected-systems-stability/SKILL.md` for its
  full procedure. Run it before Implementation, after Explorer/Geometry
  Auditor have established the relevant facts.
- **Diff Reviewer may be skipped** for a trivial, single-line, low-risk
  change the parent agent is confident in, or for documentation edits that
  don't affect behavior.
- **mold-test may be skipped** only for documentation/config-only changes
  with no behavioral effect — never for a source change.
- **mold-handoff should run** when the working state changes enough that
  resuming cold would otherwise require re-deriving it — not after every
  trivial edit or conversational question.
- **mold-commit-ready should run** before presenting any completed code
  change to the user for commit approval.
- **When a commit-readiness request has no current validation evidence**,
  choose one of two outcomes: if testing is permitted and materially
  required, run the appropriate `mold-test` workflow before
  `mold-commit-ready`; if testing is outside the requested scope,
  unavailable, or explicitly forbidden, `mold-commit-ready` must report the
  missing evidence and return a conditional or not-ready outcome rather
  than assuming success. `mold-commit-ready` never executes tests itself.

**Review is not readiness.** Diff Reviewer evaluates correctness,
architecture, integration, regressions, geometry/runtime risk, and missing
validation. `mold-commit-ready` evaluates whether the completed work has
sufficient evidence and clean enough Git state to be presented as ready to
commit. Commit readiness does not replace correctness review, and a
correctness review does not automatically establish commit readiness — a
change can pass Diff Reviewer and still be not ready (e.g. missing
validation), or need both before being presented to the user. (This is
Claude's application of the loop's REVIEW/READINESS stage distinction —
see `docs/agent/ENGINEERING_LOOP.md`.)

Do not invent mandatory steps where they add no value — the matrix and
pipelines above are the ceiling, not a floor every task must fully climb.

## Workflow Termination

Stop conditions are defined once, universally, in
`docs/agent/ENGINEERING_LOOP.md`'s Successful and Blocked Stops. In
Claude's terms: the REPORT stage is reached once Explorer/Geometry
Auditor's investigation answered the question, `mold-test` validated the
change, Diff Reviewer returned a verdict with any required follow-up done,
and `mold-commit-ready` returned a readiness decision — whichever of these
apply to the task. Do not keep invoking specialists after a stopping
condition is met "to be thorough" — that produces churn, not additional
confidence.

## Anti-patterns

- Invoking every specialist automatically regardless of task type.
- Running Diff Reviewer before implementation exists to review.
- Running `mold-test` on a documentation-only edit with no behavioral
  change.
- Invoking Geometry Auditor for non-geometric work (state bugs, layout
  changes, report-registry edits) just because the repository has a
  geometry pipeline.
- Writing a durable handoff/state document after a trivial conversational
  question that changed nothing in the working tree.
- Re-running the same specialist a second time on the same evidence,
  hoping for a different answer.

## Relationship to Other Documents

- **`docs/agent/ENGINEERING_LOOP.md`** — the universal stage sequence,
  decisions, correction bounds, escalation triggers, and stop conditions
  this document adapts to Claude's Skills and Subagents. This document
  never redefines those rules, only maps them.
- **CLAUDE.md** — the bootstrap entry point; tells the parent agent what to
  read and when, before this policy is ever consulted.
- **AGENTS.md** — the operating rules (safety, scope, testing philosophy,
  Git rules) that apply regardless of which specialist is or isn't used.
- **PROJECT_MAP.md** — architecture and navigation; Explorer and Geometry
  Auditor both start from it rather than scanning the repository.
- Dynamic repository state (current branch, HEAD, working-tree status) is
  never committed as a durable document — discover it live from Git at the
  start of every task instead.
- **Skills** (`mold-test`, `mold-commit-ready`, `mold-handoff`,
  `mold-cad-engineering`, `mold-interactive-cad-ux`) — own their own
  procedures in full; this policy only decides when each runs. All five
  now carry YAML frontmatter (`name`/`description`), so the `Skill` tool
  can auto-suggest any of them by description match. Auto-suggestion
  supplements this Decision Matrix; it does not replace it — the parent
  agent still decides whether a specialist is warranted for the task at
  hand.
- **The CAD algorithm pipeline** (`cad-skill-orchestrator`,
  `cad-algorithm-designer`, `geometry-computational-specialist`,
  `general-segmentation-engine`,
  `cad-algorithm-implementer`, `cad-validation-testing-engineer`,
  `cad-performance-optimization-engineer`,
  `cad-maintenance-evolution-engineer`) is a separate, linear
  design→geometry→implementation→validation→optimization→maintenance
  pipeline for CAD algorithm work specifically — a different granularity
  than this Decision Matrix's task-type/stage mapping, so it is
  intentionally not merged into the matrix above. It is registered in
  `.claude/loop/registry.json` and reached through the `loop-engine`
  Skill (`/loop-engine <task>`), which routes, invokes, and produces a
  verifiable execution trace. As of Phase 5 of the Proposal-Driven
  Workflow, `/loop-engine <task>` defaults to a human-approval-gated
  procedure (compile a proposal, stop for approval, execute only what was
  approved) rather than invoking Skills immediately — see
  `docs/cad-skills/LOOP_ENGINE.md` and
  `docs/cad-skills/PROPOSAL_WORKFLOW.md`. This default applies only to
  tasks that explicitly invoke `loop-engine`; it does not change this
  Decision Matrix's own routing for ordinary tasks that never do.
- **Subagents** (`codebase-explorer`, `geometry-auditor`, `diff-reviewer`)
  — own their own investigation scope and output format; this policy only
  decides when each is invoked and in what order.
