from pathlib import Path

from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    GeometryValidationResult,
    ImportedModel,
    ImportWarning,
    ModelFormat,
    TopologyValidationStatus,
    Vertex,
)
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


def test_imported_model_stores_import_data():
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=10.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=5.0, z=0.0),
    ]
    faces = [Face(vertex_1=0, vertex_2=1, vertex_3=2)]
    bounding_box = BoundingBox(
        minimum=Vertex(x=0.0, y=0.0, z=0.0),
        maximum=Vertex(x=10.0, y=5.0, z=0.0),
    )
    dimensions = Dimensions(x=10.0, y=5.0, z=0.0)
    warnings = [
        ImportWarning(
            code="duplicate_vertices",
            message="The imported mesh contains duplicate vertices.",
        )
    ]

    model = ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=faces,
        bounding_box=bounding_box,
        dimensions=dimensions,
        warnings=warnings,
        metadata={"solid_name": "sample"},
    )

    assert model.source_path == Path("models/sample.stl")
    assert model.source_name == "sample.stl"
    assert model.file_format is ModelFormat.STL
    assert model.vertices == vertices
    assert model.faces == faces
    assert model.bounding_box == bounding_box
    assert model.dimensions == dimensions
    assert model.warnings == warnings
    assert model.metadata == {"solid_name": "sample"}
    assert model.geometry_validation == GeometryValidationResult(
        warnings=tuple(warnings),
    )
    assert model.topology_validation.status is TopologyValidationStatus.NOT_RUN
    assert model.statistics is None
    assert model.initial_moldability_assessment is None
    assert model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
