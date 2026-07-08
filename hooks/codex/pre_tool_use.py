#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from markdown_gate.hook_output import empty, pre_tool_deny


PUBLISH_COMMAND_MARKERS = (
    "docs publish",
    "mindoc",
    "multica issue comment add",
    "gh pr create",
)


def main() -> int:
    payload = _read_payload()
    cwd = Path(str(payload.get("cwd") or Path.cwd()))
    command = _extract_command(payload)

    if command and any(marker in command for marker in PUBLISH_COMMAND_MARKERS):
        markdown_paths = _publish_scope(cwd, command)
        if not markdown_paths:
            return _allow()
        result = subprocess.run(
            [sys.executable, "-m", "markdown_gate", "check", *markdown_paths],
            cwd=cwd,
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
        return str(
            tool_input.get("cmd")
            or tool_input.get("command")
            or tool_input.get("cmdline")
            or ""
        )
    return ""


def _publish_scope(cwd: Path, command: str) -> list[str]:
    explicit = os.environ.get("MARKDOWN_GATE_PATHS")
    if explicit:
        return [item for item in explicit.split(os.pathsep) if item]

    paths = set(_extract_markdown_paths_from_command(command, cwd))

    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRT", "HEAD"],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        paths.update(
            line.strip()
            for line in result.stdout.splitlines()
            if _is_existing_markdown(cwd, line.strip())
        )

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )
    if untracked.returncode == 0:
        paths.update(
            line.strip()
            for line in untracked.stdout.splitlines()
            if _is_existing_markdown(cwd, line.strip())
        )

    return sorted(paths)


def _extract_markdown_paths_from_command(command: str, cwd: Path) -> list[str]:
    matches = re.findall(r"(?<![\w./-])([\w./-]+\.(?:md|markdown))\b", command)
    return [item for item in matches if _is_existing_markdown(cwd, item)]


def _is_existing_markdown(cwd: Path, value: str) -> bool:
    return value.endswith((".md", ".markdown")) and (cwd / value).exists()


def _allow() -> int:
    print(empty())
    return 0


def _deny(reason: str, output: str) -> int:
    print(pre_tool_deny(reason, output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
