#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


PUBLISH_COMMAND_MARKERS = (
    "docs publish",
    "mindoc",
    "multica issue comment add",
    "gh pr create",
)


def main() -> int:
    payload = _read_payload()
    command = _extract_command(payload)

    if command and any(marker in command for marker in PUBLISH_COMMAND_MARKERS):
        markdown_paths = _publish_scope()
        if not markdown_paths:
            return _allow()
        result = subprocess.run(
            [sys.executable, "-m", "markdown_gate", "check", *markdown_paths],
            cwd=Path.cwd(),
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            return _deny("Markdown gate failed before publish command.", result.stdout)

    return _allow()


def _read_payload() -> dict[str, Any]:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


def _extract_command(payload: dict[str, Any]) -> str:
    tool_input = payload.get("tool_input") or payload.get("input") or {}
    if isinstance(tool_input, dict):
        return str(tool_input.get("cmd") or tool_input.get("command") or "")
    return ""


def _publish_scope() -> list[str]:
    explicit = os.environ.get("MARKDOWN_GATE_PATHS")
    if explicit:
        return [item for item in explicit.split(os.pathsep) if item]

    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRT", "HEAD"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return sorted(
        {
            line.strip()
            for line in result.stdout.splitlines()
            if line.strip().endswith((".md", ".markdown")) and Path(line.strip()).exists()
        }
    )


def _allow() -> int:
    print(json.dumps({"decision": "approve"}))
    return 0


def _deny(reason: str, output: str) -> int:
    print(
        json.dumps(
            {
                "decision": "block",
                "reason": reason,
                "feedback": output[-4000:],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
