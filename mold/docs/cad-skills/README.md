# CAD Algorithm Engineering Skill System Architecture

**Status: FOUNDATION STABLE**

## Executive Overview

The **CAD Algorithm Engineering Skill System** is a vendor-neutral, capability-driven, and token-efficient framework for designing and specifying CAD algorithm features within the **Loop Engine**.

It establishes a central **Skill Registry** (`docs/cad-skills/registry/skill-registry.json`) as the single source of truth for all CAD skills. Skill 0 performs **Capability-Based Routing** and **Cost-Aware Selection**, allowing new skills to be added or replaced without modifying Skill 0.

---

## Canonical Skill & Capability Mapping

Capability ownership is strictly non-overlapping:

| Skill ID | Skill Name | Capabilities | Status |
|---|---|---|---|
| `cad-skill-orchestrator` | Skill 0 - CAD Skill Orchestrator | `Workflow` | **Stable** |
| `cad-algorithm-designer` | Skill 1 - CAD Algorithm Designer | `Design` | **Stable** |
| `geometry-computational-specialist` | Skill 2 - Geometry & Computational Specialist | `Geometry` | **Stable** |
| `general-segmentation-engine` | General Segmentation Engine | `SegmentationPlanning` | *Experimental* |
| `cad-algorithm-implementer` | Skill 3 - CAD Algorithm Implementer | `Implementation` | **Stable** |
| `cad-validation-testing-engineer` | Skill 4 - CAD Validation & Testing Engineer | `Validation`, `Testing` | **Stable** |
| `cad-performance-optimization-engineer` | Skill 5 - CAD Performance & Optimization Engineer | `Performance`, `Optimization` | **Stable** |
| `cad-maintenance-evolution-engineer` | Skill 6 - CAD Maintenance & Evolution Engineer | `Maintenance`, `Evolution` | **Stable** |

---

## Core Architectural Features

1. **Central Skill Registry (`skill-registry.json`):**
   - Single source of truth exposing skill metadata: `skillId`, `name`, `version`, `capabilities`, `inputContract`, `outputContract`, `dependencies`, `executionPriority`, `estimatedContextCost`, `estimatedOutputCost`, `estimatedReasoningComplexity`, `supportedUpdateModes`, and `status`.

2. **Capability-Based & Cost-Aware Routing (Skill 0):**
   - Routing operates on required capabilities (`Workflow`, `Design`, `Geometry`, `Implementation`, `Validation`, `Testing`, `Performance`, `Optimization`, `Maintenance`, `Evolution`).
   - Skill 0 resolves capabilities to registered skills, preferring the lowest sufficient execution cost while preserving engineering correctness.

3. **Vendor-Neutral Architecture:**
   - Framework contracts and schemas are model-independent and vendor-agnostic.
   - Usable by Claude, Codex, Gemini, Antigravity, or any compatible AI orchestrator runtime.

4. **Minimum Sufficient Routing & Context Budgeting:**
   - Defines strict context boundaries (`requiredFiles`, `excludedContext`, `maxRecommendedContextScope`).
   - Rejects broad repository scans by default.

5. **Artifact Reuse & Partial Updates:**
   - Reuses valid accepted artifacts (`ALG-*`, `GEO-*`).
   - In `PARTIAL_UPDATE` mode, skills emit only `changedSections`, saving ~80-85% token overhead on revisions.

---

## Foundation Stability Statement

Skills 0–6 are marked **Stable**. `general-segmentation-engine` is an
**Experimental** planning extension: it externalizes production constraints and
selection priorities into versioned profiles and policies, proves segmentation
necessity before evaluating externally defined candidate representations, and
delegates all geometry modification to Skill 3. It remains Experimental until
real prior-artifact handoff is proven
by agent-created payloads in an external harness. Phase 2 now provides and
integration-tests the repository-owned filesystem store, immutable revision
history, recursive stale detection, policy and missing-plan blockers,
`NOT_REQUIRED` termination, CLI handoffs, and trace evidence.

The current readiness verdict is **Experimental — Ready for Use**. The generic
contracts and live handoff support project-specific algorithm work, while
Stable promotion remains blocked on external agent-harness and production
evidence rather than repository documentation or tests alone.

`docs/cad-skills/tests/test_cad_skills.py` validates the registry and contract
schemas themselves (structure and cross-artifact traceability) — it does not
exercise Claude Code's Skill tool and is not evidence that any Skill has
actually been invoked. For that, see the next section.

---

## This directory is a data/contract layer, not a runtime

`docs/cad-skills/` (this README, `registry/`, `contracts/`, `examples/`,
`tests/`) defines *what* the CAD pipeline Skills are and *what* their
inputs/outputs look like. It contains no execution mechanism of its own —
nothing here causes a Skill to actually be discovered, selected, or
invoked by an AI coding agent.

The actual runtime that discovers, routes, invokes, and — critically —
**proves** invocation of these Skills (and the repository's other Skills)
lives in `.claude/loop/` (registry, router, execution trace, completion
gate) and is entered explicitly via the `loop-engine` Skill
(`.claude/skills/loop-engine/SKILL.md`, `/loop-engine <task>`). See
`docs/cad-skills/LOOP_ENGINE.md` for the full architecture, including why
this separation exists and how to verify a Skill genuinely ran.

## Proposal-Driven Engineering Workflow (hardened)

A separate effort adds a Human Approval Gate in front of execution:
Repository Investigation → Engineering Proposal → Approval → Execution →
Validation, with a vendor-neutral Execution Engine abstraction so the same
proposal can be executed by Claude Code, Codex, Gemini CLI, or a future
engine. See `docs/cad-skills/PROPOSAL_WORKFLOW.md` for the full design,
current status, and phase history — including an Engineering Hardening
pass that closed four defects an independent audit found: the approval
gate is now also backed by a vendor-neutral git `pre-commit` hook (not
just a Claude-Code-specific one); every one of the 10 lifecycle states,
including `VALIDATING`/`COMPLETED`, is now a real, tested, reachable code
path (`EXECUTING` is no longer a dead end); the Engineering Proposal
object exists from the moment a task is routed and is completed directly
by Prompt Compiler's validated output, not constructed later; and every
documentation/schema/registry drift the audit found has been closed.
Invoking `/loop-engine <task>` defaults to this gated procedure, with the
prior ungated flow retained as an explicit "Direct Execution
(Compatibility) Mode." **What's still honestly unverified:** the
Claude-Code `PreToolUse` hook's live blocking behavior — only its script
has been exercised directly, not a real Claude Code harness invocation.
The git pre-commit hook does not share this gap: it was verified
end-to-end by invoking the installed hook script exactly as git would.
See `docs/cad-skills/PROPOSAL_WORKFLOW.md`'s Known Limitations for this
and every other disclosed gap.
