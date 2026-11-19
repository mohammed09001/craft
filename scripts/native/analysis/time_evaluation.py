"""Times the pull-direction candidate evaluation alone: the engine's Python loop against the native kernel, and checks they agree.

    python -I time_evaluation.py <model.stl> [kernels.dll]

Imports the model, builds the face analysis and the candidates as the detailed analysis does, then evaluates every candidate against
every analyzable face with ``PullDirectionEvaluator(retain_face_evaluations=False)`` and, when a kernel is given, with the native
evaluator, and compares the two result tuples exactly (repr, every float printed so that it reads back as itself). The kernel is
loaded through the worker's own loader, so it is also checked on load. The engine comes from CRAFT_ENGINE_SRC if set, else mold/src.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, os.environ.get("CRAFT_ENGINE_SRC") or str(REPO / "mold" / "src"))
sys.path.insert(0, str(REPO / "native" / "engines" / "analysis-bridge" / "worker"))


def main() -> int:
    import craft_native_evaluation as native
    from mold_generator_engine import ImportAnalysisService, PullDirectionEvaluator
    from mold_generator_engine.pipeline.detailed_mold_analysis.face_analysis import analyze_model_face_geometry
    from mold_generator_engine.pipeline.detailed_mold_analysis.pull_directions import DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER

    path = Path(sys.argv[1])
    service = ImportAnalysisService.from_default_readers()
    model = service.importer.import_model(path)
    face_analysis = analyze_model_face_geometry(model)
    candidates = DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER.generate_candidates(face_analysis)
    n_faces, n_candidates = len(face_analysis.faces), len(candidates.candidates)

    started = time.perf_counter()
    expected = PullDirectionEvaluator(retain_face_evaluations=False).evaluate_candidates(face_analysis, candidates)
    python_seconds = time.perf_counter() - started
    result = {"model": path.name, "faces": n_faces, "candidates": n_candidates,
              "evaluations": n_faces * n_candidates, "pythonSeconds": round(python_seconds, 3)}

    if len(sys.argv) > 2:
        kernels, status = native.load_kernels(sys.argv[2])
        if kernels is None:
            print(status, file=sys.stderr)
            return 2
        evaluator = native.NativePullDirectionEvaluator(retain_face_evaluations=False, kernels=kernels)
        started = time.perf_counter()
        got = evaluator.evaluate_candidates(face_analysis, candidates)
        native_seconds = time.perf_counter() - started
        result["nativeSeconds"] = round(native_seconds, 3)
        result["speedup"] = round(python_seconds / max(native_seconds, 1e-9), 1)
        result["identical"] = repr(got) == repr(expected) and kernels.runs == 1
    print(json.dumps(result))
    return 0 if result.get("identical", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
