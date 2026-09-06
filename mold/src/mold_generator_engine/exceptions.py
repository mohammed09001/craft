class ModelImportError(Exception):
    """Base error for model import operations."""


class InvalidFilePathError(ModelImportError):
    """Raised when the provided model file path is invalid."""


class FileAccessError(ModelImportError):
    """Raised when a model file cannot be opened or read."""


class EmptyFileError(ModelImportError):
    """Raised when a model file contains no data."""


class CorruptedModelFileError(ModelImportError):
    """Raised when a model file cannot be parsed correctly."""


class EmptyGeometryError(ModelImportError):
    """Raised when a model file contains no usable geometry."""


class InvalidGeometryDataError(ModelImportError):
    """Raised when imported geometry contains invalid data."""


class UnsupportedModelFormatError(ModelImportError):
    """Raised when no reader is registered for a model format."""


class ReaderAlreadyRegisteredError(ModelImportError):
    """Raised when a reader is already registered for a model format."""


class UnsupportedFileExtensionError(ModelImportError):
    """Raised when a file extension cannot be mapped to a supported format."""


class DetailedMoldAnalysisError(Exception):
    """Base error for detailed mold-analysis domain operations."""


class InvalidVectorError(DetailedMoldAnalysisError):
    """Raised when a 3D direction vector is not finite or cannot be normalized."""
