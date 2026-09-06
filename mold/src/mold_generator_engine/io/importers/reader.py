from pathlib import Path
from typing import Protocol, runtime_checkable

from mold_generator_engine.models.imported_model import ImportedModel, ModelFormat


@runtime_checkable
class ModelReader(Protocol):
    """Contract implemented by all 3D model file readers."""

    @property
    def file_format(self) -> ModelFormat:
        """Return the model format supported by this reader."""
        ...

    def read(self, source_path: Path) -> ImportedModel:
        """Read a model file and return the unified internal representation."""
        ...
