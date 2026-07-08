from __future__ import annotations

import json
from pathlib import Path


HOOKS_JSON = {
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "^Bash$",
                "hooks": [
                    {
                        "type": "command",
                        "command": 'python3 "$(git rev-parse --show-toplevel)/hooks/codex/pre_tool_use.py"',
                        "timeout": 30,
                        "statusMessage": "Checking Markdown publish gate",
                    }
                ],
            }
        ],
        "PostToolUse": [
            {
                "matcher": "^Bash$|^apply_patch$|^Edit$|^Write$",
                "hooks": [
                    {
                        "type": "command",
                        "command": 'python3 "$(git rev-parse --show-toplevel)/hooks/codex/post_tool_use.py"',
                        "timeout": 60,
                        "statusMessage": "Checking Markdown final-state hygiene",
                    }
                ],
            }
        ],
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": 'python3 "$(git rev-parse --show-toplevel)/hooks/codex/stop.py"',
                        "timeout": 15,
                        "statusMessage": "Checking Markdown delivery",
                    }
                ]
            }
        ],
    }
}


def install_codex_hooks(repo_root: Path, force: bool = False) -> Path:
    target = repo_root / ".codex" / "hooks.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not force:
        existing = target.read_text(encoding="utf-8")
        desired = _render_hooks()
        if existing != desired:
            raise FileExistsError(
                f"{target} already exists and differs; rerun with --force to replace it"
            )
    target.write_text(_render_hooks(), encoding="utf-8")
    return target


def _render_hooks() -> str:
    return json.dumps(HOOKS_JSON, ensure_ascii=False, indent=2) + "\n"
