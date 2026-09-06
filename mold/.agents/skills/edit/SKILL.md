---
name: edit
description: >-
  Modifies an existing tool, feature, command, workflow, panel, interaction, geometry operation, or system behavior
  inside an established project. Especially for CAD, 3D, geometry-processing, engineering, graphics, and technically
  complex applications. Investigates root cause before editing, preserves sources of truth, removes obsolete logic,
  and validates behavior in the real workflow. Use when the request asks to change, fix, or adjust behavior of
  existing code rather than add a brand-new feature. Do not use for greenfield features or generic code generation.
---

# Edit

## Purpose

The `Edit` skill is responsible for modifying an existing tool, feature, command, workflow, panel, interaction, geometry operation, or system behavior inside an established software project.

This skill must be especially reliable for CAD, 3D, geometry-processing, engineering, graphics, and technically complex applications.

It must not behave like a generic code-generation skill.

Its primary responsibility is to understand the existing implementation, identify the true source of the requested behavior, modify the correct existing code, preserve system integrity, and prove that the requested edit works without introducing unnecessary architecture or duplicate logic.

---

# Core Principle

Editing is not the same as adding.

Before creating any new code, the skill must first determine whether the requested result can be achieved by:

* modifying existing code;
* replacing an existing implementation;
* removing obsolete logic;
* consolidating duplicated behavior;
* correcting an existing state or data flow;
* reconnecting an existing implementation that is no longer reached;
* exposing an existing capability correctly in the UI;
* fixing the condition that hides, disables, or bypasses the tool.

New code may be added only when it is genuinely required and cannot be achieved cleanly through modification, replacement, consolidation, or deletion.

The skill must prefer the smallest correct architectural change, not the smallest textual diff.

---

# Mandatory Operating Rules

When this skill is invoked, follow these rules strictly:

* Do not immediately edit code.
* Do not assume the visible symptom is the root cause.
* Do not rebuild an existing feature unless the current implementation is fundamentally invalid.
* Do not create parallel implementations of the same behavior.
* Do not create duplicate state, duplicate geometry pipelines, duplicate UI conditions, or duplicate sources of truth.
* Do not patch only the UI when the actual problem is in state, workflow routing, geometry execution, synchronization, or lifecycle management.
* Do not hide errors or unsupported states.
* Do not use hardcoded values to make a specific test case appear correct.
* Do not silently broaden the task.
* Do not refactor unrelated areas.
* Do not preserve obsolete code merely because deleting it feels risky.
* Do not report success based only on compilation or unit tests.
* Do not declare the task complete until the requested behavior is validated in its real workflow.

---

# Phase 1 — Understand the Requested Edit

Begin by converting the user request into an explicit behavioral contract.

Identify:

* what existing tool or behavior must change;
* what its current behavior is;
* what its required behavior should become;
* where and when it should be available;
* where and when it should be hidden;
* where and when it should be disabled;
* which workflow modes it must support;
* which states or prerequisites control it;
* what must remain unchanged;
* what must never happen;
* what constitutes success;
* what constitutes failure.

Do not infer major product behavior without evidence.

When the request is sufficiently clear, continue without unnecessary questions.

If a detail is not specified, inspect the existing product conventions and choose the behavior most consistent with the current architecture.

---

# Phase 2 — Observe the Existing Behavior

Before modifying code:

* run or inspect the current application where possible;
* reproduce the current behavior;
* identify whether the problem is deterministic or intermittent;
* inspect the tool in all relevant workflow modes;
* inspect its visible UI state;
* inspect the internal application state;
* inspect the geometry or data result;
* inspect the behavior after cancellation, reopening, undo, redo, refresh, and workflow switching when relevant.

Do not rely only on filenames or component names.

The visible UI may not be the authoritative implementation.

---

# Phase 3 — Trace the Complete Execution Path

Trace the tool from user interaction to final result.

The trace should include, where applicable:

* command or button rendering;
* visibility and enablement conditions;
* event handler;
* action or command dispatcher;
* local component state;
* global store state;
* workflow router;
* domain contract;
* validation or preflight;
* async operation;
* worker or backend call;
* geometry engine;
* result storage;
* derived data;
* viewport rendering;
* cleanup and disposal;
* undo and redo integration;
* persistence or project reload behavior.

Determine which layer is authoritative.

Document any duplicated or conflicting control paths discovered during tracing.

---

# Phase 4 — Identify the Source of Truth

For every important behavior, identify one authoritative owner.

This includes:

* tool availability;
* active mode;
* active selection;
* numeric values;
* geometry parameters;
* execution status;
* generated result;
* visibility;
* committed state;
* preview state;
* error state.

If multiple sources of truth exist, do not add another one.

Consolidate or reconnect the existing ownership model where necessary.

Derived values must remain derived unless there is a strong architectural reason to persist them.

UI components must not become independent owners of domain behavior.

---

# Phase 5 — Diagnose the Root Cause

Classify the problem before editing.

Possible categories include:

* incorrect UI condition;
* stale state;
* state ownership conflict;
* broken workflow routing;
* incorrect lifecycle transition;
* race condition;
* async cancellation failure;
* stale result reuse;
* geometry execution defect;
* coordinate-system mismatch;
* unit mismatch;
* precision or tolerance issue;
* invalid domain contract;
* missing cleanup;
* hidden exception;
* rendering-layer defect;
* incorrect object visibility;
* material or depth issue;
* unsupported mode incorrectly treated as valid;
* obsolete code still controlling behavior;
* test coverage gap;
* current code correct but disconnected from the active workflow.

The final implementation must address the root cause, not merely suppress the symptom.

---

# Phase 6 — Protect Engineering Invariants

Before implementing the edit, identify the invariants that must remain true.

For CAD and geometry systems, review at least:

* coordinate systems;
* world space versus local space;
* axis ownership;
* model orientation;
* transformations;
* units;
* tolerances;
* precision;
* manifold validity;
* volume conservation;
* body identity;
* topology stability;
* source geometry immutability;
* preview versus committed geometry;
* printer or machine constraints;
* grounding and origin rules;
* object ownership;
* disposal of temporary geometry;
* deterministic output;
* revision and fingerprint consistency.

Do not modify a geometric operation without identifying which coordinate frame its inputs and outputs use.

Never mutate canonical source geometry unless the architecture explicitly requires it.

---

# Phase 7 — Design the Edit

Choose the smallest structurally correct solution.

Preference order:

1. Correct an existing condition.
2. Reconnect an existing implementation.
3. Modify the current owner of the behavior.
4. Replace incorrect logic inside the existing path.
5. Consolidate duplicated logic.
6. Remove obsolete or conflicting code.
7. Add a minimal new abstraction only when no correct existing owner exists.

Before implementation, define:

* files that genuinely need modification;
* files that must not be touched;
* logic to replace;
* logic to delete;
* state transitions affected;
* geometry contracts affected;
* tests that must change;
* regression risks;
* cleanup requirements.

Do not introduce a new framework, store, service, manager, engine, coordinator, or abstraction merely to solve a localized edit.

---

# Phase 8 — Implement the Edit

During implementation:

* edit the authoritative path;
* preserve established naming and architectural conventions;
* keep state transitions explicit;
* keep geometry operations deterministic;
* preserve cancellation semantics;
* reject stale async results;
* dispose of temporary objects and resources;
* replace obsolete logic instead of leaving dead alternatives;
* remove unused imports, handlers, state, components, helpers, and branches;
* update contracts and types where behavior actually changed;
* keep UI state derived from domain state where appropriate;
* expose failures visibly where the product requires user feedback;
* prevent invalid operations instead of allowing corrupted results.

When a complete function or component is conceptually wrong, prefer replacing it cleanly rather than layering condition after condition on top of it.

---

# Phase 9 — Prevent Code Accumulation

After implementation, actively search for residue created by the old behavior.

Check for:

* unused code;
* unreachable branches;
* duplicate helpers;
* duplicate stores;
* duplicate event handlers;
* old feature flags;
* obsolete rendering paths;
* deprecated geometry paths;
* stale comments;
* unused tests;
* contradictory names;
* temporary debugging code;
* compatibility shims that are no longer necessary.

Delete obsolete code when it is safe and within task scope.

Do not keep both the old and new implementation active "just in case."

---

# Phase 10 — Validate the Edit

Validation must cover more than compilation.

Perform the relevant checks from the following categories.

## Static validation

* type checking;
* linting;
* build;
* import validation;
* dead-code detection where available;
* contract consistency.

## Unit validation

* updated behavior;
* state transitions;
* visibility and enablement conditions;
* validation failures;
* numeric boundaries;
* cancellation;
* stale-result rejection;
* cleanup;
* deterministic output.

## Integration validation

* full user action path;
* interaction with adjacent tools;
* workflow switching;
* reopening;
* committing;
* cancelling;
* undo;
* redo;
* saving;
* reloading;
* mode transitions.

## CAD and geometry validation

* simple geometry;
* complex geometry;
* rotated geometry;
* translated geometry;
* very small geometry;
* very large geometry;
* boundary dimensions;
* invalid geometry;
* non-manifold geometry where supported;
* volume consistency;
* correct body count;
* expected topology;
* expected coordinate placement;
* no unintended mutation of the source model.

## Visual validation

* the tool is visible where required;
* hidden where required;
* enabled and disabled correctly;
* the viewport result matches internal state;
* previews disappear correctly;
* committed objects remain visible;
* materials and overlays do not obscure the result;
* no duplicate objects are rendered;
* no stale result survives workflow changes.

## Performance validation

* no repeated expensive computation;
* no unbounded event subscriptions;
* no geometry or material leaks;
* no worker leaks;
* no duplicate async requests;
* no severe frame-rate regression;
* no unnecessary rerender loop.

---

# Phase 11 — Completion Criteria

Do not declare the edit complete unless all applicable conditions are true:

* the root cause is identified;
* the requested behavior works;
* the correct existing architecture owns the behavior;
* the result works in every required mode;
* adjacent workflows remain functional;
* no duplicate implementation was introduced;
* obsolete logic was removed where appropriate;
* engineering invariants remain valid;
* tests cover the changed behavior;
* the actual application behavior was validated where possible;
* known limitations are explicitly disclosed.

Compilation alone is not completion.

Passing tests alone is not completion.

A visible button alone is not completion.

A correct internal result that is not shown properly is not completion.

A visually correct result backed by invalid internal state is not completion.

---

# Required Final Report

At the end of every task, provide a concise but technically complete report with these sections:

## Decision

State one of:

* COMPLETE
* COMPLETE WITH DISCLOSED LIMITATIONS
* BLOCKED
* INVESTIGATION ONLY

## Requested Edit

Summarize the intended behavioral change.

## Previous Behavior

Describe what the system did before the edit.

## Root Cause

State the actual technical cause.

Do not use vague wording such as "state issue" or "rendering problem" without identifying the concrete mechanism.

## Implementation

List:

* what was modified;
* what was replaced;
* what was removed;
* whether any new code was added;
* why each structural change was necessary.

## Source of Truth

State which component, store, domain object, engine, or workflow now authoritatively controls the behavior.

## Files Changed

List only files actually changed.

## Validation

Report:

* checks executed;
* tests added or updated;
* workflows manually validated;
* geometry cases validated;
* build and type-check status.

## Regression Review

State which adjacent tools and workflows were checked.

## Code Removal

List obsolete, duplicate, or unreachable code removed.

If none was removed, explicitly state why retaining the existing code was correct.

## Limitations

Disclose anything not validated or any remaining constraints.

---

# Behavioral Style

The `Edit` skill must act like a senior software engineer with deep experience in CAD and engineering software.

It must be:

* investigative before destructive;
* precise rather than speculative;
* conservative about architecture;
* aggressive about removing obsolete logic;
* strict about sources of truth;
* aware of geometry and lifecycle invariants;
* resistant to code accumulation;
* honest about validation limitations;
* focused only on the requested edit.

The skill must not hallucinate files, systems, APIs, geometry results, tests, or runtime validation.

When something cannot be verified, state that clearly.

When the existing implementation is already correct but disconnected, restore the connection instead of rebuilding it.

When the requested edit conflicts with a core system invariant, preserve the invariant and report the conflict clearly.

The final result should feel like a disciplined modification to an established engineering system, not a new feature loosely added beside the old one.
