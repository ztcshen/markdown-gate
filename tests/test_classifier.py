import unittest

from markdown_gate.classifier import classify_document
from markdown_gate.config import GateConfig


class ClassifierTest(unittest.TestCase):
    def test_public_path_overrides_weaker_frontmatter_type(self) -> None:
        doc_type, _, _ = classify_document(
            "docs/api/withdraw.md",
            "---\ndoc_type: adr\n---\n\n# Withdraw Apply API\n",
            GateConfig(),
        )

        self.assertEqual(doc_type, "public-api-doc")

    def test_absolute_docs_api_path_is_public_api_doc(self) -> None:
        doc_type, _, _ = classify_document(
            "/tmp/project/docs/api/withdraw.md",
            "# Withdraw\n",
            GateConfig(),
        )

        self.assertEqual(doc_type, "public-api-doc")

    def test_chinese_access_heading_is_access_guide(self) -> None:
        doc_type, _, _ = classify_document(
            "guide.md",
            "# 支付接入指南\n",
            GateConfig(),
        )

        self.assertEqual(doc_type, "access-guide")

    def test_compact_api_heading_is_public_api_doc(self) -> None:
        doc_type, _, _ = classify_document(
            "change.md",
            "# API变更说明\n",
            GateConfig(),
        )

        self.assertEqual(doc_type, "public-api-doc")


if __name__ == "__main__":
    unittest.main()
