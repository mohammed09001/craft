# Issue Severity Policy

## Purpose

The engine separates three concerns when reporting model problems:

1. Detection
   Geometry validators, topology analyzers, readers, and future repair or mold
   checks report facts such as issue codes, messages, and related metadata.
2. Classification
   A centralized severity policy maps issue codes to severity levels.
3. Decisions
   The import pipeline or later mold-generation pipeline decides whether work
   may continue based on the classified issues.

Keeping these concerns separate allows the engine to reuse the same detectors
with different downstream policies when requirements change.

## Severity Levels

The default policy uses four severity levels:

* `INFO`
  An observation that does not make the model unreliable.
* `WARNING`
  A non-blocking quality issue. Review or repair may still be useful.
* `ERROR`
  A problem that makes reliable mold generation unsafe or unreliable.
* `CRITICAL`
  A structurally invalid or unsafe condition where geometry processing should
  stop as early as possible.

## Blocking Behavior

The default blocking severities are:

* `ERROR`
* `CRITICAL`

Warnings do not block import. Import can still return a model with blocking
issues so later stages can inspect the diagnostics, but downstream manufacturing
steps should not proceed until the blocking issues are resolved.

## Default Mapping Ownership

The default mapping lives in `DefaultIssueSeverityPolicy`. Severity rules must
not be duplicated inside STL readers, OBJ readers, geometry validators, topology
analyzers, or the import coordinator.

Unknown issue codes are classified as `ERROR` by default. This is intentional:
new diagnostics must be reviewed and assigned explicitly instead of silently
falling back to a harmless severity.

## Current Topology and Geometry Flow

* Shared geometry validation reports issue codes and messages.
* Topology analysis remains a neutral fact collector.
* A topology validation layer converts those facts into issue objects.
* The centralized policy assigns severity.
* The unified import result exposes the classified issues and summary helpers.

## Adding Future Issue Codes

When introducing a new issue code:

1. Add the detector output without embedding severity logic in the detector.
2. Add the code to the default severity policy.
3. Decide whether the issue should be blocking under the current policy.
4. Add or update focused automated tests.
5. Update this document if the new code changes the policy model materially.

Severity classification is intentionally not the final processing decision.
The processing-suitability layer is documented separately in
`docs/model-processing-suitability.md`.
