from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from mold_generator_engine.exceptions import ModelImportError
from mold_generator_engine.io.importers.importer import ModelImporter
from mold_generator_engine.io.importers.obj_reader import ObjReader
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.io.importers.stl_reader import StlReader
from mold_generator_engine.models.import_analysis_report import ImportAnalysisReport
from mold_generator_engine.pipeline.import_analysis.builder import (
    ImportAnalysisReportBuilder,
)


@dataclass(frozen=True, slots=True)
class ImportAnalysisService:
    """Run the existing import pipeline and return a unified report."""

    importer: ModelImporter
    report_builder: ImportAnalysisReportBuilder = field(
        default_factory=ImportAnalysisReportBuilder
    )

    @classmethod
    def from_default_readers(cls) -> ImportAnalysisService:
        """Build a service configured with the project's default readers."""
        registry = ReaderRegistry()
        registry.register(StlReader())
        registry.register(ObjReader())
        return cls(importer=ModelImporter(registry))

    def analyze(self, source_path: Path) -> ImportAnalysisReport:
        """Import the model and return a unified import-analysis report."""
        try:
            model = self.importer.import_model(source_path)
        except (ModelImportError, OSError) as error:
            return self.report_builder.build_from_error(source_path, error)

        return self.report_builder.build_from_model(model)
