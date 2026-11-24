"""Times the Python moldability analysis stage by stage and fingerprints what it produces.

    python -I time_analysis.py <model.stl> [--profile N] [--stages detailed,cavity,readiness]

It runs exactly what the analysis worker runs (craft_analysis_worker.run_moldability_analysis): import analysis, model import,
the detailed mold analysis with the pull-direction evaluator, cavity analysis, generation readiness. Prints one JSON object: the
seconds each stage took and a SHA-256 of each stage's canonical result, so a speed-up can be shown to change nothing but the
time. With --profile N it also prints the N most expensive functions (cProfile, cumulative time) to stderr.

The engine is taken from mold/src of the repository this script lives in.
"""
from __future__ import annotations

import argparse
import cProfile
import hashlib
import io
import json
import pstats
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
import os
sys.path.insert(0, os.environ.get("CRAFT_ENGINE_SRC") or str(REPO / "mold" / "src"))   # CRAFT_ENGINE_SRC: another engine tree, to compare against


def fingerprint(value) -> str:
    text = json.dumps(value, sort_keys=True, default=str, allow_nan=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    parser.add_argument("--profile", type=int, default=0)
    parser.add_argument("--stages", default="detailed,cavity,readiness")
    parser.add_argument("--backend", choices=("bvh", "brute"), default="bvh",
                        help="the ray-mesh query backend: bvh (the engine default) or brute (the original, for comparison)")
    args = parser.parse_args()
    stages = set(args.stages.split(","))

    from mold_generator_engine import (
        CavityAnalysisService,
        DetailedMoldAnalysisService,
        GenerationReadinessService,
        ImportAnalysisService,
        PullDirectionEvaluator,
    )

    if args.backend == "brute":
        # Put the original brute-force backend back at the three places the engine builds its ray queries.
        from mold_generator_engine.geometry.ray_mesh_query import BruteForceRayMeshQuery
        from mold_generator_engine.pipeline.cavity_analysis import openings, undercuts
        from mold_generator_engine.pipeline.detailed_mold_analysis import undercut

        for module in (openings, undercuts, undercut):
            module.BvhRayMeshQuery = BruteForceRayMeshQuery

    path = Path(args.model)
    result: dict = {"backend": args.backend, "model": path.name, "bytes": path.stat().st_size, "seconds": {}, "fingerprints": {}}

    def timed(name, fn):
        started = time.perf_counter()
        value = fn()
        result["seconds"][name] = round(time.perf_counter() - started, 4)
        return value

    import_service = ImportAnalysisService.from_default_readers()
    import_report = timed("import_analysis", lambda: import_service.analyze(path))
    model = timed("import_model", lambda: import_service.importer.import_model(path))
    result["faces"] = len(model.faces) if hasattr(model, "faces") else None
    result["fingerprints"]["import_report"] = fingerprint(import_report.to_dict())

    profiler = cProfile.Profile() if args.profile else None
    detailed = None
    if "detailed" in stages:
        def run_detailed():
            service = DetailedMoldAnalysisService(pull_direction_evaluator=PullDirectionEvaluator())
            if profiler:
                profiler.enable()
            try:
                return service.analyze(import_report, model)
            finally:
                if profiler:
                    profiler.disable()
        detailed = timed("detailed", run_detailed)
        result["fingerprints"]["detailed"] = fingerprint(detailed.to_dict())
    cavity = None
    if "cavity" in stages and detailed is not None:
        cavity = timed("cavity", lambda: CavityAnalysisService().analyze(import_report, detailed, model))
        result["fingerprints"]["cavity"] = fingerprint(cavity.to_dict())
    if "readiness" in stages and cavity is not None:
        readiness = timed("readiness", lambda: GenerationReadinessService().analyze(import_report, detailed, cavity, model))
        result["fingerprints"]["readiness"] = fingerprint(readiness.to_dict())
    result["seconds"]["total_after_import"] = round(sum(v for k, v in result["seconds"].items() if k in ("detailed", "cavity", "readiness")), 4)

    if profiler:
        out = io.StringIO()
        pstats.Stats(profiler, stream=out).sort_stats("cumulative").print_stats(args.profile)
        sys.stderr.write(out.getvalue())
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
