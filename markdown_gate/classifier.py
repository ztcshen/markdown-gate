from __future__ import annotations

import re

from .config import DOC_TYPES, GateConfig
from .frontmatter import split_frontmatter


HEADING_HINTS = [
    (re.compile(r"^\s*#.+(api|接口|endpoint)", re.I), "public-api-doc"),
    (re.compile(r"^\s*#.+(access|接入|guide|指南)", re.I), "access-guide"),
    (re.compile(r"^\s*#.+(plan|方案|implementation)", re.I), "implementation-plan"),
    (re.compile(r"^\s*#.+(issue|问题|需求)", re.I), "issue-description"),
    (re.compile(r"^\s*#.+(adr|architecture decision record)", re.I), "adr"),
    (re.compile(r"^\s*#.+(runbook|操作手册|应急)", re.I), "runbook"),
]


def classify_document(
    path: str,
    text: str,
    config: GateConfig,
    explicit_type: str | None = None,
) -> tuple[str, dict[str, object], str]:
    metadata, body = split_frontmatter(text)

    if explicit_type:
        return _validate_doc_type(explicit_type), metadata, body

    path_type = config.classify_path(path)
    if path_type:
        return path_type, metadata, body

    fm_type = metadata.get("doc_type") or metadata.get("type")
    if isinstance(fm_type, str) and fm_type:
        return _validate_doc_type(fm_type), metadata, body

    for line in body.splitlines()[:20]:
        for pattern, doc_type in HEADING_HINTS:
            if pattern.search(line):
                return doc_type, metadata, body

    return "unknown", metadata, body


def _validate_doc_type(doc_type: str) -> str:
    if doc_type not in DOC_TYPES:
        known = ", ".join(sorted(DOC_TYPES))
        raise ValueError(f"unknown doc_type {doc_type!r}; expected one of: {known}")
    return doc_type
