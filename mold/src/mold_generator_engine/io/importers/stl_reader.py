import struct
from math import isfinite
from pathlib import Path

from mold_generator_engine.exceptions import (
    CorruptedModelFileError,
    EmptyFileError,
    EmptyGeometryError,
    InvalidFilePathError,
    InvalidGeometryDataError,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)

_BINARY_HEADER_SIZE = 80
_BINARY_TRIANGLE_COUNT_SIZE = 4
_BINARY_PREFIX_SIZE = _BINARY_HEADER_SIZE + _BINARY_TRIANGLE_COUNT_SIZE
_BINARY_TRIANGLE_SIZE = 50
_BINARY_TRIANGLE_STRUCTURE = struct.Struct("<12fH")


class StlReader:
    """Reads ASCII and binary STL files into the internal model format."""

    @property
    def file_format(self) -> ModelFormat:
        """Return the file format supported by this reader."""
        return ModelFormat.STL

    def read(self, source_path: Path) -> ImportedModel:
        """Read an STL file and return its unified internal representation."""
        self._validate_source_path(source_path)

        file_data = source_path.read_bytes()
        stl_encoding = self._detect_encoding(file_data)

        if stl_encoding == "binary":
            vertices, faces = self._parse_binary(file_data)
        else:
            try:
                text = file_data.decode("utf-8")
            except UnicodeDecodeError as error:
                raise CorruptedModelFileError(
                    f"STL file cannot be decoded as ASCII text: {source_path}"
                ) from error

            vertices, faces = self._parse_ascii(text)

        if not vertices or not faces:
            raise EmptyGeometryError(
                f"STL file contains no usable geometry: {source_path}"
            )

        bounding_box = self._calculate_bounding_box(vertices)
        dimensions = self._calculate_dimensions(bounding_box)

        return ImportedModel(
            source_path=source_path,
            source_name=source_path.name,
            file_format=self.file_format,
            vertices=vertices,
            faces=faces,
            bounding_box=bounding_box,
            dimensions=dimensions,
            warnings=[],
            metadata={"stl_encoding": stl_encoding},
        )

    @staticmethod
    def _validate_source_path(source_path: Path) -> None:
        """Validate that the source path points to a non-empty file."""
        if not source_path.exists():
            raise FileNotFoundError(f"Model file does not exist: {source_path}")

        if not source_path.is_file():
            raise InvalidFilePathError(
                f"Model path does not point to a file: {source_path}"
            )

        if source_path.stat().st_size == 0:
            raise EmptyFileError(f"Model file is empty: {source_path}")

    @classmethod
    def _detect_encoding(cls, file_data: bytes) -> str:
        """Detect whether the STL document is binary or ASCII."""
        if cls._looks_like_ascii(file_data):
            return "ascii"

        if len(file_data) >= _BINARY_PREFIX_SIZE:
            return "binary"

        return "ascii"

    @staticmethod
    def _looks_like_ascii(file_data: bytes) -> bool:
        """Return whether the data has the basic structure of ASCII STL."""
        try:
            text = file_data.decode("utf-8")
        except UnicodeDecodeError:
            return False

        if "\x00" in text:
            return False

        normalized_text = text.lstrip().casefold()

        return (
            normalized_text.startswith("solid")
            and "facet" in normalized_text
            and "vertex" in normalized_text
        )

    @classmethod
    def _parse_ascii(cls, text: str) -> tuple[list[Vertex], list[Face]]:
        """Parse vertex data from an ASCII STL document."""
        vertices: list[Vertex] = []
        faces: list[Face] = []
        vertex_indices: dict[Vertex, int] = {}
        current_face: list[int] = []

        for line_number, line in enumerate(text.splitlines(), start=1):
            parts = line.split()

            if not parts or parts[0].casefold() != "vertex":
                continue

            if len(parts) != 4:
                raise CorruptedModelFileError(
                    "Invalid ASCII STL vertex at "
                    f"line {line_number}: expected three coordinates."
                )

            try:
                vertex = Vertex(
                    x=float(parts[1]),
                    y=float(parts[2]),
                    z=float(parts[3]),
                )
            except ValueError as error:
                raise CorruptedModelFileError(
                    "Invalid ASCII STL vertex at "
                    f"line {line_number}: coordinates must be numbers."
                ) from error

            cls._validate_vertex(vertex)

            if vertex not in vertex_indices:
                vertex_indices[vertex] = len(vertices)
                vertices.append(vertex)

            current_face.append(vertex_indices[vertex])

            if len(current_face) == 3:
                faces.append(
                    Face(
                        vertex_1=current_face[0],
                        vertex_2=current_face[1],
                        vertex_3=current_face[2],
                    )
                )
                current_face = []

        if current_face:
            raise CorruptedModelFileError(
                "Invalid ASCII STL: an incomplete triangle was found."
            )

        return vertices, faces

    @classmethod
    def _parse_binary(
        cls,
        file_data: bytes,
    ) -> tuple[list[Vertex], list[Face]]:
        """Parse triangle data from a binary STL document."""
        triangle_count = struct.unpack_from(
            "<I",
            file_data,
            _BINARY_HEADER_SIZE,
        )[0]

        expected_size = _BINARY_PREFIX_SIZE + triangle_count * _BINARY_TRIANGLE_SIZE

        if len(file_data) != expected_size:
            raise CorruptedModelFileError(
                "Binary STL file size does not match its declared "
                f"triangle count: expected {expected_size} bytes, "
                f"received {len(file_data)} bytes."
            )

        vertices: list[Vertex] = []
        faces: list[Face] = []
        vertex_indices: dict[Vertex, int] = {}

        for triangle_number in range(triangle_count):
            offset = _BINARY_PREFIX_SIZE + triangle_number * _BINARY_TRIANGLE_SIZE

            triangle_data = _BINARY_TRIANGLE_STRUCTURE.unpack_from(
                file_data,
                offset,
            )

            triangle_vertices = (
                Vertex(
                    x=triangle_data[3],
                    y=triangle_data[4],
                    z=triangle_data[5],
                ),
                Vertex(
                    x=triangle_data[6],
                    y=triangle_data[7],
                    z=triangle_data[8],
                ),
                Vertex(
                    x=triangle_data[9],
                    y=triangle_data[10],
                    z=triangle_data[11],
                ),
            )

            face_indices: list[int] = []

            for vertex in triangle_vertices:
                cls._validate_vertex(vertex)

                if vertex not in vertex_indices:
                    vertex_indices[vertex] = len(vertices)
                    vertices.append(vertex)

                face_indices.append(vertex_indices[vertex])

            faces.append(
                Face(
                    vertex_1=face_indices[0],
                    vertex_2=face_indices[1],
                    vertex_3=face_indices[2],
                )
            )

        return vertices, faces

    @staticmethod
    def _validate_vertex(vertex: Vertex) -> None:
        """Reject vertex coordinates that are NaN or infinite."""
        if not all(isfinite(value) for value in (vertex.x, vertex.y, vertex.z)):
            raise InvalidGeometryDataError(
                "STL vertex coordinates must contain finite numbers."
            )

    @staticmethod
    def _calculate_bounding_box(vertices: list[Vertex]) -> BoundingBox:
        """Calculate the minimum and maximum coordinates of the model."""
        return BoundingBox(
            minimum=Vertex(
                x=min(vertex.x for vertex in vertices),
                y=min(vertex.y for vertex in vertices),
                z=min(vertex.z for vertex in vertices),
            ),
            maximum=Vertex(
                x=max(vertex.x for vertex in vertices),
                y=max(vertex.y for vertex in vertices),
                z=max(vertex.z for vertex in vertices),
            ),
        )

    @staticmethod
    def _calculate_dimensions(bounding_box: BoundingBox) -> Dimensions:
        """Calculate model dimensions from its bounding box."""
        return Dimensions(
            x=bounding_box.maximum.x - bounding_box.minimum.x,
            y=bounding_box.maximum.y - bounding_box.minimum.y,
            z=bounding_box.maximum.z - bounding_box.minimum.z,
        )
