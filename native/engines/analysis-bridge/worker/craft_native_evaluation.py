"""The pull-direction candidate evaluation on the native kernel (craft_analysis_kernels), for the analysis worker.

The engine's ``PullDirectionEvaluator`` evaluates every candidate direction against every analyzable face: candidates x faces
evaluations, which is what keeps smooth, high-polygon meshes slow in pure Python. ``craft_evaluate_pull_directions`` (native/engines/
analysis-kernels) is that loop in C++, with the same arithmetic in the same order, so every sum it hands back is bit for bit the one
the Python loop produces. Everything else (the metrics, the warnings, the evaluability, the score) is still built by the engine's own
``PullDirectionEvaluator.finish_candidate_evaluation`` from those sums, so there is one implementation of it.

The kernel is an optimisation and never a requirement, and it is never trusted blindly:

* It is loaded only from the path the application gives the worker (``CRAFT_ANALYSIS_KERNELS``), and only when its interface
  version is the one this module speaks.
* On load it is checked against the Python arithmetic on a fixed set of faces and directions (including normals that round past
  1 and directions parallel to a face), with one thread and with several; any difference of even one bit disables it. The check is
  there because bit-for-bit equality depends on the C runtime's ``asin`` being the one CPython uses.
* If it is missing, refused, fails its check, or reports an error during a run, the engine's own evaluation runs instead and the
  reason is logged.

Only the evaluator that does not keep per-face evaluations with the default scoring policy uses the kernel (the only mode the worker
runs); every other configuration is the engine's code unchanged.
"""

from __future__ import annotations

import contextlib
import ctypes
import math
import os
import struct
from array import array
from dataclasses import dataclass
from typing import Any

from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    FaceGeometryAnalysis,
    PullDirectionCandidates,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.evaluation import (
    PullDirectionEvaluator,
    _face_invariants,  # the engine's per-face preparation: shared so the kernel sees exactly the faces the Python loop would
    _normalize_candidate_direction,
)
from mold_generator_engine.pipeline.detailed_mold_analysis.scoring import AreaWeightedDraftScoringPolicy

ABI_VERSION = 1  # craft_kernels_abi_version() of the library this module speaks
FACE_STRIDE = 4  # unit normal x, y, z, area
RESULT_STRIDE = 10  # see AnalysisKernels.h
KERNELS_ENVIRONMENT_VARIABLE = "CRAFT_ANALYSIS_KERNELS"


class NativeKernels:
    """A loaded and checked kernel library."""

    def __init__(self, path: str, library: ctypes.CDLL) -> None:
        self.path = path
        self._evaluate = library.craft_evaluate_pull_directions
        self._evaluate.restype = ctypes.c_int
        self._evaluate.argtypes = [
            ctypes.c_int64, ctypes.c_void_p, ctypes.c_int64, ctypes.c_void_p,
            ctypes.c_double, ctypes.c_double, ctypes.c_int, ctypes.c_void_p,
        ]
        self.runs = 0  # evaluations done by the kernel
        self.failures = 0  # evaluations that fell back to Python because the kernel reported an error

    def evaluate_pull_directions(
        self,
        faces: array,
        directions: array,
        *,
        alignment_tolerance: float,
        minimum_recommended_draft_degrees: float,
        threads: int = 0,
    ) -> array | None:
        """Return the result records (RESULT_STRIDE doubles per candidate) or None when the kernel reports an error."""
        face_count = len(faces) // FACE_STRIDE
        candidate_count = len(directions) // 3
        results = array("d", bytes(8 * RESULT_STRIDE * candidate_count))
        # The buffers are addressed through ctypes arrays that share the array module's memory (no copy), kept alive by the
        # local names for the duration of the call.
        faces_c = (ctypes.c_double * len(faces)).from_buffer(faces) if len(faces) else None
        directions_c = (ctypes.c_double * len(directions)).from_buffer(directions) if len(directions) else None
        results_c = (ctypes.c_double * len(results)).from_buffer(results) if len(results) else None
        status = self._evaluate(
            face_count, ctypes.addressof(faces_c) if faces_c is not None else None,
            candidate_count, ctypes.addressof(directions_c) if directions_c is not None else None,
            alignment_tolerance, minimum_recommended_draft_degrees, threads,
            ctypes.addressof(results_c) if results_c is not None else None,
        )
        del faces_c, directions_c, results_c
        if status != 0:
            self.failures += 1
            return None
        self.runs += 1
        return results


_SEM_FAILCRITICALERRORS = 0x0001
_SEM_NOOPENFILEERRORBOX = 0x8000


@contextlib.contextmanager
def _no_loader_dialogs():
    """Windows shows a modal "Bad Image" box when it is asked to load a file that is not a usable library (not a PE file, the wrong
    architecture, a damaged one) and waits for someone to press OK, which would hang a worker nobody is watching. For the load only,
    this thread asks the loader to fail quietly instead, so the refusal comes back as an OSError and is reported like any other."""
    if os.name != "nt":
        yield
        return
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    previous = ctypes.c_uint(0)
    changed = bool(kernel32.SetThreadErrorMode(_SEM_FAILCRITICALERRORS | _SEM_NOOPENFILEERRORBOX, ctypes.byref(previous)))
    try:
        yield
    finally:
        if changed:
            kernel32.SetThreadErrorMode(previous.value, None)


def load_kernels(path: str | None) -> tuple[NativeKernels | None, str]:
    """Load and check the library at ``path``; return it (or None) and one line saying what happened."""
    if not path:
        return None, "no native kernels configured"
    if not os.path.isfile(path):
        return None, f"native kernels not found at {path}"
    try:
        with _no_loader_dialogs():
            library = ctypes.CDLL(path)
        library.craft_kernels_abi_version.restype = ctypes.c_int
        version = library.craft_kernels_abi_version()
        if version != ABI_VERSION:
            return None, f"native kernels have interface version {version}, expected {ABI_VERSION}"
        kernels = NativeKernels(path, library)
    except (OSError, AttributeError) as error:
        return None, f"native kernels could not be loaded: {type(error).__name__}: {error}"
    problem = self_check(kernels)
    if problem is not None:
        return None, f"native kernels refused: {problem}"
    return kernels, f"native kernels loaded from {path}"


def kernels_from_environment() -> tuple[NativeKernels | None, str]:
    return load_kernels(os.environ.get(KERNELS_ENVIRONMENT_VARIABLE))


# --- the check -------------------------------------------------------------------------------------------------------------

def reference_record(
    faces: array, direction: tuple[float, float, float], tolerance: float, recommended: float
) -> tuple[float, ...]:
    """One candidate's result record from the Python arithmetic of ``PullDirectionEvaluator._evaluate`` (the oracle)."""
    px, py, pz = direction
    total = positive = negative = neutral = low = weighted_draft = weighted_quality = 0.0
    minimum: float | None = None
    meeting = 0
    count = len(faces) // FACE_STRIDE
    for i in range(count):
        nx, ny, nz, area = faces[i * FACE_STRIDE: i * FACE_STRIDE + FACE_STRIDE]
        signed = (nx * px) + (ny * py) + (nz * pz)
        if signed <= -1.0:
            signed = -1.0
        elif signed >= 1.0:
            signed = 1.0
        draft = math.degrees(math.asin(abs(signed)))
        total += area
        if signed > tolerance:
            positive += area
        elif signed < -tolerance:
            negative += area
        else:
            neutral += area
        weighted_draft += area * draft
        minimum = draft if minimum is None else min(minimum, draft)
        if draft >= recommended:
            meeting += 1
        else:
            low += area
        quality = draft / recommended
        if quality <= 0.0:
            quality = 0.0
        elif quality >= 1.0:
            quality = 1.0
        weighted_quality += area * quality
    return (float(count), total, positive, negative, neutral, low, weighted_draft,
            math.nan if minimum is None else minimum, float(meeting), weighted_quality)


def _bits(values: Any) -> bytes:
    return struct.pack(f"<{len(values)}d", *values)


def _check_data() -> tuple[array, array]:
    """A fixed set of unit normals and directions: random, axis-aligned, parallel to each other, near the tolerance."""
    state = 0x2545F4914F6CDD1D

    def unit() -> tuple[float, float, float]:
        nonlocal state
        values = []
        for _ in range(3):
            state = (state * 6364136223846793005 + 1442695040888963407) & 0xFFFFFFFFFFFFFFFF
            values.append(((state >> 11) / float(1 << 53)) * 2.0 - 1.0)
        length = math.sqrt(sum(v * v for v in values))
        return values[0] / length, values[1] / length, values[2] / length

    normals = [unit() for _ in range(240)]
    normals += [(1.0, 0.0, 0.0), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (0.0, 0.0, -1.0)]
    # Faces whose dot product with the direction (1, 0, 0) is exactly a tolerance the check uses, on both sides of zero: the
    # comparisons against the tolerance must treat equality the way the Python loop does. (Not unit normals: only the arithmetic matters.)
    normals += [(1.0e-9, 0.0, 0.0), (-1.0e-9, 0.0, 0.0), (0.05, 0.0, 0.0), (-0.05, 0.0, 0.0)]
    faces = array("d")
    for index, (x, y, z) in enumerate(normals):
        faces.extend((x, y, z, 0.25 + (index % 17) * 0.731))
    directions = array("d")
    candidates = [unit() for _ in range(40)] + [(0.0, 0.0, 1.0), (0.0, 0.0, -1.0), (1.0, 0.0, 0.0)]
    # A direction parallel (or opposite) to a face normal: the dot product with that face rounds to 1 or just past it, either side.
    candidates += normals[:12]
    candidates += [(-x, -y, -z) for x, y, z in normals[:12]]
    candidates += [(math.sqrt(0.5), math.sqrt(0.5), 0.0), (0.6, 0.8, 0.0)]
    for x, y, z in candidates:
        directions.extend((x, y, z))
    return faces, directions


def _boundary_settings(faces: array, directions: array) -> list[tuple[float, float]]:
    """Settings that make some (face, direction) pair land exactly on a comparison: its draft is the recommended draft, and its
    alignment is the tolerance (one pair with a positive alignment, one with a negative one)."""
    found: list[tuple[float, float]] = []
    wanted = [True, False]  # a positive alignment first, then a negative one
    for d in range(len(directions) // 3):
        px, py, pz = directions[3 * d], directions[3 * d + 1], directions[3 * d + 2]
        for f in range(len(faces) // FACE_STRIDE):
            signed = (faces[4 * f] * px) + (faces[4 * f + 1] * py) + (faces[4 * f + 2] * pz)
            if wanted and 0.1 < abs(signed) < 0.9 and (signed > 0) == wanted[0]:
                found.append((abs(signed), math.degrees(math.asin(abs(signed)))))
                wanted.pop(0)
            if not wanted:
                return found
    return found


def self_check(kernels: NativeKernels) -> str | None:
    """Return None when the kernel agrees with the Python arithmetic bit for bit, else what differed."""
    faces, directions = _check_data()
    tolerance, recommended = 1.0e-9, 2.0
    for tolerance, recommended in ((1.0e-9, 2.0), (0.05, 3.5), *_boundary_settings(faces, directions)):
        records = kernels.evaluate_pull_directions(
            faces, directions, alignment_tolerance=tolerance, minimum_recommended_draft_degrees=recommended, threads=1
        )
        if records is None:
            return "the kernel reported an error on the check data"
        for i in range(len(directions) // 3):
            direction = (directions[3 * i], directions[3 * i + 1], directions[3 * i + 2])
            expected = reference_record(faces, direction, tolerance, recommended)
            got = tuple(records[i * RESULT_STRIDE:(i + 1) * RESULT_STRIDE])
            if _bits(got) != _bits(expected):
                return f"candidate {i} differs from the Python arithmetic ({got} != {expected})"
    # Threads must not change a bit: repeat the directions until the work is above the point where the kernel starts threads.
    many = array("d", directions.tobytes() * 20)
    single = kernels.evaluate_pull_directions(
        faces, many, alignment_tolerance=tolerance, minimum_recommended_draft_degrees=recommended, threads=1)
    threaded = kernels.evaluate_pull_directions(
        faces, many, alignment_tolerance=tolerance, minimum_recommended_draft_degrees=recommended, threads=4)
    if single is None or threaded is None:
        return "the kernel reported an error on the thread check"
    if single.tobytes() != threaded.tobytes():
        return "results depend on the thread count"
    kernels.runs = 0
    return None


# --- the evaluator ---------------------------------------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class NativePullDirectionEvaluator(PullDirectionEvaluator):
    """``PullDirectionEvaluator`` whose candidate loop runs in the native kernel (same results; see the module docstring)."""

    kernels: NativeKernels | None = None

    def evaluate_candidates(
        self,
        face_analysis: FaceGeometryAnalysis,
        candidates: PullDirectionCandidates,
    ) -> tuple[CandidatePullDirectionEvaluation, ...]:
        if (
            self.kernels is None
            or self.retain_face_evaluations
            or not isinstance(self.scoring_policy, AreaWeightedDraftScoringPolicy)
        ):
            return PullDirectionEvaluator.evaluate_candidates(self, face_analysis, candidates)

        face_data = _face_invariants(face_analysis)
        faces = array("d")
        for _face_index, area, normal_x, normal_y, normal_z, fixed in face_data:
            if fixed is None:
                faces.extend((normal_x, normal_y, normal_z, area))
        analyzed_face_count = len(faces) // FACE_STRIDE
        ignored_face_count = len(face_data) - analyzed_face_count

        directions = array("d")
        for candidate in candidates.candidates:
            unit = _normalize_candidate_direction(candidate.direction)
            directions.extend((unit.x, unit.y, unit.z))

        records = self.kernels.evaluate_pull_directions(
            faces,
            directions,
            alignment_tolerance=self.settings.alignment_tolerance,
            minimum_recommended_draft_degrees=self.settings.minimum_recommended_draft_degrees,
        )
        if records is None:  # the kernel reported an error: the engine's own loop gives the answer
            return PullDirectionEvaluator.evaluate_candidates(self, face_analysis, candidates)

        evaluations = []
        for index, candidate in enumerate(candidates.candidates):
            record = records[index * RESULT_STRIDE:(index + 1) * RESULT_STRIDE]
            evaluations.append(
                self.finish_candidate_evaluation(
                    candidate,
                    face_count=len(face_data),
                    analyzed_face_count=analyzed_face_count,
                    ignored_face_count=ignored_face_count,
                    total_analyzed_area_sq_mm=record[1],
                    positive_side_area_sq_mm=record[2],
                    negative_side_area_sq_mm=record[3],
                    neutral_area_sq_mm=record[4],
                    low_draft_area_sq_mm=record[5],
                    weighted_draft_sum=record[6],
                    minimum_observed_draft_angle_degrees=record[7] if analyzed_face_count > 0 else None,
                    faces_meeting_recommended_draft_count=int(record[8]),
                    weighted_quality_sum=record[9],
                    kept_face_evaluations=None,
                )
            )
        return tuple(evaluations)

    def evaluate_candidate(self, face_analysis, candidate_direction):  # type: ignore[no-untyped-def]
        # One candidate is not worth a kernel call; it is the engine's code unchanged.
        return PullDirectionEvaluator.evaluate_candidate(self, face_analysis, candidate_direction)


def create_evaluator() -> tuple[PullDirectionEvaluator, str]:
    """The evaluator the worker uses: native when the kernel is available and checked, the engine's own loop otherwise."""
    kernels, status = kernels_from_environment()
    if kernels is None:
        return PullDirectionEvaluator(retain_face_evaluations=False), status
    return NativePullDirectionEvaluator(retain_face_evaluations=False, kernels=kernels), status
