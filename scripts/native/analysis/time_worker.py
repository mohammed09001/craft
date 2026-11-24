"""Times the whole moldability job of the analysis worker, as the application runs it.

    python -I time_worker.py <model.stl>

Optional second argument: a file to write the payload to.
Calls ``craft_analysis_worker.run_moldability_analysis`` (the analysis, the report conversion, the compaction and the sanitizing)
and then serializes the result to JSON, as the worker does when it answers. Prints seconds and the JSON size. The engine comes
from CRAFT_ENGINE_SRC if set, else from mold/src of this repository.
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
from contextlib import redirect_stdout
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, os.environ.get("CRAFT_ENGINE_SRC") or str(REPO / "mold" / "src"))
sys.path.insert(0, os.environ.get("CRAFT_WORKER_DIR") or str(REPO / "native" / "engines" / "analysis-bridge" / "worker"))


def main() -> int:
    import craft_analysis_worker as worker

    model = Path(sys.argv[1])
    started = time.perf_counter()
    with redirect_stdout(io.StringIO()):  # the worker reports progress on stdout
        payload = worker.run_moldability_analysis("timing", {"sourcePath": str(model)})
    analysed = time.perf_counter() - started
    text = json.dumps(payload)
    total = time.perf_counter() - started
    if len(sys.argv) > 2:  # also write the payload, to compare the output of two engines
        Path(sys.argv[2]).write_text(text, encoding="utf-8")
    print(json.dumps({"model": model.name, "jobSeconds": round(analysed, 3), "withJsonSeconds": round(total, 3), "jsonBytes": len(text)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

