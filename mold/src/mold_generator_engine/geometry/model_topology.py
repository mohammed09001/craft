from collections import Counter, defaultdict
from dataclasses import dataclass

from mold_generator_engine.models.imported_model import Face, ImportedModel

Edge = tuple[int, int]
FaceKey = tuple[int, int, int]


@dataclass(frozen=True)
class ModelTopologyAnalysis:
    """Neutral topology facts calculated from an imported indexed triangle mesh."""

    vertex_count: int
    face_count: int
    analyzed_face_count: int
    excluded_degenerate_face_count: int
    unique_edge_count: int
    boundary_edges: tuple[Edge, ...]
    non_manifold_edges: tuple[Edge, ...]
    isolated_vertices: tuple[int, ...]
    duplicate_faces: tuple[FaceKey, ...]
    connected_component_count: int


def analyze_model_topology(model: ImportedModel) -> ModelTopologyAnalysis:
    """Analyze mesh topology using indexed triangle connectivity only.

    Topology collection is approximately linear in the number of faces and
    unique edges, with additional sorting costs for deterministic output.
    """
    referenced_vertices: set[int] = set()
    edge_face_indices: dict[Edge, list[int]] = defaultdict(list)
    canonical_face_keys: list[FaceKey] = []
    analyzed_face_count = 0
    excluded_degenerate_face_count = 0

    for face in model.faces:
        if _is_topologically_degenerate_face(face):
            excluded_degenerate_face_count += 1
            continue

        analyzed_face_index = analyzed_face_count
        analyzed_face_count += 1

        referenced_vertices.update((face.vertex_1, face.vertex_2, face.vertex_3))
        canonical_face_keys.append(_canonical_face_key(face))

        for edge in _iter_face_edges(face):
            edge_face_indices[edge].append(analyzed_face_index)

    duplicate_faces = tuple(
        sorted(
            face_key
            for face_key, count in Counter(canonical_face_keys).items()
            if count > 1
        )
    )
    boundary_edges = tuple(
        sorted(
            edge
            for edge, face_indices in edge_face_indices.items()
            if len(face_indices) == 1
        )
    )
    non_manifold_edges = tuple(
        sorted(
            edge
            for edge, face_indices in edge_face_indices.items()
            if len(face_indices) >= 3
        )
    )
    isolated_vertices = tuple(
        vertex_index
        for vertex_index in range(len(model.vertices))
        if vertex_index not in referenced_vertices
    )

    return ModelTopologyAnalysis(
        vertex_count=len(model.vertices),
        face_count=len(model.faces),
        analyzed_face_count=analyzed_face_count,
        excluded_degenerate_face_count=excluded_degenerate_face_count,
        unique_edge_count=len(edge_face_indices),
        boundary_edges=boundary_edges,
        non_manifold_edges=non_manifold_edges,
        isolated_vertices=isolated_vertices,
        duplicate_faces=duplicate_faces,
        connected_component_count=_count_connected_components(
            analyzed_face_count,
            edge_face_indices,
        ),
    )


def collect_unique_edges(faces: list[Face]) -> tuple[Edge, ...]:
    """Return sorted unique non-zero-length indexed edges across all faces."""
    unique_edges: set[Edge] = set()

    for face in faces:
        unique_edges.update(
            edge for edge in _iter_face_edges(face) if edge[0] != edge[1]
        )

    return tuple(sorted(unique_edges))


def _is_topologically_degenerate_face(face: Face) -> bool:
    """Return whether a face repeats at least one vertex index."""
    return len({face.vertex_1, face.vertex_2, face.vertex_3}) < 3


def _canonical_edge(vertex_a: int, vertex_b: int) -> Edge:
    return (vertex_a, vertex_b) if vertex_a < vertex_b else (vertex_b, vertex_a)


def _canonical_face_key(face: Face) -> FaceKey:
    return tuple(sorted((face.vertex_1, face.vertex_2, face.vertex_3)))


def _iter_face_edges(face: Face) -> tuple[Edge, Edge, Edge]:
    return (
        _canonical_edge(face.vertex_1, face.vertex_2),
        _canonical_edge(face.vertex_2, face.vertex_3),
        _canonical_edge(face.vertex_3, face.vertex_1),
    )


def _count_connected_components(
    analyzed_face_count: int,
    edge_face_indices: dict[Edge, list[int]],
) -> int:
    if analyzed_face_count == 0:
        return 0

    parents = list(range(analyzed_face_count))
    ranks = [0] * analyzed_face_count

    for face_indices in edge_face_indices.values():
        if len(face_indices) < 2:
            continue

        first_face_index = face_indices[0]

        for other_face_index in face_indices[1:]:
            _union(parents, ranks, first_face_index, other_face_index)

    roots = {_find(parents, face_index) for face_index in range(analyzed_face_count)}

    return len(roots)


def _find(parents: list[int], face_index: int) -> int:
    while parents[face_index] != face_index:
        parents[face_index] = parents[parents[face_index]]
        face_index = parents[face_index]

    return face_index


def _union(
    parents: list[int],
    ranks: list[int],
    first_face_index: int,
    second_face_index: int,
) -> None:
    first_root = _find(parents, first_face_index)
    second_root = _find(parents, second_face_index)

    if first_root == second_root:
        return

    if ranks[first_root] < ranks[second_root]:
        parents[first_root] = second_root
        return

    if ranks[first_root] > ranks[second_root]:
        parents[second_root] = first_root
        return

    parents[second_root] = first_root
    ranks[first_root] += 1
