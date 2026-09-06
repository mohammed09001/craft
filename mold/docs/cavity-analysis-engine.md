# Cavity Analysis Engine

## Purpose

Chapter 4 remains an independent `CavityAnalysisService` that runs after:

* Chapter 2 has produced the canonical `ImportAnalysisReport`
* Chapter 3 has produced the canonical `DetailedMoldAnalysisReport`
* the original `ImportedModel` remains the legal geometry source

This stage now combines:

* structured upstream evidence assessment
* a geometric shell/topology-first cavity candidate detector
* opening, accessibility, direction, internal-undercut, and trapping evidence
* preliminary core-strategy synthesis
* a final Chapter 4 cavity-analysis decision

The service still does not generate mold geometry or authorize downstream mold
construction.

## Inputs

The legal Chapter 4 inputs are still:

* `ImportAnalysisReport`
* `DetailedMoldAnalysisReport`
* `ImportedModel`

`CavityAnalysisContext` binds those references without copying geometry.

## Current Scope

Chapter 4 now does all of the following:

* validate Chapter 2 and Chapter 3 input contracts
* short-circuit when Chapter 2 blocks processing
* short-circuit when the Chapter 3 report is not consumable
* interpret structured upstream evidence through `CavityEvidenceAssessor`
* detect disconnected shell components using shared undirected mesh edges
* analyze per-shell topology facts such as boundary and non-manifold edges
* classify nested closed shells conservatively through deterministic point
  containment
* detect conservative opening witnesses and internal access directions
* assess directional internal obstruction evidence
* assess preliminary core trapping risk from existing Chapter 4 evidence
* synthesize per-target preliminary core-strategy outcomes
* resolve a conservative multi-cavity Chapter 4 decision
* emit a deterministic standalone `CavityAnalysisReport`

Chapter 4 still does not:

* prove final core feasibility
* generate cavity or core geometry
* prove valid manufacturing openings from mesh holes alone
* prove insertion paths, swept volume, clearance, or collision-free motion
* select sliders, lifters, side cores, collapsible cores, soluble cores, or any
  other final core mechanism
* prove that the absence of a candidate means the model has no cavity in every
  manufacturing sense

## Geometric Method

The default geometric dependency is `ShellTopologyCavityCandidateDetector`.

It uses:

* face connected components built from shared undirected edges
* per-shell boundary and non-manifold analysis
* deterministic shell ordering
* AABB prefiltering
* deterministic ray directions with odd/even parity for point containment

The detector reports:

* `CavityCandidateDetectionResult`
* zero or more `InternalCavityCandidate`
* typed `CavityFinding` records

This detector is conservative. It explicitly prefers ambiguity or
not-assessable results over overclaiming cavity certainty.

## Cavity Candidate Meaning

An `InternalCavityCandidate` is not the same thing as a confirmed cavity.

In the current implementation, a candidate means that Chapter 4 found detached
internal shell evidence that may correspond to:

* a potential enclosed internal volume boundary
* an ambiguous nested shell
* a nested shell with boundary or topology defects

The candidate model carries:

* a deterministic candidate identifier
* a stable shell/component reference
* a conservative connectivity classification
* optional parent-shell reference
* optional nesting depth
* structured findings

## Nested Shells Versus Cavities

The detector distinguishes between:

* a nested closed shell at odd nesting depth
  This is treated as a potential enclosed internal-volume boundary.
* a nested closed shell at even nesting depth
  This is treated as a likely solid-island boundary, not as a separate cavity.
* a nested open shell
  This is treated as mesh-boundary or ambiguous evidence, not as a valid
  manufacturing opening.

Containment, not face orientation alone, is the primary reference. Reversing
the winding of the inner shell should not erase a nested-shell candidate when
the containment evidence remains valid.

## Connectivity Classification

`CavityConnectivityClassification` currently supports:

* `ENCLOSED`
* `EXTERIOR_CONNECTED`
* `MESH_BOUNDARY_OPEN`
* `AMBIGUOUS`
* `NOT_ASSESSABLE`

Important constraint:

`MESH_BOUNDARY_OPEN` does not mean `EXTERIOR_CONNECTED`, and it does not mean a
valid core opening, mold opening, or access opening.

## Disconnected Solids

Multiple closed shells that are not contained inside one another are treated as
disconnected solid components, not as cavities. Chapter 4 emits structured
findings for this distinction because disconnected solids can otherwise look
like detached "inner" geometry if topology alone is interpreted too loosely.

## Status And Result Separation

The report still keeps execution `status` separate from engineering meaning.

At the report level:

* `status` says whether Chapter 4 completed, was blocked, or only partially
  completed
* `assessment_outcome` still represents the structured upstream evidence
  assessment
* `candidate_detection` carries the independent geometric detector result
* `preliminary_core_strategy` carries one preliminary strategy assessment per
  target
* `cavity_analysis_decision` carries the final Chapter 4 decision across all
  targets

This keeps the current structured-evidence contract stable while exposing the
new geometric and decision stages explicitly. `assessment_outcome` is not reused
as the final Chapter 4 decision.

## Core Trapping, Strategy, And Decision

`CoreTrappingRiskAnalyzer` emits preliminary structural trapping evidence. It
does not decide whether a core can be designed.

`CoreStrategySynthesizer` consumes only structured upstream Chapter 4 results:
classifications, opening IDs, access direction IDs, accessibility outcomes,
internal undercut outcomes, and trapping-risk outcomes. It does not run ray
queries or inspect face geometry again.

Each `CavityCoreStrategyAssessment` may report outcomes such as:

* `PRELIMINARY_LINEAR_CORE_CANDIDATE`
* `MULTI_DIRECTION_ACCESS_REQUIRED`
* `SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED`
* `BLOCKED_BY_CURRENT_METHOD`
* `MANUAL_REVIEW_REQUIRED`
* `AMBIGUOUS`
* `NOT_ASSESSABLE`
* `NOT_APPLICABLE`

A preliminary linear candidate means only that current Chapter 4 evidence is
compatible with a simple linear-core strategy. It does not prove core geometry,
opening clearance, collision-free insertion or extraction, or manufacturing
feasibility.

`BLOCKED_BY_CURRENT_METHOD` means the current preliminary/static Chapter 4
method found structured blocking evidence. It is not a claim that no future
special method could work.

`CavityAnalysisDecisionMaker` resolves the final Chapter 4 decision
conservatively across all targets. A hard target is not hidden by an easy target:
not-assessable, blocked, special-investigation, manual-review, and
multi-direction outcomes dominate a clean linear candidate.

## Findings

Chapter 4 still uses typed findings instead of warning-string parsing.

Important finding themes now include:

* nested closed shell candidate detected
* nested open shell detected
* mesh boundary prevents reliable connectivity classification
* non-manifold shell not assessable
* ambiguous shell containment
* disconnected solid components are not treated as cavities
* no candidate detected by the current shell/topology method

## Dependency Injection

Chapter 4 exposes replaceable dependencies for each pipeline stage:

* `CavityEvidenceAssessor`
* `CavityCandidateDetector`
* `CavityOpeningDetector`
* `CavityClassifier`
* `InternalAccessibilityAnalyzer`
* `InternalAccessDirectionGenerator`
* `InternalUndercutAnalyzer`
* `CoreTrappingRiskAnalyzer`
* `CoreStrategySynthesizer`
* `CavityAnalysisDecisionMaker`

This keeps geometric, synthesis, and decision logic out of
`CavityAnalysisService` and allows tests to inject fake stages directly.

## Serialization

`CavityAnalysisReport.to_dict()` remains deterministic and still emits:

* `schema_version = "1.0"`

The report now serializes `candidate_detection` and any nested
`InternalCavityCandidate` models, `preliminary_core_strategy`, and
`cavity_analysis_decision` while preserving stable list ordering and enum string
values.

## Current Limits

The shell/topology detector cannot currently prove all cavity forms.

Known limits include:

* open-to-exterior pockets within a single closed shell
* blind cavities represented on one outer boundary
* through-channels and tunnels within one shell
* valid manufacturing opening semantics
* core insertion path or clearance
* final core feasibility or mechanism selection

Because of these limits:

* "no candidate detected by the current shell/topology method" is a valid
  outcome
* it must not be read as "the model has no cavity"

## Future Expansion

Later Chapter 4 work can build on the current contracts for:

* exterior-connected cavity analysis
* opening-candidate detection
* internal accessibility analysis
* internal undercut analysis
* stronger core-feasibility assessment
