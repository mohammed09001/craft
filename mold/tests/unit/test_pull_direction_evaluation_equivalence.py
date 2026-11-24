"""The candidate-evaluation loop must give exactly what evaluating each face on its own gives.

``PullDirectionEvaluator`` works the per-face facts out once for all candidates and runs one flat loop per candidate. The tests
below rebuild every candidate evaluation the original, face-by-face way (``_evaluate_face`` per face and the original
accumulation) and compare the whole result with ``==``: exact floats, exact objects.
"""

from __future__ import annotations

import math
import random

import pytest

from mold_generator_engine.geometry import Vector3D
from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    FaceGeometry,
    FaceGeometryAnalysis,
    PullDirectionAggregateMetrics,
    PullDirectionCandidate,
    PullDirectionCandidates,
    PullDirectionEvaluationSettings,
    PullDirectionEvaluationWarning,
    PullDirectionEvaluationWarningCode,
    PullDirectionSideClassification,
    PullDirectionSource,
    PullDirectionSourceReference,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.evaluation import (
    FaceEvaluationsNotRetainedError,
    PullDirectionEvaluator,
    UnretainedFaceEvaluations,
    _evaluate_face,
    _normalize_candidate_direction,
    _safe_ratio,
)


def _reference_evaluation(
    evaluator: PullDirectionEvaluator,
    face_analysis: FaceGeometryAnalysis,
    candidate: PullDirectionCandidate,
) -> CandidatePullDirectionEvaluation:
    """The original evaluate_candidate: one ``_evaluate_face`` call per face, then the original accumulation."""
    unit = _normalize_candidate_direction(candidate.direction)
    face_evaluations = []
    warnings = []
    analyzed = ignored = faces_meeting = 0
    total = positive = negative = neutral = low = weighted = 0.0
    minimum = None
    for face in face_analysis.faces:
        e = _evaluate_face(
            face=face, unit_pull_direction=unit, settings=evaluator.settings
        )
        face_evaluations.append(e)
        if not e.is_analyzable:
            ignored += 1
            continue
        analyzed += 1
        total += e.face_area_sq_mm
        if e.side_classification is PullDirectionSideClassification.POSITIVE:
            positive += e.face_area_sq_mm
        elif e.side_classification is PullDirectionSideClassification.NEGATIVE:
            negative += e.face_area_sq_mm
        else:
            neutral += e.face_area_sq_mm
        if e.draft_angle_degrees is not None:
            weighted += e.face_area_sq_mm * e.draft_angle_degrees
            minimum = (
                e.draft_angle_degrees
                if minimum is None
                else min(minimum, e.draft_angle_degrees)
            )
        if e.meets_recommended_draft:
            faces_meeting += 1
        else:
            low += e.face_area_sq_mm
    if ignored > 0:
        warnings.append(
            PullDirectionEvaluationWarning(
                code=PullDirectionEvaluationWarningCode.NON_ANALYZABLE_FACES_IGNORED,
                message=(
                    "One or more faces were ignored because they did not provide "
                    "finite positive-area local geometry for pull-direction evaluation."
                ),
                metadata={"ignored_face_count": ignored},
            )
        )
    is_evaluable = total > 0.0
    if not is_evaluable:
        warnings.append(
            PullDirectionEvaluationWarning(
                code=PullDirectionEvaluationWarningCode.NO_ANALYZABLE_FACE_AREA,
                message="Candidate pull-direction evaluation could not find any analyzable positive-area faces.",
            )
        )
    metrics = PullDirectionAggregateMetrics(
        analyzed_face_count=analyzed,
        ignored_face_count=ignored,
        total_analyzed_area_sq_mm=total,
        positive_side_area_sq_mm=positive,
        negative_side_area_sq_mm=negative,
        neutral_area_sq_mm=neutral,
        positive_side_area_ratio=_safe_ratio(positive, total),
        negative_side_area_ratio=_safe_ratio(negative, total),
        neutral_area_ratio=_safe_ratio(neutral, total),
        low_draft_area_sq_mm=low,
        low_draft_area_ratio=_safe_ratio(low, total),
        area_weighted_mean_draft_angle_degrees=_safe_ratio(weighted, total),
        minimum_observed_draft_angle_degrees=minimum,
        faces_meeting_recommended_draft_count=faces_meeting,
    )
    score = evaluator.scoring_policy.score(
        face_evaluations=tuple(face_evaluations),
        aggregate_metrics=metrics,
        settings=evaluator.settings,
    )
    return CandidatePullDirectionEvaluation(
        candidate=candidate,
        aggregate_metrics=metrics,
        engineering_score=score,
        is_evaluable=is_evaluable,
        face_evaluations=tuple(face_evaluations),
        warnings=tuple(warnings),
    )


def _same(
    actual: CandidatePullDirectionEvaluation, expected: CandidatePullDirectionEvaluation
) -> None:
    """Exact equality, also for faces whose area is NaN (Python 3.13 compares dataclass fields with ==, and nan != nan)."""
    assert repr(actual) == repr(
        expected
    )  # every float printed so that it reads back as itself
    if not any(math.isnan(f.face_area_sq_mm) for f in actual.face_evaluations):
        assert actual == expected


def _random_unit(rng: random.Random) -> Vector3D:
    while True:
        v = Vector3D(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))
        m = v.magnitude()
        if m > 1e-6:
            return v * (1.0 / m)


def _faces(rng: random.Random, count: int, *, broken: bool) -> FaceGeometryAnalysis:
    faces = []
    for index in range(count):
        normal = _random_unit(rng)
        raw = normal * rng.uniform(0.5, 4.0)
        area = rng.uniform(0.01, 25.0)
        unit_normal: Vector3D | None = normal
        if broken:
            kind = rng.random()
            if kind < 0.10:
                area = 0.0
            elif kind < 0.16:
                area = math.nan
            elif kind < 0.22:
                area = math.inf
            elif kind < 0.30:
                unit_normal = None
            elif kind < 0.36:
                unit_normal = Vector3D(0.0, 0.0, 0.0)  # cannot be normalized
            elif kind < 0.42:
                unit_normal = Vector3D(math.nan, 0.0, 1.0)  # not finite
            elif kind < 0.50:
                unit_normal = Vector3D(
                    0.0, 0.0, 3.0
                )  # a normal that is not unit length: normalized again
        faces.append(
            FaceGeometry(
                face_index=index,
                vertex_indices=(3 * index, 3 * index + 1, 3 * index + 2),
                centroid=None,
                raw_normal=raw,
                unit_normal=unit_normal,
                area=area,
                is_degenerate=False,
            )
        )
    return FaceGeometryAnalysis(
        faces=tuple(faces),
        total_face_count=count,
        valid_face_count=count,
        degenerate_face_count=0,
        valid_surface_area_sq_mm=1.0,
    )


def _candidates(rng: random.Random, count: int) -> PullDirectionCandidates:
    directions = [
        Vector3D(1, 0, 0),
        Vector3D(-1, 0, 0),
        Vector3D(0, 1, 0),
        Vector3D(0, 0, -1),
        Vector3D(1, 1, 1),
        Vector3D(0, 0, 5.0),
    ]
    directions += [
        _random_unit(rng) * rng.uniform(0.2, 3.0)
        for _ in range(count - len(directions))
    ]
    return PullDirectionCandidates(
        candidates=tuple(
            PullDirectionCandidate(
                candidate_id=f"test:{i}",
                order_index=i,
                direction=d,
                source=PullDirectionSource.FACE_NORMAL,
                source_references=(
                    PullDirectionSourceReference(
                        source=PullDirectionSource.FACE_NORMAL, face_index=i
                    ),
                ),
            )
            for i, d in enumerate(directions)
        )
    )


@pytest.mark.parametrize("seed", [1, 2, 3, 4])
@pytest.mark.parametrize("broken", [False, True])
def test_the_candidate_loop_gives_exactly_the_face_by_face_results(
    seed: int, broken: bool
) -> None:
    rng = random.Random(seed)
    face_analysis = _faces(rng, 90, broken=broken)
    candidates = _candidates(rng, 40)
    evaluator = PullDirectionEvaluator()
    actual = evaluator.evaluate_candidates(face_analysis, candidates)
    assert len(actual) == 40
    for candidate, evaluation in zip(candidates.candidates, actual, strict=True):
        _same(evaluation, _reference_evaluation(evaluator, face_analysis, candidate))
        # the single-candidate entry point takes the same path
        _same(evaluator.evaluate_candidate(face_analysis, candidate), evaluation)


def test_a_non_default_threshold_and_tolerance_are_honoured_exactly() -> None:
    rng = random.Random(9)
    face_analysis = _faces(rng, 60, broken=True)
    candidates = _candidates(rng, 20)
    evaluator = PullDirectionEvaluator(
        settings=PullDirectionEvaluationSettings(
            minimum_recommended_draft_degrees=3.7, alignment_tolerance=0.2
        )
    )
    for candidate, evaluation in zip(
        candidates.candidates,
        evaluator.evaluate_candidates(face_analysis, candidates),
        strict=True,
    ):
        _same(evaluation, _reference_evaluation(evaluator, face_analysis, candidate))


def test_nothing_analyzable_still_warns_and_scores_zero() -> None:
    rng = random.Random(5)
    analysis = _faces(rng, 6, broken=False)
    analysis = FaceGeometryAnalysis(
        faces=tuple(
            FaceGeometry(
                face_index=f.face_index,
                vertex_indices=f.vertex_indices,
                centroid=None,
                raw_normal=None,
                unit_normal=None,
                area=0.0,
                is_degenerate=True,
            )
            for f in analysis.faces
        ),
        total_face_count=6,
        valid_face_count=0,
        degenerate_face_count=6,
        valid_surface_area_sq_mm=0.0,
    )
    candidates = _candidates(rng, 6)
    evaluator = PullDirectionEvaluator()
    for candidate, evaluation in zip(
        candidates.candidates,
        evaluator.evaluate_candidates(analysis, candidates),
        strict=True,
    ):
        assert not evaluation.is_evaluable
        assert evaluation.engineering_score == 0.0
        _same(evaluation, _reference_evaluation(evaluator, analysis, candidate))
        codes = {w.code for w in evaluation.warnings}
        assert PullDirectionEvaluationWarningCode.NO_ANALYZABLE_FACE_AREA in codes


def test_a_zero_candidate_direction_still_raises() -> None:
    analysis = _faces(random.Random(1), 4, broken=False)
    bad = PullDirectionCandidate(
        candidate_id="zero",
        order_index=0,
        direction=Vector3D(0.0, 0.0, 0.0),
        source=PullDirectionSource.GLOBAL_AXIS,
        source_references=(
            PullDirectionSourceReference(source=PullDirectionSource.GLOBAL_AXIS),
        ),
    )
    with pytest.raises(ValueError, match="finite and non-zero"):
        PullDirectionEvaluator().evaluate_candidate(analysis, bad)


@pytest.mark.parametrize("seed", [1, 2, 3])
@pytest.mark.parametrize("broken", [False, True])
def test_not_keeping_the_face_evaluations_changes_nothing_but_that(
    seed: int, broken: bool
) -> None:
    from dataclasses import replace

    rng = random.Random(seed + 40)
    face_analysis = _faces(rng, 120, broken=broken)
    candidates = _candidates(rng, 50)
    kept = PullDirectionEvaluator().evaluate_candidates(face_analysis, candidates)
    dropped = PullDirectionEvaluator(retain_face_evaluations=False).evaluate_candidates(
        face_analysis, candidates
    )
    assert len(kept) == len(dropped) == 50
    for with_faces, without_faces in zip(kept, dropped, strict=True):
        assert isinstance(without_faces.face_evaluations, UnretainedFaceEvaluations)
        assert (
            len(without_faces.face_evaluations)
            == len(with_faces.face_evaluations)
            == 120
        )
        # everything else is identical, to the last digit of every float: metrics, score, evaluability, warnings, candidate
        assert repr(replace(with_faces, face_evaluations=())) == repr(
            replace(without_faces, face_evaluations=())
        )
        assert without_faces.engineering_score == with_faces.engineering_score
        assert without_faces.aggregate_metrics == with_faces.aggregate_metrics


def test_reading_an_unkept_evaluation_fails_loudly() -> None:
    face_analysis = _faces(random.Random(3), 10, broken=False)
    candidate = _candidates(random.Random(3), 7).candidates[0]
    evaluation = PullDirectionEvaluator(
        retain_face_evaluations=False
    ).evaluate_candidate(face_analysis, candidate)
    assert len(evaluation.face_evaluations) == 10
    with pytest.raises(FaceEvaluationsNotRetainedError):
        evaluation.face_evaluations[0]
    with pytest.raises(FaceEvaluationsNotRetainedError):
        list(evaluation.face_evaluations)  # iterating must not look like an empty list


def test_a_custom_scoring_policy_still_gets_its_evaluations() -> None:
    class CountingPolicy:
        def __init__(self) -> None:
            self.seen: list[int] = []

        def score(self, *, face_evaluations, aggregate_metrics, settings) -> float:
            self.seen.append(len(face_evaluations))
            assert all(
                e.face_index is not None for e in face_evaluations
            )  # real evaluation objects
            return 42.0

    policy = CountingPolicy()
    face_analysis = _faces(random.Random(8), 15, broken=False)
    candidate = _candidates(random.Random(8), 7).candidates[0]
    evaluation = PullDirectionEvaluator(
        scoring_policy=policy, retain_face_evaluations=False
    ).evaluate_candidate(face_analysis, candidate)
    assert policy.seen == [15] and evaluation.engineering_score == 42.0
    assert (
        isinstance(evaluation.face_evaluations, tuple)
        and len(evaluation.face_evaluations) == 15
    )


def test_exactly_parallel_normals_whose_dot_product_rounds_above_one_are_clamped() -> (
    None
):
    # A unit normal dotted with itself can come out as 1.0000000000000002; asin of that would raise. Every face normal is also
    # a candidate direction in real runs, so this happens for real. Find such normals and check the clamp at both ends.
    rng = random.Random(21)
    above, below = [], []
    while len(above) < 6 or len(below) < 6:
        v = _random_unit(rng).normalized(minimum_magnitude=0.0)
        d = v.dot(v)
        if d > 1.0 and len(above) < 6:
            above.append(v)
        negative = (-v).dot(v)
        if negative < -1.0 and len(below) < 6:
            below.append(v)
    normals = above + below
    faces = tuple(
        FaceGeometry(
            face_index=i,
            vertex_indices=(3 * i, 3 * i + 1, 3 * i + 2),
            centroid=None,
            raw_normal=n,
            unit_normal=n,
            area=1.0 + i,
            is_degenerate=False,
        )
        for i, n in enumerate(normals)
    )
    analysis = FaceGeometryAnalysis(
        faces=faces,
        total_face_count=len(faces),
        valid_face_count=len(faces),
        degenerate_face_count=0,
        valid_surface_area_sq_mm=1.0,
    )
    candidates = PullDirectionCandidates(
        candidates=tuple(
            PullDirectionCandidate(
                candidate_id=f"n:{i}",
                order_index=2 * i,
                direction=n,
                source=PullDirectionSource.FACE_NORMAL,
                source_references=(
                    PullDirectionSourceReference(
                        source=PullDirectionSource.FACE_NORMAL, face_index=i
                    ),
                ),
            )
            for i, n in enumerate(normals)
        )
        + tuple(
            PullDirectionCandidate(
                candidate_id=f"r:{i}",
                order_index=2 * i + 1,
                direction=-n,
                source=PullDirectionSource.FACE_NORMAL,
                source_references=(
                    PullDirectionSourceReference(
                        source=PullDirectionSource.FACE_NORMAL, face_index=i
                    ),
                ),
            )
            for i, n in enumerate(normals)
        )
    )
    evaluator = PullDirectionEvaluator()
    for candidate, evaluation in zip(
        candidates.candidates,
        evaluator.evaluate_candidates(analysis, candidates),
        strict=True,
    ):
        _same(evaluation, _reference_evaluation(evaluator, analysis, candidate))
        for f in evaluation.face_evaluations:
            assert -1.0 <= f.signed_alignment <= 1.0
    # the same for the kept and the unkept mode
    unkept = PullDirectionEvaluator(retain_face_evaluations=False).evaluate_candidates(
        analysis, candidates
    )
    kept = evaluator.evaluate_candidates(analysis, candidates)
    assert [u.engineering_score for u in unkept] == [k.engineering_score for k in kept]
