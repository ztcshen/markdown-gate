from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


def run_markdown_gate(
    source_root: Path,
    args: list[str],
    cwd: Path,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    existing = env.get("PYTHONPATH")
    env["PYTHONPATH"] = (
        str(source_root)
        if not existing
        else f"{source_root}{os.pathsep}{existing}"
    )
    return subprocess.run(
        [sys.executable, "-m", "markdown_gate", *args],
        cwd=cwd,
        input=input_text,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def combined_output(result: subprocess.CompletedProcess[str]) -> str:
    parts = [result.stdout.strip(), result.stderr.strip()]
    return "\n".join(part for part in parts if part)
