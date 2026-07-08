import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


def run_cli(*args: str, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "markdown_gate", *args],
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )


class CliTest(unittest.TestCase):
    def test_check_stdin_fails_dirty_public_api_doc(self) -> None:
        result = run_cli(
            "check",
            "--stdin",
            "--type",
            "public-api-doc",
            "--format",
            "json",
            input_text="# API\n\n已移除上一版方案中的 old_field。\n",
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "fail")
        self.assertTrue(payload["findings"])

    def test_check_clean_fixture_passes(self) -> None:
        result = run_cli("check", "tests/fixtures/api_clean.md")

        self.assertEqual(result.returncode, 0)
        self.assertIn("PASS", result.stdout)

    def test_scoped_waiver_allows_matching_finding(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            doc = root / "api.md"
            waiver = root / "waivers.json"
            doc.write_text(
                "---\ndoc_type: public-api-doc\n---\n\n"
                "# API\n\nThe previous design used old_field.\n",
                encoding="utf-8",
            )
            waiver.write_text(
                json.dumps(
                    {
                        "waivers": [
                            {
                                "id": "W-test",
                                "rules": ["rejected_prior_solution"],
                                "scope": {
                                    "doc_type": "public-api-doc",
                                    "path": str(doc),
                                    "section": "API",
                                },
                                "expires": "2099-01-01",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            result = run_cli("check", str(doc), "--waiver-file", str(waiver))

        self.assertEqual(result.returncode, 0)
        self.assertIn("waived_by=W-test", result.stdout)


if __name__ == "__main__":
    unittest.main()
