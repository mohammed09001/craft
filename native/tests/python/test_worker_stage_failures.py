"""The analysis worker must report a cavity/readiness stage that raises, not hide the moldability result."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "mold" / "src"))
WORKER = REPO / "native" / "engines" / "analysis-bridge" / "worker" / "craft_analysis_worker.py"
TETRAHEDRON = REPO / "mold" / "tests" / "fixtures" / "models" / "stl" / "closed_tetrahedron_ascii.stl"


def load_worker():
    spec = importlib.util.spec_from_file_location("craft_analysis_worker", WORKER)
    module = importlib.util.module_from_spec(spec)
    sys.modules["craft_analysis_worker"] = module
    spec.loader.exec_module(module)
    return module


def run(monkeypatch, capsys, break_stage: str | None):
    worker = load_worker()
    import mold_generator_engine as engine

    if break_stage == "cavity":
        def boom(self, *args, **kwargs):  # noqa: ANN001
            raise RuntimeError("cavity exploded")
        monkeypatch.setattr(engine.CavityAnalysisService, "analyze", boom)
    elif break_stage == "readiness":
        def boom(self, *args, **kwargs):  # noqa: ANN001
            raise ValueError("readiness exploded")
        monkeypatch.setattr(engine.GenerationReadinessService, "analyze", boom)
    report = worker.run_moldability_analysis("job-1", {"sourcePath": str(TETRAHEDRON)})
    capsys.readouterr()  # progress messages
    return report


def test_healthy_run_has_no_stage_errors(monkeypatch, capsys):
    report = run(monkeypatch, capsys, None)
    assert report["status"] == "partial"  # the engine's own verdict for this part
    assert report["data"]["stageErrors"] == {}
    assert report["data"]["cavityAnalysis"] is not None
    assert report["data"]["generationReadiness"] is not None


def test_cavity_failure_is_reported_and_moldability_survives(monkeypatch, capsys):
    report = run(monkeypatch, capsys, "cavity")
    assert report["success"] is True
    assert report["status"] == "partial"
    assert "cavityAnalysis" in report["data"]["stageErrors"]
    assert "cavity exploded" in report["data"]["stageErrors"]["cavityAnalysis"]
    assert report["data"]["cavityAnalysis"] is None
    assert report["data"]["generationReadiness"] is None  # readiness needs the cavity report
    assert report["data"]["pullDirection"]["rankedCandidates"]  # the moldability result is intact
    assert any(w["code"] == "CAVITY_ANALYSIS_FAILED" for w in report["warnings"])


def test_readiness_failure_is_reported_and_cavity_survives(monkeypatch, capsys):
    report = run(monkeypatch, capsys, "readiness")
    assert report["status"] == "partial"
    assert "generationReadiness" in report["data"]["stageErrors"]
    assert report["data"]["cavityAnalysis"] is not None
    assert report["data"]["generationReadiness"] is None
    assert any(w["code"] == "GENERATION_READINESS_FAILED" for w in report["warnings"])