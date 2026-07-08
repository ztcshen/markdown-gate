#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from markdown_gate.hook_output import empty, post_tool_block
from markdown_gate.hook_runtime import combined_output, run_markdown_gate


def main() -> int:
    payload = _read_payload()
    cwd = Path(str(payload.get("cwd") or Path.cwd()))
    markdown_paths = _extract_markdown_paths(payload, cwd)
    if not markdown_paths and _is_bash_payload(payload):
        command = _extract_command(payload)
        if _bash_may_have_changed_markdown(command):
            markdown_paths = _changed_markdown_paths(cwd)
    if not markdown_paths:
        return _ok()

    result = run_markdown_gate(REPO_ROOT, ["check", *markdown_paths], cwd=cwd)
    if result.returncode != 0:
        print(
            post_tool_block(
                "markdown-gate found final-state hygiene issues. "
                "Revise the Markdown and rerun the check.",
                combined_output(result),
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


def _extract_markdown_paths(payload: dict[str, Any], cwd: Path) -> list[str]:
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
        command = str(tool_input.get("command") or tool_input.get("cmd") or "")
        candidates.extend(_extract_paths_from_patch(command))

    tool_response = payload.get("tool_response")
    if isinstance(tool_response, dict):
        text = json.dumps(tool_response)
        candidates.extend(_extract_paths_from_patch(text))
    elif isinstance(tool_response, str):
        candidates.extend(_extract_paths_from_patch(tool_response))

    return sorted(
        {
            item
            for item in candidates
            if _is_existing_markdown(cwd, item)
        }
    )


def _is_bash_payload(payload: dict[str, Any]) -> bool:
    return str(payload.get("tool_name") or "").lower() == "bash"


def _extract_command(payload: dict[str, Any]) -> str:
    tool_input = payload.get("tool_input") or payload.get("input") or {}
    if isinstance(tool_input, dict):
        return str(
            tool_input.get("command")
            or tool_input.get("cmd")
            or tool_input.get("cmdline")
            or ""
        )
    return ""


def _bash_may_have_changed_markdown(command: str) -> bool:
    if not command:
        return False
    return bool(
        re.search(r"\.(md|markdown)\b", command)
        or re.search(r"(^|[;&|]\s*)(cat|tee|touch|cp|mv|rm|sed|perl|python3?)\b", command)
        or ">" in command
    )


def _changed_markdown_paths(cwd: Path) -> list[str]:
    paths: set[str] = set()
    diff = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRT", "HEAD"],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )
    if diff.returncode == 0:
        paths.update(
            line.strip()
            for line in diff.stdout.splitlines()
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


def _is_existing_markdown(cwd: Path, value: str) -> bool:
    return value.endswith((".md", ".markdown")) and (cwd / value).exists()


def _extract_paths_from_patch(text: str) -> list[str]:
    paths: list[str] = []
    prefixes = (
        "*** Add File: ",
        "*** Update File: ",
        "*** Delete File: ",
        "*** Move to: ",
    )
    for raw_line in text.splitlines():
        line = raw_line.strip()
        for prefix in prefixes:
            if line.startswith(prefix):
                paths.append(line[len(prefix) :].strip())
    return paths


def _ok() -> int:
    print(empty())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
