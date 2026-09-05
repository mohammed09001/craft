from pathlib import Path

import pytest

from mold_generator_engine.exceptions import (
    ReaderAlreadyRegisteredError,
    UnsupportedModelFormatError,
)
from mold_generator_engine.io.importers.reader import ModelReader
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.models.imported_model import ImportedModel, ModelFormat


class FakeReader:
    def __init__(self, file_format: ModelFormat) -> None:
        self._file_format = file_format

    @property
    def file_format(self) -> ModelFormat:
        return self._file_format

    def read(self, source_path: Path) -> ImportedModel:
        raise NotImplementedError


def test_registry_registers_and_returns_reader():
    registry = ReaderRegistry()
    reader: ModelReader = FakeReader(ModelFormat.STL)

    registry.register(reader)

    assert registry.get(ModelFormat.STL) is reader


def test_registry_rejects_duplicate_format():
    registry = ReaderRegistry()
    first_reader: ModelReader = FakeReader(ModelFormat.STL)
    second_reader: ModelReader = FakeReader(ModelFormat.STL)

    registry.register(first_reader)

    with pytest.raises(ReaderAlreadyRegisteredError):
        registry.register(second_reader)


def test_registry_rejects_unregistered_format():
    registry = ReaderRegistry()

    with pytest.raises(UnsupportedModelFormatError):
        registry.get(ModelFormat.OBJ)
