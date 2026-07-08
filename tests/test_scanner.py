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

    def test_public_api_doc_catches_soft_wrapped_prior_version(self) -> None:
        doc = make_document(
            "docs/api/withdraw.md",
            "# Withdraw API\n\nThe previous\nversion used old_field.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertIn("rejected_prior_solution", {finding.rule for finding in findings})

    def test_public_api_doc_catches_common_residue_synonyms(self) -> None:
        doc = make_document(
            "docs/api/withdraw.md",
            "# Withdraw API\n\nFormerly, old_field was accepted. It is deprecated.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertIn("rejected_prior_solution", {finding.rule for finding in findings})

    def test_public_api_doc_allows_domain_state_language(self) -> None:
        doc = make_document(
            "docs/api/callback.md",
            "# Callback API\n\n"
            "The description value must be no longer than 32 characters.\n\n"
            "When settlement finishes, the order status is changed to SUCCESS.\n\n"
            "After logout, the access token is no longer valid.\n\n"
            "Use amount instead of total_amount for the request amount.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertFalse(any(finding.severity == Severity.ERROR for finding in findings))

    def test_public_api_doc_skips_code_and_table_containers(self) -> None:
        doc = make_document(
            "docs/api/withdraw.md",
            "# Withdraw API\n\n"
            "```json\n"
            '{"note": "The previous design used old_field"}\n'
            "```\n\n"
            "| field | note |\n"
            "| --- | --- |\n"
            "| old | The previous design used old_field |\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])

    def test_adr_alternatives_allows_rejected_solution_note(self) -> None:
        doc = make_document(
            "docs/adr/withdraw.md",
            "# ADR\n\n## Alternatives\n\nThe previous approach used old_field.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])

    def test_plan_main_body_fails_on_revision_trace(self) -> None:
        doc = make_document(
            "docs/plans/withdraw.md",
            "# Plan\n\n修正为只保留当前接口方案。\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings[0].severity, Severity.ERROR)

    def test_plan_alternatives_allows_prior_solution_note(self) -> None:
        doc = make_document(
            "docs/plans/withdraw.md",
            "# Plan\n\n## Alternatives Considered\n\n"
            "The previous approach used two steps.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])

    def test_allowed_section_inherits_through_nested_headings(self) -> None:
        doc = make_document(
            "docs/adr/withdraw.md",
            "# ADR\n\n## Alternatives\n\n### Legacy field\n\n"
            "The previous approach used old_field.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])

    def test_issue_description_fails_on_self_correction(self) -> None:
        doc = make_document(
            "issues/withdraw.md",
            "# Issue\n\n不是使用旧字段，而是使用 apply_no。\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings[0].severity, Severity.ERROR)

    def test_public_api_negative_constraint_is_only_suggestion(self) -> None:
        doc = make_document(
            "docs/api/key.md",
            "# API Key\n\nDo not share your API key with client-side code.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertTrue(findings)
        self.assertTrue(all(finding.severity == Severity.SUGGESTION for finding in findings))

    def test_runbook_allows_negative_constraints_in_safety_section(self) -> None:
        doc = make_document(
            "docs/runbooks/retry.md",
            "# Retry Runbook\n\n## Safety\n\nDo not rerun the job while settlement is active.\n",
        )

        findings = scan_document(doc, GateConfig())

        self.assertEqual(findings, [])


if __name__ == "__main__":
    unittest.main()
