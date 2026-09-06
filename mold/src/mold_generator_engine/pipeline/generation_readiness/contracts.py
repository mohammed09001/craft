from __future__ import annotations

from typing import Protocol

from mold_generator_engine.models.generation_readiness import (
    GenerationReadinessReport,
)
from mold_generator_engine.models.mold_generation import MoldGenerationContext


class GenerationReadinessAnalyzer(Protocol):
    """Contract for producing the final Chapter 9 hand-off contract."""

    def analyze(
        self,
        context: MoldGenerationContext,
    ) -> GenerationReadinessReport:
        """Build a generation-ready Chapter 9 report without creating mold geometry."""
