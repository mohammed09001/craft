"""Fails when a native source file is not valid UTF-8 or contains text that was encoded twice.

    python -I scripts/native/check-source-encoding.py [directory ...]       (default: native/, scripts/ and docs/ of this repository)

Double encoding is UTF-8 text read as a single-byte code page and written out as UTF-8 again: a middle dot comes back as
"A-circumflex, middle dot" (two characters), an em dash as three. It is invisible in a diff and in every test that only checks that a
string is present, and it shows on screen: the interaction hint badge once had a stray A-circumflex before each separator dot.
This check looks for that pattern in QML, C++, CMake and script sources.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

SUFFIXES = {".qml", ".cpp", ".h", ".hpp", ".js", ".cmake", ".txt", ".py", ".ps1", ".md", ".json"}
SKIP_DIRS = {".git", "build", "__pycache__", "node_modules", "fixtures"}
# the lead characters of a UTF-8 sequence read as Windows-1252 / Latin-1, followed by the characters its continuation bytes become
LEADS = "ÂÃâ"
CONTINUATIONS = (
    "\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—"
    "˜™š›œžŸ"
)
DOUBLE_ENCODED = re.compile(f"[{LEADS}][{CONTINUATIONS}]")


def check(path: Path) -> list[str]:
    problems: list[str] = []
    try:
        text = path.read_bytes().decode("utf-8")
    except UnicodeDecodeError as error:
        return [f"{path}: not valid UTF-8 ({error.reason} at byte {error.start})"]
    for number, line in enumerate(text.splitlines(), 1):
        match = DOUBLE_ENCODED.search(line)
        if match:
            problems.append(f"{path}:{number}: double-encoded text near '{line[max(0, match.start() - 20):match.end() + 20].strip()}'")
    return problems


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    roots = [Path(arg) for arg in sys.argv[1:]] or [repo / "native", repo / "scripts", repo / "docs"]
    problems: list[str] = []
    checked = 0
    for root in roots:
        for directory, names, files in os.walk(root):
            names[:] = [n for n in names if n not in SKIP_DIRS]
            for file in files:
                path = Path(directory) / file
                if path.suffix.lower() in SUFFIXES:
                    checked += 1
                    problems += check(path)
    for problem in problems:
        print(problem)
    print(f"{checked} files checked, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
