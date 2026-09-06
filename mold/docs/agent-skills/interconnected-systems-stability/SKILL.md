# Interconnected Systems Stability Engineer

Vendor-neutral, investigation-only procedure for preventing systemic
integration regressions in the Mold Generator SaaS frontend — cases where a
change to one tool or runtime path unexpectedly breaks another (orientation
changes wiping the mold document, a cavity failure leaving registration
stuck, Create Mold breaking after an unrelated viewport change, tests
passing while the real browser workflow stays broken).

This is the **one canonical copy** of this procedure. Any agent-specific
file (Claude Code's `.claude/skills/interconnected-systems-stability-engineer/SKILL.md`,
or a future Codex/Gemini/Antigravity entry point) is a thin pointer to this
file only — it must never restate this procedure's content. If this file
and any pointer ever disagree, this file is authoritative.

## Non-Negotiable Constraint

> This skill does not modify product code, implement fixes, refactor
> systems, or execute repairs. It produces a pre-implementation impact and
> stability report. Implementation begins only after the parent workflow
> completes approval and planning.

Every step below is read-only investigation and reporting. If following
this procedure surfaces an irresistible temptation to "just fix it while
I'm here" — stop. That decision belongs to the parent workflow's PLAN/
IMPLEMENT stages (see `docs/agent/ENGINEERING_LOOP.md`), never to this
skill.

## Relationship to Other Skills — Read Before Using

This skill answers exactly one question: **"what else in the interconnected
system could this change accidentally break, and have I proven the answer
before touching code?"** It does not answer, and must not be asked to
answer:

- **"Is this geometrically/architecturally correct?"** — that is
  `mold-cad-engineering`'s question. This skill runs first, as a gate; its
  report becomes input to a subsequent `mold-cad-engineering` review, not a
  replacement for one.
- **"Can the user operate this well in the viewport?"** — that is
  `mold-interactive-cad-ux`'s question.
- **"What is the real engineering intent, and how should the task be
  scoped?"** — that is `prompt-compiler`'s question, run earlier. This
  skill consumes `prompt-compiler`'s output (`protectedSystems`,
  `openQuestions`) rather than re-deriving it.
- **"Which exact commands validate this?"** — that is `mold-test`'s
  question. This skill recommends validation *categories and depth* only
  (Module 7 below); `mold-test` selects concrete commands.
- **"Is this ready to commit?"** — that is `mold-commit-ready`'s question.
  This skill's Golden Workflow Coverage output (see below) is one input
  `mold-commit-ready` should check for an unresolved
  `SKIPPED-UNJUSTIFIED` entry before returning `Ready`.

Do not duplicate any of the above skills' content into this skill's output.
Cite them by name and hand off.

## When This Applies

**Trigger automatically** when a task meets any of:

- The task is `HIGH` risk per `docs/agent/ENGINEERING_LOOP.md` (geometry,
  Boolean operations, coordinate transforms, cavity generation,
  segmentation, partitioning, architectural change, cross-boundary state
  ownership, significant runtime lifecycle behavior, broad regression
  risk).
- Investigation so far shows the task touches **more than one** of:
  viewport runtime, toolbar/tool lifecycle, keyboard routing, a Zustand
  store other than the one obviously implicated, model orientation/
  transform, model grounding, camera framing, any mold-generation pipeline
  stage (reference-mold-definition, split-face, cavity-generation,
  sprue-generation, registration), or the create/remove/rebuild lifecycle.
- The task is shaped like a regression report: "X used to work, now Y
  breaks," "fixing A broke B," "tests pass but the real app is broken."
- The task is classified `Geometry/runtime bug` in
  `docs/agent/WORKFLOW_POLICY.md`'s Decision Matrix.

**Bypass** (do not invoke — this is not free) when:

- The task is `LOW` risk per `ENGINEERING_LOOP.md` (documentation, isolated
  CSS, copy text, obvious test-expectation fixes).
- Prior investigation already proved the change is single-file,
  single-store, with no cross-feature read — do not re-run this skill to
  confirm what Explorer already established.
- The change is confined to the Python core engine (`src/`) with zero
  frontend involvement — the two codebases are not runtime-connected today
  (`docs/agent/PROJECT_MAP.md`).
- Documentation-only, CI-only, or non-geometric UI work.

Scale the depth of every module below to the task's actual risk — a narrow,
already-well-understood change gets a short report; do not produce an
exhaustive investigation for a change that doesn't need one. This mirrors
`mold-cad-engineering`'s own existing depth-scaling rule.

## Internal Modules

Run these as sections of one investigation, in this order. Each is a
question to answer with real evidence (exact file paths, line numbers,
function names) — never a guess, and never a claim carried forward from a
stale document without verifying it against current code first (this
repository's own `docs/agent/PROJECT_MAP.md` has been found to misattribute
state ownership at least once — verify, don't trust).

### 1. State & Runtime Ownership Auditor
For every store/module the change touches, identify the single authoritative
owner. Check for duplicated ownership — the same value tracked in more than
one place with no single-write enforcement. Cross-check any architecture
document's ownership claims against the actual `create(...)`/store
definition in code before relying on them.

### 2. Lifecycle & Synchronization Boundary Auditor
Identify which lifecycle event category the change actually belongs to —
model import, model replacement, model transform, orientation change,
geometry regeneration, workflow rebuild, or model removal — and whether the
codebase's current behavior already conflates two of these incorrectly.
Trace the actual invalidation/staleness mechanism in play (fingerprint,
revision, requestId, generation-version counters, or equivalent) and
confirm the touched change participates in it consistently with sibling
code paths, not a parallel ad-hoc check.

### 3. Side-Effect & Blast-Radius Analyzer
Trace what the touched code path actually does on **every** outcome, not
just the success path — including throw, cancellation, and supersession by
a newer request. A store/state slice that is optimistically set before an
async operation must be traced to confirm it is reset on every failure
path, not only the happy path. Identify downstream consumers (the
dependency graph) by following real function calls/imports — do not build
or consult a maintained dependency-map artifact; none exists in this
repository by design (see Golden Workflow Coverage section below for the
one artifact this skill does produce).

### 4. Protected-Contract & Scope-Boundary Resolver
Collect: `prompt-compiler`'s `protectedSystems` output for this task, any
informal ownership comments found in the touched code (e.g. JSDoc asserting
"the only gate," "sole lifecycle boundary" — treat these as documentation
of intent, not enforced guarantees, unless code actually enforces them),
and `AGENTS.md`'s Scope Discipline / Geometry and Runtime Caution rules.
Produce the smallest safe change boundary and the explicit list of files
that must remain untouched. Do not propose a new protected-contract marking
mechanism — flag the absence of enforcement as a Recommendation (see
Regression Risk Synthesizer) if relevant, nothing more.

### 5. Golden Workflow Coverage Planner
See the Golden Workflow section below. Determine whether this task requires
the full workflow or a justified subset, and produce the coverage record.

### 6. Regression Risk Synthesizer
Classify every finding from modules 1–5 into exactly four categories,
reusing `mold-cad-engineering`'s existing convention rather than a new one:

- **Blockers** — the change cannot proceed as currently understood (e.g. an
  unresolved ownership conflict, a lifecycle event silently conflated with
  another, a side effect with no reset path). A Blocker means: do not
  proceed to implementation for this boundary. Escalate per
  `docs/agent/ENGINEERING_LOOP.md`'s existing Escalation Rules — this skill
  introduces no new escalation mechanism.
- **Risks** — plausible but unconfirmed defect sources.
- **Recommendations** — concrete, non-blocking improvements.
- **Optional enhancements** — out of scope for this task, worth noting for
  later.

### 7. Validation Depth Recommender
State which categories of validation this change needs (unit,
integration, cross-store, worker-boundary, real-runtime/browser) and why —
do not select concrete commands; hand that off to `mold-test`. If
real-runtime/browser verification is required (see Golden Workflow
section), say so explicitly; a Vitest/jsdom pass with a mocked worker
boundary is not evidence the real browser workflow works, and must not be
reported as if it were.

## Golden Workflow

The reference end-to-end sequence for this application's core loop:

```
Import STL → Flip/Orient → Create Mold (Split) → Cavity → Sprue
   → Registration → Remove Mold [UNVERIFIED] → Rebuild [UNVERIFIED]
```

**"Remove Mold" and "Rebuild" are explicitly UNVERIFIED as distinct,
separately-triggerable actions in this codebase, as of Phase 1.** Do not
assume they exist as named affordances; do not investigate, implement,
rename, or redesign them under this skill. If a task requires certainty
about them, say so as an open question in the report rather than guessing.

"Create Mold" is the user-facing name for what the code and UI currently
label "Split mold" — cite the actual code entry point in any report, not
just the conceptual name.

### Risk-Scaled Coverage

- **Use the full workflow** only when the change affects: shared lifecycle
  events, model-replacement behavior, runtime ownership, transform
  synchronization between the viewport and the mold document, pipeline
  coordination (stage-to-stage handoff or invalidation), or otherwise
  carries broad regression risk.
- **For narrow changes**, use the smallest justified subset — the touched
  stage plus its immediate downstream consumer, no more.
- **Every stage** gets exactly one status: `RUN`, `SKIPPED-JUSTIFIED` (with
  a one-line reason), or `SKIPPED-UNJUSTIFIED`.
- **`SKIPPED-UNJUSTIFIED` is a Blocker** — feed it into the Regression Risk
  Synthesizer's Blockers list. A report may not claim readiness with an
  unjustified skip.

Record coverage using the schema at
`docs/agent-skills/interconnected-systems-stability/contracts/golden-workflow-coverage.schema.json`.
`mold-commit-ready` should check this record for any `SKIPPED-UNJUSTIFIED`
entry before returning a `Ready` verdict.

## Pre-Implementation Report — Required Output

Produce exactly these 20 fields before any implementation begins. Every
field must be evidence-based (file:line citations) — an empty or "none
identified" answer is acceptable where genuinely true; a guessed answer is
not.

1. Requested change
2. Confirmed current behavior
3. Authoritative state owners
4. Dependency graph (as traced in Module 3 — a report section, not a
   maintained artifact)
5. Lifecycle events involved
6. Directly affected systems
7. Indirectly affected systems
8. Synchronization boundaries
9. Side effects
10. Protected contracts
11. Forbidden change areas
12. Regression risks
13. Smallest safe implementation boundary
14. Exact files likely requiring modification
15. Exact files that must remain untouched
16. Required unit tests
17. Required integration tests
18. Required real-runtime/browser verification
19. Rollback policy
20. Approval status

Close with the four-category Regression Risk Synthesizer verdict (Module
6). This report is the skill's complete deliverable — implementation is a
separate, later act performed by the parent workflow, never by this skill.

## Worked Example (Illustrative, Not a Live Investigation)

A task "make Flip snappier" would trigger this skill (touches viewport
runtime + orientation + is plausibly cross-system). Applying the modules:
Module 1 finds orientation state and the mold-generation document are
different stores with different owners. Module 2 finds the runtime layer
deliberately does *not* treat an orientation change as model replacement,
while the mold-document layer's orientation-commit handler unconditionally
calls the same full-reset function used for real model replacement — two
lifecycle systems disagreeing about the same event. Module 3 finds this
reset discards split-face/cavity/sprue/registration state with no
targeted-narrower alternative in place. Module 5 requires the full Golden
Workflow, because the change touches shared lifecycle/model-replacement
behavior. Module 6 raises this conflation as a Risk (not a Blocker for a
"make it snappier" task, since the conflation predates and is unrelated to
the requested change) with a Recommendation to flag it for a separate,
future task. Module 7 requires real-runtime verification, since a
runtime-layer-only unit test already exists for this exact code path and
would not be sufficient alone to prove the mold document survives a flip.

This example is illustrative of how to apply the modules — it is not a
standing claim about current application behavior at the time any future
agent reads this file; verify current code before relying on it.
