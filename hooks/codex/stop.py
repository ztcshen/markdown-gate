#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from markdown_gate.hook_output import empty, stop_block
from markdown_gate.hook_runtime import combined_output, run_markdown_gate


def main() -> int:
    # The Stop hook is intentionally conservative in the MVP. It can remind the
    # agent when the transcript suggests Markdown delivery, but it does not
    # parse full conversation state yet.
    payload = _read_payload()
    if payload.get("stop_hook_active"):
        print(empty())
        return 0

    cwd = Path(str(payload.get("cwd") or Path.cwd()))
    last_message = str(payload.get("last_assistant_message") or payload.get("message") or "")
    markdown = _extract_markdown(last_message)
    if markdown:
        result = run_markdown_gate(
            REPO_ROOT,
            [
                "check",
                "--stdin",
                "--type",
                str(payload.get("markdown_gate_doc_type") or "unknown"),
            ],
            cwd=cwd,
            input_text=markdown,
        )
        if result.returncode != 0:
            print(
                stop_block(
                    "markdown-gate blocked final Markdown delivery. "
                    "Revise the Markdown and rerun the check.",
                    combined_output(result),
                )
            )
        else:
            print(empty())
    else:
        print(empty())
    return 0


def _extract_markdown(message: str) -> str:
    fenced = re.findall(r"```(?:markdown|md)\s*\n(.*?)```", message, flags=re.I | re.S)
    if fenced:
        return "\n\n".join(part.strip() for part in fenced if part.strip())

    lines = message.splitlines()
    for index, line in enumerate(lines):
        if re.match(r"^\s*#\s+", line):
            return "\n".join(lines[index:]).strip()
    return ""


def _read_payload() -> dict[str, object]:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


if __name__ == "__main__":
    raise SystemExit(main())
