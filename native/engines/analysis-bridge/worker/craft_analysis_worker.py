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

Commands: ``ping``, ``import_analysis`` (params: ``sourcePath``), ``shutdown``.

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
COMMANDS = ("ping", "import_analysis", "shutdown")


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
