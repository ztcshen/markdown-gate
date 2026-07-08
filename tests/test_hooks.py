import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_hook(script: str, payload: dict[str, object], env: dict[str, str] | None = None):
    merged_env = os.environ.copy()
    merged_env.pop("PYTHONPATH", None)
    if env:
        merged_env.update(env)
    return subprocess.run(
        [sys.executable, str(ROOT / "hooks" / "codex" / script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
        cwd=ROOT,
        env=merged_env,
    )


class HookTest(unittest.TestCase):
    def test_pre_tool_use_blocks_publish_when_scope_is_dirty(self) -> None:
        result = run_hook(
            "pre_tool_use.py",
            {
                "hook_event_name": "PreToolUse",
                "cwd": str(ROOT),
                "tool_name": "Bash",
                "tool_input": {"command": "docs publish"},
            },
            env={"MARKDOWN_GATE_PATHS": "tests/fixtures/api_dirty.md"},
        )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["decision"], "block")
        specific = payload["hookSpecificOutput"]
        self.assertEqual(specific["hookEventName"], "PreToolUse")
        self.assertEqual(specific["permissionDecision"], "deny")

    def test_post_tool_use_blocks_dirty_markdown_from_patch_payload(self) -> None:
        result = run_hook(
            "post_tool_use.py",
            {
                "hook_event_name": "PostToolUse",
                "cwd": str(ROOT),
                "tool_name": "apply_patch",
                "tool_input": {
                    "command": "*** Begin Patch\n"
                    "*** Update File: tests/fixtures/api_dirty.md\n"
                    "@@\n"
                    "-x\n"
                    "+x\n"
                    "*** End Patch\n"
                },
            },
        )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["decision"], "block")
        self.assertEqual(payload["hookSpecificOutput"]["hookEventName"], "PostToolUse")

    def test_stop_hook_blocks_dirty_markdown_final_message(self) -> None:
        result = run_hook(
            "stop.py",
            {
                "hook_event_name": "Stop",
                "cwd": str(ROOT),
                "last_assistant_message": "# API\n\nThe previous design used old_field.",
                "markdown_gate_doc_type": "public-api-doc",
            },
        )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["decision"], "block")

    def test_stop_hook_ignores_active_stop_retry(self) -> None:
        result = run_hook(
            "stop.py",
            {
                "hook_event_name": "Stop",
                "cwd": str(ROOT),
                "stop_hook_active": True,
                "last_assistant_message": "# API\n\nThe previous design used old_field.",
                "markdown_gate_doc_type": "public-api-doc",
            },
        )

        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {})

    def test_stop_hook_blocks_embedded_markdown_heading(self) -> None:
        result = run_hook(
            "stop.py",
            {
                "hook_event_name": "Stop",
                "cwd": str(ROOT),
                "last_assistant_message": (
                    "Here is the doc:\n\n# API\n\nThe previous design used old_field."
                ),
                "markdown_gate_doc_type": "public-api-doc",
            },
        )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["decision"], "block")

    def test_pre_tool_use_blocks_publish_with_untracked_markdown(self) -> None:
        path = ROOT / "tests" / "tmp_hook_publish_dirty.md"
        path.write_text(
            "---\ndoc_type: public-api-doc\n---\n\n"
            "# API\n\nThe previous design used old_field.\n",
            encoding="utf-8",
        )
        try:
            result = run_hook(
                "pre_tool_use.py",
                {
                    "hook_event_name": "PreToolUse",
                    "cwd": str(ROOT),
                    "tool_name": "Bash",
                    "tool_input": {"command": "docs publish"},
                },
            )
        finally:
            path.unlink(missing_ok=True)

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["decision"], "block")

    def test_post_tool_use_bash_checks_changed_markdown(self) -> None:
        path = ROOT / "tests" / "tmp_hook_bash_dirty.md"
        path.write_text(
            "---\ndoc_type: public-api-doc\n---\n\n"
            "# API\n\nThe previous design used old_field.\n",
            encoding="utf-8",
        )
        try:
            result = run_hook(
                "post_tool_use.py",
                {
                    "hook_event_name": "PostToolUse",
                    "cwd": str(ROOT),
                    "tool_name": "Bash",
                    "tool_input": {"command": "cat > tests/tmp_hook_bash_dirty.md"},
                },
            )
        finally:
            path.unlink(missing_ok=True)

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["decision"], "block")

    def test_install_codex_hooks_writes_project_config(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "markdown_gate",
                    "install-codex-hooks",
                    "--repo-root",
                    directory,
                ],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
                env={**os.environ, "PYTHONPATH": str(ROOT)},
            )

            target = Path(directory) / ".codex" / "hooks.json"
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(target.exists())
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertIn("PreToolUse", payload["hooks"])


if __name__ == "__main__":
    unittest.main()
