from __future__ import annotations

import json
from pathlib import Path


def project_hooks_json() -> dict[str, object]:
    return _hooks_json(
        pre_command='python3 "$(git rev-parse --show-toplevel)/hooks/codex/pre_tool_use.py"',
        post_command='python3 "$(git rev-parse --show-toplevel)/hooks/codex/post_tool_use.py"',
        stop_command='python3 "$(git rev-parse --show-toplevel)/hooks/codex/stop.py"',
    )


def global_hooks_json(source_root: Path) -> dict[str, object]:
    hooks_dir = source_root / "hooks" / "codex"
    return _hooks_json(
        pre_command=f'python3 "{hooks_dir / "pre_tool_use.py"}"',
        post_command=f'python3 "{hooks_dir / "post_tool_use.py"}"',
        stop_command=f'python3 "{hooks_dir / "stop.py"}"',
    )


def _hooks_json(pre_command: str, post_command: str, stop_command: str) -> dict[str, object]:
    return {
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "^Bash$",
                "hooks": [
                    {
                        "type": "command",
                        "command": pre_command,
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
                        "command": post_command,
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
                        "command": stop_command,
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
    return _write_hooks(target, project_hooks_json(), force=force)


def install_global_codex_hooks(
    codex_home: Path,
    source_root: Path,
    force: bool = False,
) -> Path:
    target = codex_home / "hooks.json"
    return _write_hooks(target, global_hooks_json(source_root), force=force)


def _write_hooks(target: Path, hooks: dict[str, object], force: bool) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    desired = _render_hooks(hooks)
    if target.exists() and not force:
        existing = target.read_text(encoding="utf-8")
        if existing != desired:
            raise FileExistsError(
                f"{target} already exists and differs; rerun with --force to replace it"
            )
    target.write_text(desired, encoding="utf-8")
    return target


def _render_hooks(hooks: dict[str, object]) -> str:
    return json.dumps(hooks, ensure_ascii=False, indent=2) + "\n"
