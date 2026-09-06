# Model Processing Suitability

## Purpose

The engine now exposes a unified processing decision after import diagnostics
have been collected and severity has already been classified.

This decision is separate from issue detection and separate from issue
severity:

* Detection reports facts.
* Severity describes how serious each fact is.
* Processing suitability decides whether the current pipeline may continue.

## Statuses

The unified decision uses four statuses:

* `READY`
  The current diagnostics do not block processing.
  Informational issues alone still allow this status.
* `READY_WITH_WARNINGS`
  Processing may continue, but warnings should be preserved and shown.
* `REQUIRES_REPAIR`
  Processing must stop for now because the model has blocking but potentially
  recoverable issues in the current path.
  This status does not mean that any repair has already been performed.
* `REJECTED`
  The current path must reject the model because an unrecoverable issue was
  found for the engine's present capabilities.
  This is a decision about the current pipeline, not an eternal judgment about
  the file.

## Priority Rules

Decision priority is:

1. `REJECTED`
2. `REQUIRES_REPAIR`
3. `READY_WITH_WARNINGS`
4. `READY`

If multiple issues exist, the highest-priority outcome wins.

## Default Current Policy

The default policy currently treats these issue effects as:

* Repairable: `degenerate_face`, `open_boundary_edges`
* Rejected: `missing_vertices`, `missing_faces`, `face_index_out_of_range`,
  `non_manifold_edges`
* Warning-only: `isolated_vertices`, `duplicate_faces`,
  `multiple_connected_components`

Unknown issue codes fall back conservatively by severity:

* `INFO` -> `READY`
* `WARNING` -> `READY_WITH_WARNINGS`
* `ERROR` -> `REQUIRES_REPAIR`
* `CRITICAL` -> `REJECTED`

## Integration Notes

The decision is evaluated from the current diagnostics on the model instead of
being stored as mutable state. That avoids stale decisions after diagnostics are
refreshed or after repair updates the model.
