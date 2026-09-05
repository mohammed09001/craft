# Interconnected Systems Stability Engineer — Overview

This directory holds the **one canonical, vendor-neutral copy** of the
Interconnected Systems Stability Engineer skill. See `SKILL.md` for the
actual procedure — this file is meta-documentation only and must never
carry procedural content that belongs in `SKILL.md`.

## What this is

A pre-implementation investigation gate for the Mold Generator SaaS
frontend, aimed specifically at systemic integration regressions: a change
to one tool or runtime path (e.g. orientation/Flip) unexpectedly breaking
another (e.g. the mold-generation document, or Create Mold). It produces a
pre-implementation impact and stability report and a Golden Workflow
coverage record. It never edits code — see `SKILL.md`'s Non-Negotiable
Constraint.

## Relationship to existing Skills

- **`prompt-compiler`** (`.claude/skills/prompt-compiler/SKILL.md`) detects
  the trigger condition and compiles the task; this skill performs the
  cross-system investigation `prompt-compiler` is constitutionally barred
  from doing itself.
- **`mold-cad-engineering`** owns CAD *correctness*; this skill owns
  *blast-radius awareness before implementation starts*. Its report is
  input to a subsequent `mold-cad-engineering` review, not a substitute.
- **`mold-interactive-cad-ux`** owns interaction/UX quality — out of scope
  here.
- **`mold-test`** selects concrete validation commands; this skill
  recommends validation categories and depth only.
- **`mold-commit-ready`** should check this skill's Golden Workflow
  coverage record for an unresolved `SKIPPED-UNJUSTIFIED` entry before
  returning a `Ready` verdict.
- **The Loop Engine / Proposal-Driven Workflow**
  (`docs/cad-skills/LOOP_ENGINE.md`, `docs/cad-skills/PROPOSAL_WORKFLOW.md`)
  already owns human-approval gating end to end. This skill does not
  introduce a second approval mechanism — when a task is routed through
  `loop-engine`'s Proposal Mode, this skill's findings populate the
  existing `EngineeringProposal` fields (`filesInvestigated`,
  `protectedSystems`, `risks`, `openQuestions`, `validationPlan`).

## Portability

`SKILL.md` in this directory is written to be followed by direct
instruction-reading alone — no Skill tool, hook, or subagent system is
assumed. Every agent-specific entry point (Claude Code's
`.claude/skills/interconnected-systems-stability-engineer/SKILL.md`, and
any future Codex/Gemini/Antigravity file) is a thin pointer here, not a
duplicate. If an agent-specific pointer and this directory's `SKILL.md`
ever disagree, `SKILL.md` here is authoritative.

## Phase 1 scope

This directory currently contains exactly what an approved Phase 1
proposal authorized: `SKILL.md`, this `README.md`, and
`contracts/golden-workflow-coverage.schema.json` — the only
machine-readable schema built in Phase 1. Dependency-map,
state-ownership-map, protected-contract, and system-impact-report schemas
were deliberately deferred, not omitted by oversight. "Remove Mold" and
"Rebuild" are marked `UNVERIFIED` in `SKILL.md`'s Golden Workflow and were
not investigated further under this scope.
