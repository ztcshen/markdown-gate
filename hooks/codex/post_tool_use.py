#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def main() -> int:
    payload = _read_payload()
    markdown_paths = _extract_markdown_paths(payload)
    if not markdown_paths:
        return _ok()

    result = subprocess.run(
        [sys.executable, "-m", "markdown_gate", "check", *markdown_paths],
        cwd=Path.cwd(),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(
            json.dumps(
                {
                    "feedback": (
                        "markdown-gate found final-state hygiene issues. "
                        "Revise the Markdown and rerun the check.\n\n"
                        f"{result.stdout[-4000:]}"
                    )
                },
                ensure_ascii=False,
            )
        )
    else:
        print(json.dumps({}))
    return 0


def _read_payload() -> dict[str, Any]:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


def _extract_markdown_paths(payload: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    for key in ("path", "file_path", "file"):
        value = payload.get(key)
        if isinstance(value, str):
            candidates.append(value)

    tool_input = payload.get("tool_input") or payload.get("input") or {}
    if isinstance(tool_input, dict):
        for key in ("path", "file_path", "file"):
            value = tool_input.get(key)
            if isinstance(value, str):
                candidates.append(value)

    return sorted(
        {
            item
            for item in candidates
            if item.endswith((".md", ".markdown")) and Path(item).exists()
        }
    )


def _ok() -> int:
    print(json.dumps({}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
