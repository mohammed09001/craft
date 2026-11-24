"""The native candidate evaluation must give exactly what the engine's Python loop gives.

    set CRAFT_ANALYSIS_KERNELS=<path of craft_analysis_kernels.dll>      (the build tree has it; ctest sets it)
    python -m pytest native/engines/analysis-bridge/tests/test_native_evaluation.py -q        (from the repository root)

The kernel does the arithmetic of ``PullDirectionEvaluator._evaluate`` in C++; the engine's own ``finish_candidate_evaluation``
turns its sums into the candidate's evaluation. Every test compares a whole evaluation with ``repr`` (floats printed so that they
read back as themselves) and, where there is no NaN, with ``==``: not a tolerance anywhere.
"""

from __future__ import annotations

import math
import os
import random
import sys
from array import array
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / "mold" / "src"))
sys.path.insert(0, str(REPO / "native" / "engines" / "analysis-bridge" / "worker"))
sys.path.insert(0, str(REPO / "mold" / "tests" / "unit"))

import craft_native_evaluation as native  # noqa: E402
from mold_generator_engine.models.detailed_mold_analysis import PullDirectionEvaluationSettings  # noqa: E402
from mold_generator_engine.pipeline.detailed_mold_analysis.evaluation import (  # noqa: E402
    PullDirectionEvaluator,
    _face_invariants,
    _normalize_candidate_direction,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.scoring import AreaWeightedDraftScoringPolicy  # noqa: E402

# the fixtures the engine's own equivalence tests build: random faces (optionally broken ones) and candidates
from test_pull_direction_evaluation_equivalence import _candidates, _faces  # noqa: E402


def _kernel_path() -> str:
    path = os.environ.get(native.KERNELS_ENVIRONMENT_VARIABLE, "")
    if not path:
        pytest.fail("CRAFT_ANALYSIS_KERNELS is not set: build craft_analysis_kernels and point it at the library")
    return path


@pytest.fixture(scope="module")
def kernels() -> native.NativeKernels:
    loaded, status = native.load_kernels(_kernel_path())
    assert loaded is not None, status
    return loaded


def _same(actual, expected) -> None:
    """Exact equality of two evaluations that did not keep their face evaluations (those only compare by length)."""
    assert repr(actual) == repr(expected)  # every float printed so that it reads back as itself
    assert len(actual.face_evaluations) == len(expected.face_evaluations)
    assert actual.candidate == expected.candidate
    assert actual.aggregate_metrics == expected.aggregate_metrics
    assert actual.engineering_score == expected.engineering_score
    assert actual.is_evaluable == expected.is_evaluable
    assert actual.warnings == expected.warnings


def _python(**kwargs) -> PullDirectionEvaluator:
    return PullDirectionEvaluator(retain_face_evaluations=False, **kwargs)


def _native(kernels, **kwargs) -> native.NativePullDirectionEvaluator:
    return native.NativePullDirectionEvaluator(retain_face_evaluations=False, kernels=kernels, **kwargs)


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
@pytest.mark.parametrize("broken", [False, True])
def test_every_evaluation_equals_the_python_loops(kernels, seed: int, broken: bool) -> None:
    rng = random.Random(seed)
    face_analysis = _faces(rng, 130, broken=broken)
    candidates = _candidates(rng, 60)
    before = kernels.runs
    got = _native(kernels).evaluate_candidates(face_analysis, candidates)
    assert kernels.runs == before + 1, "the kernel did not run"
    expected = _python().evaluate_candidates(face_analysis, candidates)
    assert len(got) == len(expected) == 60
    for a, b in zip(got, expected, strict=True):
        _same(a, b)


def test_it_also_equals_the_engines_default_evaluator_apart_from_the_unkept_face_evaluations(kernels) -> None:
    from dataclasses import fields, replace

    rng = random.Random(11)
    face_analysis = _faces(rng, 80, broken=True)
    candidates = _candidates(rng, 30)
    got = _native(kernels).evaluate_candidates(face_analysis, candidates)
    reference = PullDirectionEvaluator().evaluate_candidates(face_analysis, candidates)
    for a, b in zip(got, reference, strict=True):
        assert len(a.face_evaluations) == len(b.face_evaluations)
        for field in fields(a):
            if field.name != "face_evaluations":
                assert repr(getattr(a, field.name)) == repr(getattr(b, field.name)), field.name
        assert replace(a, face_evaluations=()).engineering_score == replace(b, face_evaluations=()).engineering_score


def test_non_default_settings_are_passed_to_the_kernel(kernels) -> None:
    rng = random.Random(9)
    face_analysis = _faces(rng, 70, broken=True)
    candidates = _candidates(rng, 25)
    settings = PullDirectionEvaluationSettings(minimum_recommended_draft_degrees=3.7, alignment_tolerance=0.2)
    got = _native(kernels, settings=settings).evaluate_candidates(face_analysis, candidates)
    expected = _python(settings=settings).evaluate_candidates(face_analysis, candidates)
    for a, b in zip(got, expected, strict=True):
        _same(a, b)


def test_nothing_analyzable_and_no_candidates(kernels) -> None:
    from mold_generator_engine.models.detailed_mold_analysis import (
        FaceGeometry, FaceGeometryAnalysis, PullDirectionCandidates)

    rng = random.Random(5)
    base = _faces(rng, 6, broken=False)
    nothing = FaceGeometryAnalysis(
        faces=tuple(FaceGeometry(face_index=f.face_index, vertex_indices=f.vertex_indices, centroid=None, raw_normal=None,
                                 unit_normal=None, area=0.0, is_degenerate=True) for f in base.faces),
        total_face_count=6, valid_face_count=0, degenerate_face_count=6, valid_surface_area_sq_mm=0.0)
    candidates = _candidates(rng, 8)
    for a, b in zip(_native(kernels).evaluate_candidates(nothing, candidates),
                    _python().evaluate_candidates(nothing, candidates), strict=True):
        _same(a, b)
        assert not a.is_evaluable and a.engineering_score == 0.0
        assert a.aggregate_metrics.minimum_observed_draft_angle_degrees is None
    assert _native(kernels).evaluate_candidates(base, PullDirectionCandidates(candidates=())) == ()


def test_a_zero_candidate_direction_still_raises(kernels) -> None:
    from mold_generator_engine.geometry import Vector3D
    from mold_generator_engine.models.detailed_mold_analysis import (
        PullDirectionCandidate, PullDirectionCandidates, PullDirectionSource, PullDirectionSourceReference)

    bad = PullDirectionCandidate(
        candidate_id="zero", order_index=0, direction=Vector3D(0.0, 0.0, 0.0), source=PullDirectionSource.GLOBAL_AXIS,
        source_references=(PullDirectionSourceReference(source=PullDirectionSource.GLOBAL_AXIS),))
    with pytest.raises(ValueError, match="finite and non-zero"):
        _native(kernels).evaluate_candidates(_faces(random.Random(1), 4, broken=False), PullDirectionCandidates(candidates=(bad,)))


def test_the_threads_never_change_a_bit(kernels) -> None:
    faces, directions = native._check_data()
    many = array("d", directions.tobytes() * 30)  # 245 faces x 1,530 candidates: above the point where threads start
    results = {}
    for threads in (1, 2, 3, 7, 16, 0):
        records = kernels.evaluate_pull_directions(
            faces, many, alignment_tolerance=1e-9, minimum_recommended_draft_degrees=2.0, threads=threads)
        assert records is not None
        results[threads] = records.tobytes()
    assert len({v for v in results.values()}) == 1, [t for t, v in results.items() if v != results[1]]


def test_more_threads_than_candidates_and_a_candidate_per_thread(kernels) -> None:
    rng = random.Random(3)
    faces = array("d")
    for _ in range(3000):
        v = [rng.gauss(0, 1) for _ in range(3)]
        m = math.sqrt(sum(x * x for x in v))
        faces.extend((v[0] / m, v[1] / m, v[2] / m, rng.uniform(0.1, 9.0)))
    for candidate_count in (1, 2, 3, 70):
        directions = array("d", [0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.6, 0.8, 0.0] * ((candidate_count + 2) // 3))[: 3 * candidate_count]
        single = kernels.evaluate_pull_directions(faces, directions, alignment_tolerance=1e-9,
                                                  minimum_recommended_draft_degrees=2.0, threads=1)
        threaded = kernels.evaluate_pull_directions(faces, directions, alignment_tolerance=1e-9,
                                                    minimum_recommended_draft_degrees=2.0, threads=16)
        assert single is not None and threaded is not None
        assert single.tobytes() == threaded.tobytes(), candidate_count


@pytest.mark.parametrize("arguments", [
    {"alignment_tolerance": math.nan, "minimum_recommended_draft_degrees": 2.0},
    {"alignment_tolerance": math.inf, "minimum_recommended_draft_degrees": 2.0},
    {"alignment_tolerance": 1e-9, "minimum_recommended_draft_degrees": 0.0},
    {"alignment_tolerance": 1e-9, "minimum_recommended_draft_degrees": -1.0},
    {"alignment_tolerance": 1e-9, "minimum_recommended_draft_degrees": math.nan},
])
def test_arguments_the_python_loop_could_not_honour_are_refused_and_counted(kernels, arguments) -> None:
    faces, directions = native._check_data()
    failures = kernels.failures
    assert kernels.evaluate_pull_directions(faces, directions, **arguments) is None
    assert kernels.failures == failures + 1
    kernels.failures = failures


def test_a_kernel_that_reports_an_error_falls_back_to_the_python_loop(kernels) -> None:
    class Failing:
        runs = 0
        failures = 0

        def evaluate_pull_directions(self, *args, **kwargs):
            self.failures += 1
            return None

    rng = random.Random(21)
    face_analysis = _faces(rng, 60, broken=True)
    candidates = _candidates(rng, 20)
    failing = Failing()
    got = native.NativePullDirectionEvaluator(retain_face_evaluations=False, kernels=failing).evaluate_candidates(
        face_analysis, candidates)
    assert failing.failures == 1
    for a, b in zip(got, _python().evaluate_candidates(face_analysis, candidates), strict=True):
        _same(a, b)


def test_only_the_worker_mode_uses_the_kernel(kernels) -> None:
    rng = random.Random(8)
    face_analysis = _faces(rng, 40, broken=False)
    candidates = _candidates(rng, 12)
    before = kernels.runs
    kept = native.NativePullDirectionEvaluator(retain_face_evaluations=True, kernels=kernels)
    result = kept.evaluate_candidates(face_analysis, candidates)
    assert kernels.runs == before, "an evaluator that keeps the face evaluations must not use the kernel"
    assert len(result[0].face_evaluations) == 40 and result[0].face_evaluations[0].face_index == 0

    class Custom(AreaWeightedDraftScoringPolicy):
        pass

    custom = native.NativePullDirectionEvaluator(retain_face_evaluations=False, kernels=kernels, scoring_policy=_Plain())
    custom.evaluate_candidates(face_analysis, candidates)
    assert kernels.runs == before, "a custom scoring policy needs the evaluations: no kernel"
    _native(kernels).evaluate_candidates(face_analysis, candidates)
    assert kernels.runs == before + 1


class _Plain:
    """A scoring policy that is not the default one."""

    def score(self, *, face_evaluations, aggregate_metrics, settings) -> float:
        return float(len(face_evaluations))


def test_the_self_check_rejects_a_kernel_that_is_wrong_by_one_bit(kernels) -> None:
    class OneBitOff:
        path = "x"
        runs = 0
        failures = 0

        def evaluate_pull_directions(self, faces, directions, **kwargs):
            records = kernels.evaluate_pull_directions(faces, directions, **kwargs)
            raw = bytearray(records.tobytes())
            raw[8 * native.RESULT_STRIDE * 7 + 8 * 6] ^= 1  # the lowest bit of candidate 7's weighted-draft sum
            return array("d", bytes(raw))

    problem = native.self_check(OneBitOff())
    assert problem is not None and "candidate 7" in problem


def test_the_self_check_rejects_results_that_depend_on_threads(kernels) -> None:
    class ThreadSensitive:
        path = "x"
        runs = 0
        failures = 0

        def evaluate_pull_directions(self, faces, directions, **kwargs):
            records = kernels.evaluate_pull_directions(faces, directions, **kwargs)
            if kwargs.get("threads", 0) != 1 and len(directions) > 3 * 1000:
                raw = bytearray(records.tobytes())
                raw[-1] ^= 1
                return array("d", bytes(raw))
            return records

    assert native.self_check(ThreadSensitive()) == "results depend on the thread count"


def test_loading_refuses_what_it_should(tmp_path, monkeypatch) -> None:
    assert native.load_kernels(None)[0] is None
    assert native.load_kernels("")[0] is None
    kernels, status = native.load_kernels(str(tmp_path / "missing.dll"))
    assert kernels is None and "not found" in status
    junk = tmp_path / "junk.dll"
    junk.write_bytes(b"this is not a library")
    kernels, status = native.load_kernels(str(junk))
    assert kernels is None and "could not be loaded" in status
    monkeypatch.setattr(native, "ABI_VERSION", 99)
    kernels, status = native.load_kernels(_kernel_path())
    assert kernels is None and "interface version" in status


@pytest.mark.skipif(os.name != "nt", reason="the loader's Bad Image dialog is Windows's")
def test_loading_a_file_that_is_not_a_library_never_waits_for_a_dialog_to_be_dismissed(tmp_path, monkeypatch) -> None:
    """Windows answers a file that is not a usable library with a modal "Bad Image" box unless the loading thread asks it not to;
    a worker nobody is watching would wait for it forever. During the load the thread's error mode must have the box suppressed,
    and afterwards it must be what it was."""
    import ctypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.GetThreadErrorMode.restype = ctypes.c_uint

    def thread_error_mode() -> int:
        return kernel32.GetThreadErrorMode()

    before = thread_error_mode()
    seen: list[int] = []
    real_cdll = ctypes.CDLL

    def spying_cdll(path, *args, **kwargs):
        seen.append(thread_error_mode())
        return real_cdll(path, *args, **kwargs)

    monkeypatch.setattr(native.ctypes, "CDLL", spying_cdll)
    junk = tmp_path / "craft_analysis_kernels.dll"
    junk.write_bytes(b"this is not a library")
    kernels, status = native.load_kernels(str(junk))
    assert kernels is None and "could not be loaded" in status
    assert seen and seen[0] & 0x0001, "SEM_FAILCRITICALERRORS was not set while the file was loaded"
    assert seen[0] & 0x8000
    assert thread_error_mode() == before, "the thread's error mode was not restored"


def test_the_reference_arithmetic_of_the_check_is_the_engines(kernels) -> None:
    """The check's oracle must itself equal the engine's loop, or passing the check would prove nothing."""
    from mold_generator_engine.geometry import Vector3D
    from mold_generator_engine.models.detailed_mold_analysis import (
        FaceGeometry, FaceGeometryAnalysis, PullDirectionCandidate, PullDirectionCandidates, PullDirectionSource,
        PullDirectionSourceReference)

    faces, directions = native._check_data()
    geometry = tuple(
        FaceGeometry(face_index=i, vertex_indices=(0, 1, 2), centroid=None, raw_normal=None,
                     unit_normal=Vector3D(faces[4 * i], faces[4 * i + 1], faces[4 * i + 2]), area=faces[4 * i + 3],
                     is_degenerate=False)
        for i in range(len(faces) // 4))
    analysis = FaceGeometryAnalysis(faces=geometry, total_face_count=len(geometry), valid_face_count=len(geometry),
                                    degenerate_face_count=0, valid_surface_area_sq_mm=1.0)
    count = len(directions) // 3
    candidates = PullDirectionCandidates(candidates=tuple(
        PullDirectionCandidate(
            candidate_id=f"c{i}", order_index=i, direction=Vector3D(*directions[3 * i:3 * i + 3]),
            source=PullDirectionSource.GLOBAL_AXIS,
            source_references=(PullDirectionSourceReference(source=PullDirectionSource.GLOBAL_AXIS),))
        for i in range(count)))
    # The engine normalizes faces and directions again (the check data has a few that are not unit length on purpose), so the
    # oracle is given what the engine's loop sees.
    seen_faces = array("d")
    for _index, area, nx, ny, nz, fixed in _face_invariants(analysis):
        assert fixed is None
        seen_faces.extend((nx, ny, nz, area))
    settings = PullDirectionEvaluationSettings()
    evaluations = _python().evaluate_candidates(analysis, candidates)
    for evaluation, candidate in zip(evaluations, candidates.candidates, strict=True):
        unit = _normalize_candidate_direction(candidate.direction)
        record = native.reference_record(
            seen_faces, (unit.x, unit.y, unit.z), settings.alignment_tolerance, settings.minimum_recommended_draft_degrees)
        m = evaluation.aggregate_metrics
        assert m.analyzed_face_count == record[0]
        assert m.total_analyzed_area_sq_mm == record[1]
        assert m.positive_side_area_sq_mm == record[2]
        assert m.negative_side_area_sq_mm == record[3]
        assert m.neutral_area_sq_mm == record[4]
        assert m.low_draft_area_sq_mm == record[5]
        assert m.area_weighted_mean_draft_angle_degrees == record[6] / record[1]
        assert m.minimum_observed_draft_angle_degrees == record[7]
        assert m.faces_meeting_recommended_draft_count == record[8]
        assert evaluation.engineering_score == max(0.0, min(100.0, 100.0 * (record[9] / record[1])))


def test_the_worker_picks_the_kernel_from_the_environment(monkeypatch) -> None:
    monkeypatch.setenv(native.KERNELS_ENVIRONMENT_VARIABLE, _kernel_path())
    evaluator, status = native.create_evaluator()
    assert isinstance(evaluator, native.NativePullDirectionEvaluator) and evaluator.kernels is not None, status
    monkeypatch.delenv(native.KERNELS_ENVIRONMENT_VARIABLE)
    evaluator, status = native.create_evaluator()
    assert type(evaluator) is PullDirectionEvaluator and not evaluator.retain_face_evaluations
    assert "no native kernels" in status
