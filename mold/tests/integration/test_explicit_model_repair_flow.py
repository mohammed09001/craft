from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from mold_generator_engine.exceptions import EmptyGeometryError
from mold_generator_engine.io.importers.importer import ModelImporter
from mold_generator_engine.io.importers.model_repair import remove_degenerate_faces
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.io.importers.stl_reader import StlReader
from mold_generator_engine.models.imported_model import TopologyValidationStatus
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


def _write_ascii_stl(directory: Path, file_name: str, content: str) -> Path:
    source_path = directory / file_name
    source_path.write_text(content, encoding="utf-8")
    return source_path


def test_explicit_model_repair_flow_keeps_import_and_repair_separate():
    registry = ReaderRegistry()
    registry.register(StlReader())
    importer = ModelImporter(registry)
    with TemporaryDirectory(dir=Path.cwd()) as temp_dir:
        source_path = _write_ascii_stl(
            Path(temp_dir),
            "degenerate_faces.stl",
            """solid sample
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 0 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid sample
""",
        )

        original_model = importer.import_model(source_path)

        assert original_model.source_path == source_path
        assert len(original_model.faces) == 2
        assert len(original_model.warnings) == 1
        assert original_model.warnings[0].code == "degenerate_face"
        assert (
            original_model.processing_decision.status
            is ModelProcessingStatus.REQUIRES_REPAIR
        )

        repair_result = remove_degenerate_faces(original_model)
        repaired_model = repair_result.model

        assert repair_result.removed_face_count == 1
        assert repair_result.removed_face_indices == (1,)
        assert repaired_model is not original_model
        assert len(repaired_model.faces) == 1
        assert repaired_model.warnings == []
        assert repaired_model.warnings is not original_model.warnings
        assert repaired_model.geometry_validation.warnings == ()
        assert (
            repaired_model.topology_validation.status
            is TopologyValidationStatus.COMPLETED
        )
        assert (
            repaired_model.processing_decision.status
            is ModelProcessingStatus.REQUIRES_REPAIR
        )
        assert original_model.faces != repaired_model.faces
        assert len(original_model.faces) == 2
        assert len(original_model.warnings) == 1


def test_explicit_model_repair_propagates_empty_geometry_error():
    registry = ReaderRegistry()
    registry.register(StlReader())
    importer = ModelImporter(registry)
    with TemporaryDirectory(dir=Path.cwd()) as temp_dir:
        source_path = _write_ascii_stl(
            Path(temp_dir),
            "all_degenerate.stl",
            """solid sample
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 0 0 0
    vertex 0 1 0
  endloop
endfacet
facet normal 0 0 1
  outer loop
    vertex 1 0 0
    vertex 2 0 0
    vertex 3 0 0
  endloop
endfacet
endsolid sample
""",
        )

        original_model = importer.import_model(source_path)

        assert len(original_model.faces) == 2
        assert len(original_model.warnings) == 2

        with pytest.raises(EmptyGeometryError):
            remove_degenerate_faces(original_model)
