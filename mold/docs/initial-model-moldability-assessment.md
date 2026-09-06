# Initial Model Moldability Assessment

## Purpose

The import pipeline now exposes a preliminary readiness assessment after shared
geometry validation, topology analysis, processing suitability, and basic model
statistics have already been collected.

This assessment is intentionally narrow. It does not declare that a model is
fully moldable. It only answers whether the current imported model is ready to
enter later mold-analysis stages, needs repair first, is preliminarily
unsuitable as a meaningful 3D solid candidate, or cannot yet be assessed
reliably.

## What It Reuses

The assessment reuses existing pipeline results instead of re-reading the
source file or duplicating earlier analysis:

* geometry validation results
* topology validation results
* unified processing suitability
* basic model statistics

## Statuses

* `READY_FOR_DETAILED_ANALYSIS`
  The current import diagnostics allow later mold-analysis stages to run.
* `REQUIRES_REPAIR`
  Geometry or topology issues must be repaired before advanced mold analysis.
* `PRELIMINARILY_UNSUITABLE`
  The model is not a meaningful 3D solid candidate, for example because one
  extent is zero or near zero within the configured millimeter tolerance.
* `NOT_ASSESSABLE`
  The currently available data is missing or invalid, or the current import
  path already rejects the model.

## Current Rules

The default analyzer currently applies these high-level rules:

* rejected processing suitability -> `NOT_ASSESSABLE`
* missing geometry or missing statistics -> `NOT_ASSESSABLE`
* non-finite dimensions or statistics -> `NOT_ASSESSABLE`
* zero or near-zero extent -> `PRELIMINARILY_UNSUITABLE`
* open mesh or blocking geometry issues -> `REQUIRES_REPAIR`
* otherwise -> `READY_FOR_DETAILED_ANALYSIS`

Reason findings are returned as structured records with a code, severity,
message, and optional metadata. Findings are sorted deterministically so tests
and downstream consumers receive stable output.

## Current Non-Goals

The assessment does not yet implement:

* draft-angle analysis
* undercut detection
* parting-direction selection
* parting-line detection
* wall-thickness analysis
* internal-cavity analysis
* core feasibility analysis
* mold complexity scoring
