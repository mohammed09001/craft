# Pull Direction Analysis Engine

## Current stage

Chapter 9 - Stage 5D-D

Candidate Filtering Report Output

## What this module does now

- Accepts Analysis Session compatible model input.
- Executes a typed Pull Direction analysis engine.
- Runs an internal pipeline.
- Generates canonical seed candidates:
  - +X
  - -X
  - +Y
  - -Y
  - +Z
  - -Z
- Validates and normalizes candidate direction vectors.
- Filters candidates by validation status:
  - valid candidates become includedCandidates
  - invalid candidates become excludedCandidates
- Exposes filtering results in the Pull Direction report output:
  - filteredCandidates
  - includedCandidates
  - excludedCandidates
  - filtering-related metadata
- Keeps selectedDirection as null.

## Important limitation

The generated candidates are still seed candidates only.

They are not extracted from mesh topology.
They are not extracted from face normals.
They are not scored.
They are not ranked.
No best direction is selected.

## Reserved future stages

- Mesh-based candidate generation.
- Face normal extraction.
- Candidate scoring.
- Candidate ranking.
- Best pull direction selection.
- Viewport overlays.
