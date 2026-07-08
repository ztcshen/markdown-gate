from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

from .config import GateConfig
from .model import Document, Finding, Severity


@dataclass(frozen=True)
class PatternRule:
    rule: str
    regex: re.Pattern[str]
    message: str


PATTERNS = [
    PatternRule(
        "revision_trace",
        re.compile(
            r"(已移除|已删除|已调整|已修正|修正为|调整为|改成|不再|no longer|"
            r"removed|updated to|changed to|fixed by)",
            re.I,
        ),
        "Looks like revision history rather than final-state documentation.",
    ),
    PatternRule(
        "rejected_prior_solution",
        re.compile(
            r"(之前方案|上一版|旧方案|原方案|历史方案|这里不采用|不采用该方案|"
            r"previous (design|approach|version)|old (design|approach)|"
            r"rejected (design|approach|alternative)|not adopted)",
            re.I,
        ),
        "Looks like rejected or prior design context.",
    ),
    PatternRule(
        "self_correction",
        re.compile(
            r"(更正|纠正|修正说明|前面.*错误|此前.*错误|不是.*而是|"
            r"correction|corrected|instead of|rather than|not .+ but)",
            re.I,
        ),
        "Looks like self-correction language.",
    ),
    PatternRule(
        "internal_authoring_process",
        re.compile(
            r"(为了避免.*误解|为了避免.*上一|为避免.*再次|按你的反馈|根据反馈|"
            r"as requested|based on feedback|to avoid confusion|draft residue|"
            r"drafting history|draft note|草稿痕迹|草稿说明)",
            re.I,
        ),
        "Looks like internal authoring process leaking into the document.",
    ),
    PatternRule(
        "negative_constraint",
        re.compile(
            r"(\bdo not\b|\bdon't\b|\bmust not\b|\bno\b|不要|不得|禁止)",
            re.I,
        ),
        "Negative constraint detected; verify it belongs in this document type and section.",
    ),
]


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def scan_documents(documents: Iterable[Document], config: GateConfig) -> list[Finding]:
    findings: list[Finding] = []
    for document in documents:
        findings.extend(scan_document(document, config))
    return findings


def scan_document(document: Document, config: GateConfig) -> list[Finding]:
    findings: list[Finding] = []
    section_stack: list[tuple[int, str]] = []

    for line_number, line in enumerate(document.text.splitlines(), start=1):
        heading = HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            title = _strip_markdown_title(heading.group(2))
            while section_stack and section_stack[-1][0] >= level:
                section_stack.pop()
            section_stack.append((level, title))
            continue

        current_section = section_stack[-1][1] if section_stack else None
        for pattern in PATTERNS:
            match = pattern.regex.search(line)
            if not match:
                continue

            if config.is_allowed_section(document.doc_type, current_section):
                # Allowed sections still surface very process-heavy wording, but
                # ordinary alternatives/constraints do not block final copy.
                severity = config.severity_for(document.doc_type, pattern.rule)
                if severity <= Severity.SUGGESTION:
                    continue
            else:
                severity = config.severity_for(document.doc_type, pattern.rule)

            if severity == Severity.OFF:
                continue

            findings.append(
                Finding(
                    path=document.path,
                    doc_type=document.doc_type,
                    line=line_number,
                    column=match.start() + 1,
                    rule=pattern.rule,
                    severity=severity,
                    message=pattern.message,
                    excerpt=line.strip(),
                    section=current_section,
                )
            )

    return findings


def _strip_markdown_title(title: str) -> str:
    return title.strip().strip("#").strip()
