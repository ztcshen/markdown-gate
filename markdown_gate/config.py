from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import fnmatch
import tomllib

from .model import Severity


DOC_TYPES = {
    "public-api-doc",
    "access-guide",
    "implementation-plan",
    "issue-description",
    "adr",
    "runbook",
    "unknown",
}


DEFAULT_PATH_TYPES = {
    "docs/api/**": "public-api-doc",
    "docs/public/**": "public-api-doc",
    "docs/reference/**": "public-api-doc",
    "docs/interfaces/**": "public-api-doc",
    "api/**/*.md": "public-api-doc",
    "docs/access/**": "access-guide",
    "docs/guides/access/**": "access-guide",
    "plans/**": "implementation-plan",
    "docs/plans/**": "implementation-plan",
    "issues/**": "issue-description",
    "docs/issues/**": "issue-description",
    "adr/**": "adr",
    "docs/adr/**": "adr",
    "runbooks/**": "runbook",
    "docs/runbooks/**": "runbook",
}


DEFAULT_ALLOWED_SECTIONS = {
    "implementation-plan": {
        "alternatives considered",
        "decision record",
        "rejected alternatives",
    },
    "adr": {
        "context",
        "decision",
        "alternatives",
        "alternatives considered",
        "consequences",
        "rejected alternatives",
    },
    "runbook": {
        "warnings",
        "safety",
        "rollback",
        "risks",
        "constraints",
        "do not",
    },
}


DEFAULT_SEVERITIES = {
    "public-api-doc": {
        "revision_trace": "error",
        "rejected_prior_solution": "error",
        "self_correction": "error",
        "internal_authoring_process": "error",
        "negative_constraint": "suggestion",
    },
    "access-guide": {
        "revision_trace": "error",
        "rejected_prior_solution": "error",
        "self_correction": "error",
        "internal_authoring_process": "error",
        "negative_constraint": "suggestion",
    },
    "implementation-plan": {
        "revision_trace": "error",
        "rejected_prior_solution": "error",
        "self_correction": "error",
        "internal_authoring_process": "error",
        "negative_constraint": "suggestion",
    },
    "issue-description": {
        "revision_trace": "error",
        "rejected_prior_solution": "error",
        "self_correction": "error",
        "internal_authoring_process": "error",
        "negative_constraint": "suggestion",
    },
    "adr": {
        "revision_trace": "suggestion",
        "rejected_prior_solution": "suggestion",
        "self_correction": "warning",
        "internal_authoring_process": "warning",
        "negative_constraint": "off",
    },
    "runbook": {
        "revision_trace": "warning",
        "rejected_prior_solution": "suggestion",
        "self_correction": "warning",
        "internal_authoring_process": "warning",
        "negative_constraint": "off",
    },
    "unknown": {
        "revision_trace": "warning",
        "rejected_prior_solution": "warning",
        "self_correction": "warning",
        "internal_authoring_process": "warning",
        "negative_constraint": "suggestion",
    },
}


@dataclass
class GateConfig:
    fail_on: Severity = Severity.ERROR
    path_types: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_PATH_TYPES))
    allowed_sections: dict[str, set[str]] = field(
        default_factory=lambda: {
            doc_type: set(sections)
            for doc_type, sections in DEFAULT_ALLOWED_SECTIONS.items()
        }
    )
    severities: dict[str, dict[str, Severity]] = field(
        default_factory=lambda: {
            doc_type: {
                rule: Severity.parse(severity)
                for rule, severity in rules.items()
            }
            for doc_type, rules in DEFAULT_SEVERITIES.items()
        }
    )

    def severity_for(self, doc_type: str, rule: str) -> Severity:
        rules = self.severities.get(doc_type) or self.severities["unknown"]
        return rules.get(rule, self.severities["unknown"].get(rule, Severity.WARNING))

    def is_allowed_section(self, doc_type: str, section: str | None) -> bool:
        if not section:
            return False
        normalized = normalize_section(section)
        return normalized in self.allowed_sections.get(doc_type, set())

    def is_allowed_section_path(self, doc_type: str, sections: list[str]) -> bool:
        allowed = self.allowed_sections.get(doc_type, set())
        return any(normalize_section(section) in allowed for section in sections)

    def classify_path(self, path: str) -> str | None:
        normalized = path.replace("\\", "/").lstrip("./")
        for pattern, doc_type in self.path_types.items():
            normalized_pattern = pattern.replace("\\", "/").lstrip("./")
            if fnmatch.fnmatch(normalized, normalized_pattern):
                return doc_type
            if fnmatch.fnmatch(normalized, f"**/{normalized_pattern}"):
                return doc_type
        return None


def normalize_section(section: str) -> str:
    return " ".join(section.strip().lower().split())


def load_config(path: str | None) -> GateConfig:
    config = GateConfig()
    if not path:
        return config

    data = tomllib.loads(Path(path).read_text(encoding="utf-8"))

    defaults = data.get("defaults", {})
    if "fail_on" in defaults:
        config.fail_on = Severity.parse(str(defaults["fail_on"]))

    path_types = data.get("path_types", {})
    for pattern, doc_type in path_types.items():
        if doc_type not in DOC_TYPES:
            raise ValueError(f"unknown doc_type {doc_type!r} for pattern {pattern!r}")
        config.path_types[str(pattern)] = str(doc_type)

    allowed_sections = data.get("allowed_sections", {})
    for doc_type, sections in allowed_sections.items():
        if doc_type not in DOC_TYPES:
            raise ValueError(f"unknown doc_type in allowed_sections: {doc_type!r}")
        config.allowed_sections[str(doc_type)] = {
            normalize_section(str(section)) for section in sections
        }

    severities = data.get("severity", {})
    for doc_type, rule_map in severities.items():
        if doc_type not in DOC_TYPES:
            raise ValueError(f"unknown doc_type in severity: {doc_type!r}")
        config.severities.setdefault(str(doc_type), {})
        for rule, severity in rule_map.items():
            config.severities[str(doc_type)][str(rule)] = Severity.parse(str(severity))

    return config
