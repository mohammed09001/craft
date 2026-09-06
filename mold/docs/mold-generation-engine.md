# Mold Generation Engine

## Purpose

Chapter 5 starts after Chapters 2, 3, and 4 have already produced their
standalone reports. The current implementation is a preliminary planning layer,
not a geometry generator.

It consumes:

* `ImportedModel`
* `ImportAnalysisReport`
* `DetailedMoldAnalysisReport`
* `CavityAnalysisReport`

`MoldGenerationContext` binds these objects without copying mesh geometry or
rerunning upstream analysis.

## Current Scope

The current Chapter 5 stage produces:

* a standalone `MoldGenerationContext`
* a deterministic `PreliminaryMoldGenerationPlan`
* a standalone `MoldGenerationReport`
* an injectable `MoldGenerationPlanner` Protocol
* a conservative default planner
* a thin `MoldGenerationService`

The preliminary plan reports a disposition, a non-geometric generation mode,
required next capabilities, structured reasons, warnings, and compact
traceability to the upstream report decisions.

## Preliminary Plan Meaning

`READY_FOR_PARTING_STRATEGY` means the current report evidence can be handed to a
future parting-strategy stage. It does not select a final parting direction or
parting surface.

`MANUAL_REVIEW_REQUIRED` means upstream evidence is ambiguous, not assessable, or
requires engineering judgment before generation can proceed.

`BLOCKED` means a structured upstream decision prevents the current mold
generation path.

Generation modes are also preliminary:

* `SIMPLE_TWO_PART_CANDIDATE`
* `CORE_ASSISTED_CANDIDATE`
* `UNSUPPORTED_CANDIDATE`

A `CORE_ASSISTED_CANDIDATE` means only that Chapter 4 reported preliminary core
strategy evidence. It does not prove core feasibility, clearance, swept volume,
motion, or manufacturability.

## Analysis Evidence Versus Generation Decision

Chapters 2-4 provide analysis evidence. Chapter 5 maps that evidence into a
generation disposition without rerunning import, topology, moldability, cavity,
internal-access, undercut, trapping, or core-strategy analysis.

The default planner is conservative:

* Chapter 2 processing blockers block generation.
* Chapter 3 moldability blockers block generation.
* Chapter 4 cavity decision blockers block generation.
* Manual-review and not-assessable evidence stays manual-review evidence.
* Missing optional cavity-decision evidence does not become success.
* Preliminary core strategy is only a candidate signal.

## Boundaries

Chapter 5 currently does not:

* create a parting plane or parting surface
* select a final pull direction, internal access direction, or parting direction
* create mold envelope geometry
* create mold blocks or mold halves
* perform Boolean operations
* subtract cavities
* create core geometry
* perform project segmentation
* perform mold partitioning
* export files
* provide UI or interactive editing

Project Segmentation, Mold Partitioning, Export, and UI remain separate future
engines or application layers.

## Serialization

`MoldGenerationReport.to_dict()` and `PreliminaryMoldGenerationPlan.to_dict()`
follow the existing report pattern: dataclasses, enums, tuples, mappings, and
optional values are recursively converted into serialization-safe Python values.
The report uses `schema_version = "1.0"`.
