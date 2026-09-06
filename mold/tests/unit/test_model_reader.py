from pathlib import Path

from mold_generator_engine.io.importers.reader import ModelReader
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)


class FakeStlReader:
    @property
    def file_format(self) -> ModelFormat:
        return ModelFormat.STL

    def read(self, source_path: Path) -> ImportedModel:
        return ImportedModel(
            source_path=source_path,
            source_name=source_path.name,
            file_format=self.file_format,
            vertices=[
                Vertex(x=0.0, y=0.0, z=0.0),
                Vertex(x=1.0, y=0.0, z=0.0),
                Vertex(x=0.0, y=1.0, z=0.0),
            ],
            faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
            bounding_box=BoundingBox(
                minimum=Vertex(x=0.0, y=0.0, z=0.0),
                maximum=Vertex(x=1.0, y=1.0, z=0.0),
            ),
            dimensions=Dimensions(x=1.0, y=1.0, z=0.0),
            warnings=[],
            metadata={},
        )


def test_reader_matches_model_reader_contract():
    reader = FakeStlReader()
    source_path = Path("models/sample.stl")

    model = reader.read(source_path)

    assert isinstance(reader, ModelReader)
    assert reader.file_format is ModelFormat.STL
    assert model.source_path == source_path
    assert model.file_format is ModelFormat.STL
