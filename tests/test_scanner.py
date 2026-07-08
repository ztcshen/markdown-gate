import unittest

from markdown_gate.classifier import classify_document
from markdown_gate.config import GateConfig
from markdown_gate.model import Document, Severity
from markdown_gate.scanner import scan_document


def make_document(path: str, text: str, explicit_type: str | None = None) -> Document:
    config = GateConfig()
    doc_type, metadata, body = classify_document(path, text, config, explicit_type)
    return Document(path=path, text=body, doc_type=doc_type, metadata=metadata)


class ScannerTest(unittest.TestCase):
    def test_public_api_doc_fails_on_revision_trace(self) -> None:
        doc = make_document(
            "docs/api/withdraw.md",
            "# Withdraw API\n\nThe previous design used old_field, but it has been removed.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertGreaterEqual(
            {finding.rule for finding in findings},
            {"revision_trace", "rejected_prior_solution"},
        )
        self.assertTrue(all(finding.severity == Severity.ERROR for finding in findings))

    def test_adr_alternatives_allows_rejected_solution_note(self) -> None:
        doc = make_document(
            "docs/adr/withdraw.md",
            "# ADR\n\n## Alternatives\n\nThe previous approach used old_field.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])

    def test_runbook_allows_negative_constraints_in_safety_section(self) -> None:
        doc = make_document(
            "docs/runbooks/retry.md",
            "# Retry Runbook\n\n## Safety\n\nDo not rerun the job while settlement is active.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
