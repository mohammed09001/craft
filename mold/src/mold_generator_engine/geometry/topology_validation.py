from mold_generator_engine.geometry.model_topology import ModelTopologyAnalysis
from mold_generator_engine.models.issues import TopologyIssue


def collect_topology_issues(
    analysis: ModelTopologyAnalysis,
) -> tuple[TopologyIssue, ...]:
    """Translate neutral topology facts into reusable structured issues."""
    issues: list[TopologyIssue] = []

    if analysis.boundary_edges:
        issues.append(
            TopologyIssue(
                code="open_boundary_edges",
                message=("Model contains open boundary edges and is not watertight."),
                metadata={
                    "edge_count": len(analysis.boundary_edges),
                    "edges": analysis.boundary_edges,
                },
            )
        )

    if analysis.non_manifold_edges:
        issues.append(
            TopologyIssue(
                code="non_manifold_edges",
                message="Model contains non-manifold edges.",
                metadata={
                    "edge_count": len(analysis.non_manifold_edges),
                    "edges": analysis.non_manifold_edges,
                },
            )
        )

    if analysis.isolated_vertices:
        issues.append(
            TopologyIssue(
                code="isolated_vertices",
                message="Model contains isolated vertices that are not used by faces.",
                metadata={
                    "vertex_count": len(analysis.isolated_vertices),
                    "vertex_indices": analysis.isolated_vertices,
                },
            )
        )

    if analysis.duplicate_faces:
        issues.append(
            TopologyIssue(
                code="duplicate_faces",
                message="Model contains duplicate triangle faces.",
                metadata={
                    "face_count": len(analysis.duplicate_faces),
                    "face_keys": analysis.duplicate_faces,
                },
            )
        )

    if analysis.connected_component_count > 1:
        issues.append(
            TopologyIssue(
                code="multiple_connected_components",
                message="Model contains multiple disconnected face components.",
                metadata={
                    "component_count": analysis.connected_component_count,
                },
            )
        )

    return tuple(issues)
