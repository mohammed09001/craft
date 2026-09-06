from mold_generator_engine.exceptions import (
    ReaderAlreadyRegisteredError,
    UnsupportedModelFormatError,
)
from mold_generator_engine.io.importers.reader import ModelReader
from mold_generator_engine.models.imported_model import ModelFormat


class ReaderRegistry:
    """Stores model readers and returns them by supported file format."""

    def __init__(self) -> None:
        self._readers: dict[ModelFormat, ModelReader] = {}

    def register(self, reader: ModelReader) -> None:
        """Register a reader for its supported model format."""
        if reader.file_format in self._readers:
            raise ReaderAlreadyRegisteredError(
                f"A reader is already registered for {reader.file_format.value}."
            )

        self._readers[reader.file_format] = reader

    def get(self, file_format: ModelFormat) -> ModelReader:
        """Return the reader registered for the requested model format."""
        try:
            return self._readers[file_format]
        except KeyError:
            raise UnsupportedModelFormatError(
                f"No reader is registered for {file_format.value}."
            ) from None
