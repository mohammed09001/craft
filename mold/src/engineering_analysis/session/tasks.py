from __future__ import annotations

from typing import Protocol

from .models import AnalysisReport, AnalysisSession


class AnalysisTask(Protocol):
    @property
    def analysis_id(self) -> str: ...

    @property
    def title(self) -> str: ...

    def run(self, session: AnalysisSession) -> AnalysisReport: ...
