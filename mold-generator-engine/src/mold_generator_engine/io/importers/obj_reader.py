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


class ObjReader:
    """Reads OBJ files into the internal model format."""

    @property
    def file_format(self) -> ModelFormat:
        """Return the file format supported by this reader."""
        return ModelFormat.OBJ

    def read(self, source_path: Path) -> ImportedModel:
        """Read an OBJ file and return its unified internal representation."""
        self._validate_source_path(source_path)

        file_data = source_path.read_bytes()

        try:
            text = file_data.decode("utf-8")
        except UnicodeDecodeError as error:
            raise CorruptedModelFileError(
                f"OBJ file cannot be decoded as UTF-8 text: {source_path}"
            ) from error

        vertices, faces, face_statement_count = self._parse_text(text)

        if not vertices or not faces:
            raise EmptyGeometryError(
                f"OBJ file contains no usable geometry: {source_path}"
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
            metadata={"obj_face_count": face_statement_count},
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
    def _parse_text(cls, text: str) -> tuple[list[Vertex], list[Face], int]:
        """Parse the vertex and face data from an OBJ document."""
        vertices: list[Vertex] = []
        faces: list[Face] = []
        face_statement_count = 0

        for line_number, line in enumerate(text.splitlines(), start=1):
            stripped_line = line.strip()

            if not stripped_line or stripped_line.startswith("#"):
                continue

            parts = stripped_line.split()
            keyword = parts[0].casefold()

            if keyword == "v":
                vertices.append(cls._parse_vertex(parts, line_number))
                continue

            if keyword == "f":
                faces.extend(cls._parse_face(parts, len(vertices), line_number))
                face_statement_count += 1

        return vertices, faces, face_statement_count

    @classmethod
    def _parse_vertex(cls, parts: list[str], line_number: int) -> Vertex:
        """Parse an OBJ vertex line."""
        if len(parts) != 4:
            raise CorruptedModelFileError(
                f"Invalid OBJ vertex at line {line_number}: expected three coordinates."
            )

        try:
            vertex = Vertex(
                x=float(parts[1]),
                y=float(parts[2]),
                z=float(parts[3]),
            )
        except ValueError as error:
            raise CorruptedModelFileError(
                "Invalid OBJ vertex at "
                f"line {line_number}: coordinates must be numbers."
            ) from error

        cls._validate_vertex(vertex, line_number)

        return vertex

    @classmethod
    def _parse_face(
        cls,
        parts: list[str],
        vertex_count: int,
        line_number: int,
    ) -> list[Face]:
        """Parse and triangulate an OBJ face line."""
        if len(parts) < 4:
            raise CorruptedModelFileError(
                "Invalid OBJ face at "
                f"line {line_number}: expected at least three vertex references."
            )

        face_indices = [
            cls._parse_face_reference(reference, vertex_count, line_number)
            for reference in parts[1:]
        ]

        triangle_faces: list[Face] = []
        first_vertex = face_indices[0]

        for index in range(1, len(face_indices) - 1):
            triangle_faces.append(
                Face(
                    vertex_1=first_vertex,
                    vertex_2=face_indices[index],
                    vertex_3=face_indices[index + 1],
                )
            )

        return triangle_faces

    @staticmethod
    def _parse_face_reference(
        reference: str,
        vertex_count: int,
        line_number: int,
    ) -> int:
        """Parse a single OBJ face vertex reference into a zero-based index."""
        vertex_reference = reference.split("/", 1)[0]

        if not vertex_reference:
            raise CorruptedModelFileError(
                "Invalid OBJ face vertex reference at "
                f"line {line_number}: missing vertex index."
            )

        try:
            obj_index = int(vertex_reference)
        except ValueError as error:
            raise CorruptedModelFileError(
                "Invalid OBJ face vertex reference at "
                f"line {line_number}: vertex indices must be integers."
            ) from error

        if obj_index == 0:
            raise InvalidGeometryDataError(
                "Invalid OBJ face vertex reference at "
                f"line {line_number}: index 0 is not allowed."
            )

        if obj_index > 0:
            vertex_index = obj_index - 1
        else:
            vertex_index = vertex_count + obj_index

        if vertex_index < 0 or vertex_index >= vertex_count:
            raise InvalidGeometryDataError(
                "OBJ face vertex reference is out of range at "
                f"line {line_number}: {obj_index}."
            )

        return vertex_index

    @staticmethod
    def _validate_vertex(vertex: Vertex, line_number: int) -> None:
        """Reject vertex coordinates that are NaN or infinite."""
        if not all(isfinite(value) for value in (vertex.x, vertex.y, vertex.z)):
            raise InvalidGeometryDataError(
                "Invalid OBJ vertex at "
                f"line {line_number}: coordinates must contain finite numbers."
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
