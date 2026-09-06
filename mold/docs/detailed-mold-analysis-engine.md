# Detailed Mold Analysis Engine

## Purpose

Chapter 3 starts after Chapter 2 has already:

* imported the source file
* built the `ImportedModel`
* run shared validation and topology checks
* classified issues
* produced the canonical `ImportAnalysisReport`
* decided whether the model is processable

Chapter 3 consumes that output. It does not repeat Chapter 2 work.

## Inputs

The legal Chapter 3 inputs are:

* `ImportAnalysisReport`
* `ImportedModel`

`ImportAnalysisReport` remains the source of Chapter 2 status, source metadata,
and processing eligibility. `ImportedModel` remains the source of mesh geometry.
`DetailedMoldAnalysisContext` composes both without copying geometry into the
report contract.

## Pipeline Order

`DetailedMoldAnalysisService` currently orchestrates the following sequence:

1. Chapter 2 eligibility gate from `ModelProcessingDecision`
2. injected `MoldAnalysisModule` instances
3. face geometry analysis
4. candidate pull-direction generation
5. candidate pull-direction evaluation
6. pull-direction ranking
7. preliminary pull-direction selection
8. preliminary undercut analysis
9. draft-angle analysis
10. connected undercut-region analysis
11. undercut risk assessment
12. moldability evidence summary
13. preliminary moldability decision
14. `DetailedMoldAnalysisReport`

Some of these steps are represented as separate result objects rather than
separate injected modules. The service remains responsible for orchestration and
data flow only; engineering rules stay inside the specialized analyzers,
summarizers, and deciders.

## Main Outputs

The unified Chapter 3 contract is `DetailedMoldAnalysisReport`. Its serialized
form is versioned with `schema_version = "1.0"`.

The report can include:

* Chapter 3 `status`
* source metadata and `chapter_2_status`
* the reused Chapter 2 `processing_decision`
* typed blockers for early gating
* injected module results
* pull-direction evaluations, ranking, and preliminary selection
* preliminary undercut analysis
* draft analysis
* connected undercut-region analysis
* undercut risk assessment
* preliminary moldability assessment

`to_dict()` recursively serializes nested dataclasses, enums, tuples, mappings,
and optional values into a serialization-safe structure. Enums are emitted as
their string values, nested dataclasses are fully expanded, and absent optional
fields remain `None`.

## Blocking And Partial States

If Chapter 2 does not provide a processable `ModelProcessingDecision`, detailed
analysis does not run. The returned report:

* has `status = BLOCKED`
* carries typed blockers
* does not run injected modules

This is a business-state result, not a programming exception.

Inside the Chapter 3 pipeline, partial or non-assessable engineering outcomes
are represented explicitly in the typed stage outputs and the preliminary
moldability assessment. Programming errors and contract violations are not meant
to be downgraded silently into warnings.

## Moldability Outcomes

The preliminary decision layer uses these outcome meanings:

`SIMPLE_MOLD_POSSIBLE`
The available Chapter 3 evidence supports a simple direct path with low risk.

`ADDITIONAL_ACTIONS_LIKELY`
The result remains assessable, but structured evidence suggests extra mold
actions are likely required.

`MANUAL_REVIEW_REQUIRED`
The part is not automatically blocked, but ambiguity, confidence, or complexity
does not justify a trusted automatic decision in Chapter 3.

`BLOCKED_FOR_DIRECT_GENERATION`
The current evidence blocks a direct automatic generation path. This does not
mean that all later manufacturing strategies are impossible.

`NOT_ASSESSABLE`
The current Chapter 3 evidence is insufficient for a reliable preliminary
decision.

## Core And Internal Insert Boundary

Any `core_or_insert_indication` produced in Chapter 3 is only an early signal.
Chapter 3:

* does not perform full cavity analysis
* does not design core geometry
* does not make the final internal-feature manufacturing decision

Later cavity-focused work remains the owner of that decision.

## Determinism

The current Chapter 3 implementation aims to be deterministic for the same
input model and Chapter 2 report by:

* using deterministic candidate identifiers
* ranking pull-direction candidates with explicit tie-breakers
* assigning deterministic connected-region identifiers
* sorting structured findings before serialization

Repeated analysis of the same input is expected to produce identical serialized
reports.

## Public Contracts

Chapter 3 currently exposes typed contracts for:

* `DetailedMoldAnalysisContext`
* `DetailedMoldAnalysisReport`
* `DetailedMoldAnalysisStatus`
* `MoldAnalysisModule`
* `CandidatePullDirectionProvider`
* `CandidatePullDirectionEvaluator`
* `PullDirectionRankingPolicy`
* `PreliminaryUndercutAnalyzer`
* `DraftAngleAnalyzer`
* `UndercutRegionAnalyzer`
* `UndercutRiskAssessor`
* `MoldabilityEvidenceSummarizer`
* `PreliminaryMoldabilityDecider`

The default service wiring can be replaced in tests by injecting fakes or
stubs for these contracts.

## What Chapter 3 Does Not Do

Chapter 3 does not:

* generate a mold
* generate mold halves
* generate cavity geometry
* generate core geometry
* generate a parting line
* generate a parting surface
* generate sliders, lifters, or side cores
* perform mold partitioning
* provide a user interface

## Hand-off To Later Stages

The Chapter 3 report is a decision-support and orchestration artifact for later
engines. Downstream stages can consume:

* the preliminary pull-direction result
* undercut-region and undercut-risk evidence
* structured moldability findings
* overall risk and blocking state
* the early core-or-insert indication

The dedicated Chapter 4 cavity-analysis engine can consume that hand-off
without re-running Chapter 2 or Chapter 3.
