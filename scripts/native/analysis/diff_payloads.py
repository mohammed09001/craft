"""Compares two analysis-worker payloads field by field and tells whether they differ only where they are allowed to.

    python -I diff_payloads.py a.json b.json

The fields that may differ are the ones that carry the run, not the result: when the report was created, how long the analysis
took, and the engine version string (it is read from package metadata, which a source extract of an older commit does not have).
Exit code 0 when nothing else differs, 1 otherwise; the differing paths are printed.
"""
from __future__ import annotations

import json
import sys

ALLOWED = {"/metadata/createdAt", "/metadata/engineVersion", "/statistics/analysisMs"}


def walk(a, b, path: str, diffs: list[tuple[str, object, object]]) -> None:
    if type(a) is not type(b):
        diffs.append((path, a, b))
    elif isinstance(a, dict):
        if list(a.keys()) != list(b.keys()):
            diffs.append((path + " <keys or key order>", list(a.keys())[:6], list(b.keys())[:6]))
        for key in a:
            if key in b:
                walk(a[key], b[key], f"{path}/{key}", diffs)
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append((path + " <length>", len(a), len(b)))
            return
        for index, (x, y) in enumerate(zip(a, b)):
            walk(x, y, f"{path}[{index}]", diffs)
    elif a != b:
        diffs.append((path, a, b))


def main() -> int:
    with open(sys.argv[1], encoding="utf-8") as f:
        first = json.load(f)
    with open(sys.argv[2], encoding="utf-8") as f:
        second = json.load(f)
    diffs: list[tuple[str, object, object]] = []
    walk(first, second, "", diffs)
    unexpected = [d for d in diffs if d[0] not in ALLOWED]
    print(json.dumps({"differingFields": len(diffs), "unexpected": len(unexpected)}))
    for path, a, b in unexpected[:20]:
        print(f"  {path}: {str(a)[:70]} -> {str(b)[:70]}", file=sys.stderr)
    return 1 if unexpected else 0


if __name__ == "__main__":
    raise SystemExit(main())
