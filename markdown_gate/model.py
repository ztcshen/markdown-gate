from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from pathlib import Path
from typing import Any


class Severity(IntEnum):
    OFF = 0
    SUGGESTION = 1
    WARNING = 2
    ERROR = 3

    @classmethod
    def parse(cls, value: str | None) -> "Severity":
        if value is None:
            return cls.ERROR
        normalized = value.strip().lower().replace("-", "_")
        aliases = {
            "off": cls.OFF,
            "none": cls.OFF,
            "suggestion": cls.SUGGESTION,
            "suggest": cls.SUGGESTION,
            "warning": cls.WARNING,
            "warn": cls.WARNING,
            "error": cls.ERROR,
            "fail": cls.ERROR,
            "never": cls.OFF,
        }
        if normalized not in aliases:
            raise ValueError(f"unknown severity: {value}")
        return aliases[normalized]

    def label(self) -> str:
        return {
            Severity.OFF: "off",
            Severity.SUGGESTION: "suggestion",
            Severity.WARNING: "warning",
            Severity.ERROR: "error",
        }[self]


@dataclass(frozen=True)
class Document:
    path: str
    text: str
    doc_type: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def path_obj(self) -> Path:
        return Path(self.path)


@dataclass(frozen=True)
class Finding:
    path: str
    doc_type: str
    line: int
    column: int
    rule: str
    severity: Severity
    message: str
    excerpt: str
    section: str | None = None
    sections: tuple[str, ...] = ()
    waived_by: str | None = None

    @property
    def is_waived(self) -> bool:
        return self.waived_by is not None

    def as_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "doc_type": self.doc_type,
            "line": self.line,
            "column": self.column,
            "rule": self.rule,
            "severity": self.severity.label(),
            "message": self.message,
            "excerpt": self.excerpt,
            "section": self.section,
            "sections": list(self.sections),
            "waived_by": self.waived_by,
        }


@dataclass(frozen=True)
class ScanResult:
    documents: list[Document]
    findings: list[Finding]
    fail_on: Severity

    @property
    def unwaived_findings(self) -> list[Finding]:
        return [finding for finding in self.findings if not finding.is_waived]

    @property
    def failed(self) -> bool:
        if self.fail_on == Severity.OFF:
            return False
        return any(f.severity >= self.fail_on for f in self.unwaived_findings)

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": "fail" if self.failed else "pass",
            "fail_on": self.fail_on.label(),
            "documents": [
                {
                    "path": document.path,
                    "doc_type": document.doc_type,
                    "metadata": document.metadata,
                }
                for document in self.documents
            ],
            "findings": [finding.as_dict() for finding in self.findings],
        }
