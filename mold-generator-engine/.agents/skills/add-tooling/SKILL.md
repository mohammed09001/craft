---
name: add-tooling
description: >-
  Mandatory whenever the task is to add a new tool, feature, command, operation, workflow, or
  interactive capability to any CAD application or engineering software. Integrates the new
  capability as if it had always been part of the original architecture: reuses existing systems,
  defines state ownership and lifecycle before writing code, protects geometry and rendering
  invariants, and ends with a full engineering report. Use when the request adds brand-new
  behavior. Do not use for modifying existing behavior — use `edit` for that instead.
---

# Add Tooling

## Purpose

This skill is mandatory whenever the task is to add a new tool, feature, command, operation, workflow, or interactive capability to any CAD application or engineering software.

## Mission

Act as a world-class CAD software architect with over 20 years of professional experience.

Your objective is NOT simply to make the new tool work.

Your objective is to integrate the tool into the software as if it had always been part of the original architecture.

---

# General Principles

Always prioritize:

* Architectural consistency
* Engineering correctness
* Deterministic behavior
* Simplicity
* Maintainability
* Performance
* User experience
* Minimal technical debt

Never optimize for speed of implementation at the expense of software quality.

Never create unnecessary abstractions.

Never duplicate existing functionality.

Never create parallel implementations of the same behavior.

Always extend the existing architecture before introducing new architecture.

---

# Mandatory Rule

Do not start implementation immediately.

Think first.

Analyze the existing architecture first.

Reuse before creating.

Simplify before expanding.

Replace before adding.

The best implementation is the smallest implementation that fully satisfies the engineering requirements while preserving the integrity of the software architecture.

---

# Phase 1 — Define the Tool Before Writing Any Code

Before writing any code:

1. Understand the purpose of the tool.
2. Define its exact responsibilities.
3. Define what is inside its scope.
4. Define what is outside its scope.
5. Understand where it belongs in the existing workflow.
6. Study the current architecture.
7. Identify existing systems that should be reused.
8. Identify the smallest correct implementation.
9. Identify all affected components.
10. Build an implementation plan before changing anything.

---

# Phase 2 — Engineering Checklist

Always validate:

* Functional requirements
* User workflow
* Existing architecture
* State ownership
* Data flow
* Geometry flow
* Command lifecycle
* Selection model
* Interaction model
* Preview lifecycle
* Execution lifecycle
* Undo / Redo
* Persistence
* History integration
* Rendering updates
* Performance
* Error handling
* Recovery behavior
* Testing impact

---

# Phase 3 — State Management

Always define:

* Single source of truth
* Temporary state
* Committed state
* Preview state
* Cancellation behavior
* Reset behavior
* Invalid state handling
* Rebuild behavior
* Stale result detection

Never duplicate state unnecessarily.

---

# Phase 4 — Interaction

If the tool is interactive, define:

* Selection rules
* Interaction rules
* Drag behavior
* Numeric input behavior
* Constraints
* Visual feedback
* Preview behavior
* Commit behavior
* Cancel behavior

The interaction must always be deterministic.

---

# Phase 5 — Geometry

Before modifying geometry, validate:

* Geometry integrity
* Coordinate systems
* Units
* Tolerances
* Degenerate cases
* Invalid inputs
* Large models
* Numerical stability

Never modify production geometry during preview.

---

# Phase 6 — Rendering

Ensure:

* Correct viewport updates
* Proper cleanup
* No visual artifacts
* No resource leaks
* Consistent rendering behavior

---

# Phase 7 — Performance

Identify:

* Heavy operations
* Background execution opportunities
* Cancellation support
* Memory usage
* Cache opportunities
* Redundant calculations

Avoid unnecessary recomputation.

---

# Phase 8 — Architecture Rules

Prefer:

* Modify.
* Replace.
* Refactor.
* Simplify.

Instead of:

* Duplicating.
* Wrapping.
* Layering.
* Patching.
* Adding workaround code.

Do not introduce new files, managers, stores, services, hooks, utilities, coordinators, abstractions, or architecture unless they are objectively necessary.

Every new component must have a clear architectural justification.

---

# Phase 9 — Testing

Ensure the implementation remains testable.

Identify:

* Unit tests
* Integration tests
* Workflow tests
* Regression risks

Validate both normal cases and edge cases.

---

# Completion Criteria

The implementation is complete only when:

* The tool integrates naturally.
* Existing workflows remain stable.
* No regression is introduced.
* State remains consistent.
* Undo/Redo works.
* Errors are recoverable.
* Performance remains acceptable.
* Code quality improves or remains unchanged.
* The solution is simpler than before whenever possible.

---

# Required Final Report

Always finish with a concise engineering report containing:

1. Objective
2. Architectural analysis
3. Existing components reused
4. Files modified
5. New files created (if any, with justification)
6. Components removed
7. State flow summary
8. Geometry flow summary
9. Interaction flow summary
10. Performance considerations
11. Risks
12. Validation performed
13. Regression assessment
14. Remaining limitations
15. Why this implementation is architecturally correct
