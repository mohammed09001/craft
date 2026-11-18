"""Craft analysis worker: a local, offline bridge to the Python engine.

The native application starts this script as a child process and talks to it
over stdin/stdout using the ``craft.analysis`` protocol, version 1:

* one UTF-8 JSON object per line in each direction (JSON Lines);
* stdout carries protocol messages only, stderr carries human-readable logs;
* no socket, port, or file is opened for communication, so nothing is
  reachable from the network;
* model geometry is never sent through the pipe -- a request names a local
  file and the engine reads it itself.

Messages from the worker::

    {"type": "hello", "protocol": "craft.analysis", "protocolVersion": 1, ...}
    {"type": "progress", "jobId": ..., "stage": ..., "fraction": 0..1}
    {"type": "result", "jobId": ..., "command": ..., "report": {...}, ...}
    {"type": "error", "jobId": ..., "code": ..., "message": ...}

Messages to the worker::

    {"type": "request", "protocolVersion": 1, "jobId": ..., "command": ...,
     "params": {...}}

Commands: ``ping``, ``import_analysis`` (params: ``sourcePath``),
``moldability_analysis`` (params: ``sourcePath``; the existing detailed mold analysis, then
cavity analysis and generation readiness on top of it, returned as one ``engineering_report``
contract envelope), ``shutdown``.

Jobs run one at a time. The host cancels a running job by terminating the
process (it is restarted on the next request), which is why this script holds
no state between jobs.

The analysis itself is the existing, unmodified
``mold_generator_engine.pipeline.import_analysis`` service.
"""

from __future__ import annotations

import json
import platform
import sys
import time
import traceback
from pathlib import Path
from typing import Any

PROTOCOL_NAME = "craft.analysis"
PROTOCOL_VERSION = 1
COMMANDS = ("ping", "import_analysis", "moldability_analysis", "shutdown")

# Per-face lists grow with face count x candidate count (52 MB for a 10,800-face box). They stay in the engine; the
# report carries their lengths instead, and says so in ``data.omitted``.
OMITTED_PER_FACE_KEYS = ("face_evaluations", "face_assessments", "face_results", "source_references")


class RequestError(Exception):
    """A request the worker understood well enough to reject."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def emit(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, allow_nan=False) + "\n")
    sys.stdout.flush()


def log(text: str) -> None:
    sys.stderr.write(f"[craft-analysis-worker] {text}\n")
    sys.stderr.flush()


def sanitize(value: Any) -> Any:
    """Make a report JSON-safe: non-finite floats become null."""
    if isinstance(value, float):
        return value if value == value and value not in (float("inf"), float("-inf")) else None
    if isinstance(value, dict):
        return {str(key): sanitize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(item) for item in value]
    return value


def engine_version() -> str:
    try:
        from importlib.metadata import version

        return version("mold-generator-engine")
    except Exception:  # noqa: BLE001 - metadata is optional in a bundled runtime
        return "unknown"


def run_import_analysis(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    source = params.get("sourcePath")
    if not isinstance(source, str) or not source:
        raise RequestError("invalid_params", "import_analysis requires a 'sourcePath' string.")
    source_path = Path(source)
    if not source_path.is_file():
        raise RequestError("source_not_found", f"Model file does not exist: {source}")

    emit({"type": "progress", "jobId": job_id, "stage": "loading-engine", "fraction": 0.1})
    from mold_generator_engine.pipeline.import_analysis.service import (
        ImportAnalysisService,
    )

    emit({"type": "progress", "jobId": job_id, "stage": "analyzing", "fraction": 0.3})
    report = ImportAnalysisService.from_default_readers().analyze(source_path)
    emit({"type": "progress", "jobId": job_id, "stage": "serializing", "fraction": 0.9})
    return sanitize(report.to_dict())


def compact_detailed_report(value: Any, omitted: dict[str, int]) -> Any:
    """Replace per-face lists by ``<key>Count`` so the payload stays bounded."""
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            if key in OMITTED_PER_FACE_KEYS and isinstance(item, list):
                result[f"{key}Count"] = len(item)
                omitted[key] = omitted.get(key, 0) + len(item)
            else:
                result[key] = compact_detailed_report(item, omitted)
        return result
    if isinstance(value, list):
        return [compact_detailed_report(item, omitted) for item in value]
    return value


def ranked_pull_direction_candidates(detailed: Any) -> list[dict[str, Any]]:
    """Ranked candidates in the shape the native evaluation layer reads."""
    ranking = detailed.pull_direction_ranking
    if ranking is None:
        return []
    ranked = []
    for item in ranking.ranked_evaluations:
        direction = item.candidate.direction
        ranked.append({
            "id": item.candidate.candidate_id,
            "direction": {"x": direction.x, "y": direction.y, "z": direction.z},
            "rank": item.rank,
            "score": item.preliminary_score,  # 0..100
            "isValid": bool(item.evaluation.is_evaluable),
        })
    return ranked


def run_moldability_analysis(job_id: str, params: dict[str, Any]) -> dict[str, Any]:
    source = params.get("sourcePath")
    if not isinstance(source, str) or not source:
        raise RequestError("invalid_params", "moldability_analysis requires a 'sourcePath' string.")
    source_path = Path(source)
    if not source_path.is_file():
        raise RequestError("source_not_found", f"Model file does not exist: {source}")

    emit({"type": "progress", "jobId": job_id, "stage": "loading-engine", "fraction": 0.05})
    from engineering_reports import (
        EngineeringReportError,
        EngineeringReportStatus,
        EngineeringReportWarning,
        create_engineering_report,
        create_failed_engineering_report,
    )
    from mold_generator_engine import (
        CavityAnalysisService,
        DetailedMoldAnalysisService,
        DetailedMoldAnalysisStatus,
        GenerationReadinessService,
        ImportAnalysisService,
        PullDirectionEvaluator,
    )
    from mold_generator_engine.exceptions import ModelImportError

    report_id = f"moldability_analysis:{job_id}"
    common = {"report_id": report_id, "analysis_name": "moldability_analysis",
              "report_name": "Moldability Analysis", "engine_version": engine_version()}

    emit({"type": "progress", "jobId": job_id, "stage": "importing", "fraction": 0.1})
    import_service = ImportAnalysisService.from_default_readers()
    import_report = import_service.analyze(source_path)
    try:
        model = import_service.importer.import_model(source_path)
    except (ModelImportError, OSError) as error:
        failed = create_failed_engineering_report(
            error=EngineeringReportError(code="model_import_failed", message=str(error),
                                         source="mold_generator_engine", recoverable=False),
            statistics={}, **common)
        return sanitize(failed.to_dict())

    emit({"type": "progress", "jobId": job_id, "stage": "analyzing", "fraction": 0.2})
    started = time.perf_counter()
    detailed = DetailedMoldAnalysisService(pull_direction_evaluator=PullDirectionEvaluator()).analyze(
        import_report, model)
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    # Cavity analysis and generation readiness are cheap on top of the detailed stage (0.06 s against 2.7 s on a
    # 768-face box). A stage that raises must not hide the moldability result: it is recorded and reported.
    emit({"type": "progress", "jobId": job_id, "stage": "cavity-analysis", "fraction": 0.8})
    cavity_report = None
    readiness_report = None
    stage_errors: dict[str, str] = {}
    try:
        cavity_report = CavityAnalysisService().analyze(import_report, detailed, model)
    except Exception as error:  # noqa: BLE001 - recorded, never swallowed silently
        log(traceback.format_exc())
        stage_errors["cavityAnalysis"] = f"{type(error).__name__}: {error}"
    if cavity_report is not None:
        emit({"type": "progress", "jobId": job_id, "stage": "generation-readiness", "fraction": 0.85})
        try:
            readiness_report = GenerationReadinessService().analyze(import_report, detailed, cavity_report, model)
        except Exception as error:  # noqa: BLE001
            log(traceback.format_exc())
            stage_errors["generationReadiness"] = f"{type(error).__name__}: {error}"
    emit({"type": "progress", "jobId": job_id, "stage": "serializing", "fraction": 0.9})

    omitted: dict[str, int] = {}
    detailed_dict = compact_detailed_report(detailed.to_dict(), omitted)
    ranked = ranked_pull_direction_candidates(detailed)
    selection = detailed.preliminary_pull_direction_selection
    selected = selection.selected_candidate if selection is not None else None
    data = {
        "analysisStatus": detailed.status.value,
        "importStatus": import_report.status.value,
        "summary": detailed.summary,
        "pullDirection": {
            "rankedCandidates": ranked,
            "selectedCandidateId": selected.candidate_id if selected is not None else None,
            "selectionStatus": selection.status.value if selection is not None else None,
            "reasons": list(selection.reasons) if selection is not None else [],
        },
        "moldability": detailed_dict.get("preliminary_moldability_assessment"),
        "detailedAnalysis": detailed_dict,
        # The readiness report is the Chapter 9 hand-off contract the native adapter reads (compact, no per-face data).
        "generationReadiness": readiness_report.to_dict() if readiness_report is not None else None,
        "cavityAnalysis": compact_detailed_report(cavity_report.to_dict(), omitted) if cavity_report is not None else None,
        "stageErrors": stage_errors,
        "omitted": omitted,
    }
    statistics = {"candidateCount": len(ranked), "faceCount": len(model.faces) if hasattr(model, "faces") else None,
                  "analysisMs": round(elapsed_ms, 3)}
    warnings = tuple(
        EngineeringReportWarning(code="PULL_DIRECTION_SELECTION", message=text,
                                 source="detailed_mold_analysis")
        for text in (selection.warnings if selection is not None else ())
    ) + tuple(
        EngineeringReportWarning(code=f"{stage.upper()}_FAILED".replace("CAVITYANALYSIS", "CAVITY_ANALYSIS")
                                 .replace("GENERATIONREADINESS", "GENERATION_READINESS"),
                                 message=f"{stage} did not complete: {text}", source="analysis_worker")
        for stage, text in stage_errors.items())

    status = detailed.status
    if status is DetailedMoldAnalysisStatus.COMPLETED and stage_errors:
        report = create_engineering_report(data=data, statistics=statistics, warnings=warnings,
                                           status=EngineeringReportStatus.PARTIAL, success=True, **common)
    elif status is DetailedMoldAnalysisStatus.COMPLETED:
        report = create_engineering_report(data=data, statistics=statistics, warnings=warnings, **common)
    elif status is DetailedMoldAnalysisStatus.PARTIAL:
        report = create_engineering_report(data=data, statistics=statistics, warnings=warnings,
                                           status=EngineeringReportStatus.PARTIAL, success=True, **common)
    elif status is DetailedMoldAnalysisStatus.NOT_RUN:
        report = create_engineering_report(data=data, statistics=statistics, warnings=warnings,
                                           status=EngineeringReportStatus.SKIPPED, success=False, **common)
    else:  # BLOCKED or FAILED: the engine could not analyze this model
        errors = tuple(
            EngineeringReportError(code=blocker.code, message=blocker.message, source="detailed_mold_analysis",
                                   recoverable=False)
            for blocker in detailed.blockers
        ) or (EngineeringReportError(code=f"analysis_{status.value}", message=detailed.summary,
                                     source="detailed_mold_analysis", recoverable=False),)
        report = create_engineering_report(data=data, statistics=statistics, warnings=warnings, errors=errors,
                                           status=EngineeringReportStatus.FAILED, success=False, **common)
    return sanitize(report.to_dict())


def handle(request: dict[str, Any]) -> bool:
    """Process one request. Returns False when the worker should exit."""
    job_id = request.get("jobId")
    if not isinstance(job_id, str) or not job_id:
        emit({"type": "error", "jobId": None, "code": "invalid_request",
              "message": "Request is missing a 'jobId' string."})
        return True

    def fail(code: str, message: str) -> None:
        emit({"type": "error", "jobId": job_id, "code": code, "message": message})

    if request.get("type") != "request":
        fail("invalid_request", "Message 'type' must be 'request'.")
        return True
    if request.get("protocolVersion") != PROTOCOL_VERSION:
        fail("protocol_version_mismatch",
             f"Worker speaks {PROTOCOL_NAME} v{PROTOCOL_VERSION}; "
             f"request used v{request.get('protocolVersion')!r}.")
        return True

    command = request.get("command")
    params = request.get("params") or {}
    if not isinstance(params, dict):
        fail("invalid_params", "'params' must be an object.")
        return True

    started = time.perf_counter()
    try:
        if command == "ping":
            payload: dict[str, Any] = {"pong": True}
        elif command == "shutdown":
            emit({"type": "result", "jobId": job_id, "command": command,
                  "report": {"shutdown": True}, "elapsedMs": 0.0})
            return False
        elif command == "import_analysis":
            payload = run_import_analysis(job_id, params)
        elif command == "moldability_analysis":
            payload = run_moldability_analysis(job_id, params)
        else:
            raise RequestError("unknown_command", f"Unknown command: {command!r}.")
    except RequestError as error:
        fail(error.code, error.message)
        return True
    except Exception as error:  # noqa: BLE001 - report, never crash the loop
        log(traceback.format_exc())
        fail("engine_exception", f"{type(error).__name__}: {error}")
        return True

    emit({
        "type": "result",
        "jobId": job_id,
        "command": command,
        # Echoed so the host can reject a result for a model it replaced.
        "modelId": params.get("modelId"),
        "geometryVersion": params.get("geometryVersion"),
        "report": payload,
        "elapsedMs": (time.perf_counter() - started) * 1000.0,
    })
    return True


def main() -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    emit({
        "type": "hello",
        "protocol": PROTOCOL_NAME,
        "protocolVersion": PROTOCOL_VERSION,
        "engine": {"name": "mold-generator-engine", "version": engine_version()},
        "python": platform.python_version(),
        "commands": list(COMMANDS),
    })

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as error:
            emit({"type": "error", "jobId": None, "code": "invalid_json", "message": str(error)})
            continue
        if not isinstance(request, dict):
            emit({"type": "error", "jobId": None, "code": "invalid_request",
                  "message": "Request must be a JSON object."})
            continue
        if not handle(request):
            break
    return 0


if __name__ == "__main__":
    sys.exit(main())
