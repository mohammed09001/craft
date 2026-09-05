# Pull Direction Report

Chapter 9 Stage 4 introduces the official Pull Direction report contract for Mold Generator SaaS.

This package is contract-only.

It does not perform:

- Geometry analysis
- Mesh analysis
- Pull direction solving
- Candidate scoring
- Undercut detection
- Draft angle analysis
- Viewport overlays
- Viewport arrows
- Heatmaps

## Purpose

The purpose of this package is to define a stable data shape that future algorithms can produce without forcing the frontend, engine bridge, analysis session pipeline, or dashboard to understand how the result was generated.

Expected future flow:

Algorithm -> PullDirectionReport -> Analysis Session -> Engine Bridge -> Frontend

## Stage 4 contents

Stage 4 adds:

- PullDirectionReport contract
- PullDirectionCandidate contract
- PullDirectionVector3 model
- Pull Direction status model
- Pull Direction statistics model
- Pull Direction execution info
- Pull Direction metadata
- Mock not-analyzed report
- Central-compatible EngineeringReportDefinition
- Analysis Session adapter
- Context Panel card placeholder

## Candidate model

A candidate direction is intentionally modeled as a first-class entity, not as a raw vector.

This allows future versions to add validation state, ranking, confidence, scoring, evaluation notes, and candidate metadata without breaking the rest of the system.

## Frontend behavior in Stage 4

The Context Panel may show a Pull Direction card.

The card is allowed to display placeholder values such as:

- Not Analyzed
- Best Direction: Not available
- Candidates: 0
- Confidence: Not available

The viewport must not show arrows, heatmaps, overlays, or engineering visualization in Stage 4.

## Future Stage 5

Stage 5 may introduce the first Pull Direction algorithm.

That algorithm must output the existing PullDirectionReport shape instead of creating a new frontend-specific or bridge-specific result model.
