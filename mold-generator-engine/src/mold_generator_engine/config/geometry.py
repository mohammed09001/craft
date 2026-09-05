"""Shared geometry configuration values.

The engine uses millimeters as its internal linear unit.
"""

DEFAULT_LINEAR_TOLERANCE_MM = 1e-6
"""Minimum meaningful linear extent before a dimension is treated as zero."""

DEFAULT_FACE_DEGENERACY_AREA_TOLERANCE_SQ_MM = 1e-12
"""Maximum triangle area treated as degenerate during face analysis."""

DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE = 1e-6
"""Maximum component delta used when merging equivalent unit directions."""

DEFAULT_PULL_DIRECTION_ALIGNMENT_TOLERANCE = 1e-6
"""Maximum signed-alignment magnitude treated as neutral to the pull axis."""

DEFAULT_MINIMUM_RECOMMENDED_DRAFT_DEGREES = 3.0
"""Default minimum local draft target used for engineering scoring."""
