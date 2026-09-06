from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from mold_generator_engine.models.imported_model import Face, ImportedModel

Edge = tuple[int, int]


@dataclass(frozen=True, slots=True)
class FaceAdjacencyGraph:
    """Deterministic face-neighbor graph built from shared indexed edges."""

    face_count: int
    neighbors_by_face_index: tuple[tuple[int, ...], ...]
    edges_by_face_index: tuple[tuple[Edge, ...], ...]
    face_indices_by_edge: dict[Edge, tuple[int, ...]] = field(
        default_factory=dict,
        hash=False,
        compare=False,
    )
    boundary_edges: tuple[Edge, ...] = ()
    non_manifold_edges: tuple[Edge, ...] = ()

    def neighbors(self, face_index: int) -> tuple[int, ...]:
        """Return the sorted neighboring face indices for one face."""
        return self.neighbors_by_face_index[face_index]

    def face_edges(self, face_index: int) -> tuple[Edge, ...]:
        """Return the canonical indexed edges owned by one face."""
        return self.edges_by_face_index[face_index]

    def edge_faces(self, edge: Edge) -> tuple[int, ...]:
        """Return the sorted face indices that reference one canonical edge."""
        return self.face_indices_by_edge.get(edge, ())


def build_face_adjacency_graph(model: ImportedModel) -> FaceAdjacencyGraph:
    """Return face adjacency using shared edges without mutating the mesh."""
    edge_to_face_indices: dict[Edge, list[int]] = defaultdict(list)
    edges_by_face_index: list[tuple[Edge, ...]] = [() for _ in model.faces]

    for face_index, face in enumerate(model.faces):
        if _is_degenerate_face(face):
            continue

        face_edges = _iter_face_edges(face)
        edges_by_face_index[face_index] = face_edges

        for edge in face_edges:
            edge_to_face_indices[edge].append(face_index)

    neighbors_by_face_index: list[set[int]] = [set() for _ in model.faces]

    for face_indices in edge_to_face_indices.values():
        if len(face_indices) < 2:
            continue

        sorted_face_indices = sorted(face_indices)
        for index, face_index in enumerate(sorted_face_indices):
            for other_face_index in sorted_face_indices[index + 1 :]:
                neighbors_by_face_index[face_index].add(other_face_index)
                neighbors_by_face_index[other_face_index].add(face_index)

    face_indices_by_edge = {
        edge: tuple(sorted(face_indices))
        for edge, face_indices in edge_to_face_indices.items()
    }
    boundary_edges = tuple(
        sorted(
            edge
            for edge, face_indices in face_indices_by_edge.items()
            if len(face_indices) == 1
        )
    )
    non_manifold_edges = tuple(
        sorted(
            edge
            for edge, face_indices in face_indices_by_edge.items()
            if len(face_indices) >= 3
        )
    )

    return FaceAdjacencyGraph(
        face_count=len(model.faces),
        neighbors_by_face_index=tuple(
            tuple(sorted(neighbors)) for neighbors in neighbors_by_face_index
        ),
        edges_by_face_index=tuple(edges_by_face_index),
        face_indices_by_edge=face_indices_by_edge,
        boundary_edges=boundary_edges,
        non_manifold_edges=non_manifold_edges,
    )


def _is_degenerate_face(face: Face) -> bool:
    return len({face.vertex_1, face.vertex_2, face.vertex_3}) < 3


def _iter_face_edges(face: Face) -> tuple[Edge, Edge, Edge]:
    return (
        _canonical_edge(face.vertex_1, face.vertex_2),
        _canonical_edge(face.vertex_2, face.vertex_3),
        _canonical_edge(face.vertex_3, face.vertex_1),
    )


def _canonical_edge(first_vertex_index: int, second_vertex_index: int) -> Edge:
    if first_vertex_index <= second_vertex_index:
        return (first_vertex_index, second_vertex_index)

    return (second_vertex_index, first_vertex_index)
