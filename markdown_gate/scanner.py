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
            r"(已移除|已删除|已调整|已修正|修正为|调整为|改成|"
            r"has been removed|was removed|removed from|updated from|fixed by|"
            r"dropped\b)",
            re.I,
        ),
        "Looks like revision history rather than final-state documentation.",
    ),
    PatternRule(
        "rejected_prior_solution",
        re.compile(
            r"(之前方案|上一版|旧方案|原方案|历史方案|这里不采用|不采用该方案|"
            r"previous (design|approach|version)|old (design|approach)|"
            r"rejected (design|approach|alternative)|not adopted|"
            r"formerly\b|former version|prior version|legacy (field|design|approach)|"
            r"deprecated|superseded|replaced by|renamed from|originally)",
            re.I,
        ),
        "Looks like rejected or prior design context.",
    ),
    PatternRule(
        "self_correction",
        re.compile(
            r"(更正|纠正|修正说明|前面.*错误|此前.*错误|不是.*而是|"
            r"correction|corrected)",
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
            r"(\bdo not\b|\bdon't\b|\bmust not\b|\bno\b(?!\s+(?:longer|more)\s+than)|"
            r"不要|不得|禁止)",
            re.I,
        ),
        "Negative constraint detected; verify it belongs in this document type and section.",
    ),
]


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
ALLOWED_SECTION_RULES = {
    "revision_trace",
    "rejected_prior_solution",
    "negative_constraint",
}


@dataclass(frozen=True)
class Segment:
    line: int
    column: int
    start: int
    text: str


@dataclass(frozen=True)
class ProseBlock:
    text: str
    segments: tuple[Segment, ...]
    sections: tuple[str, ...]

    @property
    def section(self) -> str | None:
        return self.sections[-1] if self.sections else None


def scan_documents(documents: Iterable[Document], config: GateConfig) -> list[Finding]:
    findings: list[Finding] = []
    for document in documents:
        findings.extend(scan_document(document, config))
    return findings


def scan_document(document: Document, config: GateConfig) -> list[Finding]:
    findings: list[Finding] = []
    for block in iter_prose_blocks(document.text):
        for pattern in PATTERNS:
            match = pattern.regex.search(block.text)
            if not match:
                continue

            if config.is_allowed_section_path(document.doc_type, list(block.sections)):
                if pattern.rule in ALLOWED_SECTION_RULES:
                    continue
                # Allowed sections still surface very process-heavy wording, but
                # ordinary alternatives/constraints do not block final copy.
                severity = config.severity_for(document.doc_type, pattern.rule)
                if severity <= Severity.SUGGESTION:
                    continue
            else:
                severity = config.severity_for(document.doc_type, pattern.rule)

            if severity == Severity.OFF:
                continue

            line_number, column = _locate_match(block, match.start())
            findings.append(
                Finding(
                    path=document.path,
                    doc_type=document.doc_type,
                    line=line_number,
                    column=column,
                    rule=pattern.rule,
                    severity=severity,
                    message=pattern.message,
                    excerpt=block.text.strip(),
                    section=block.section,
                    sections=block.sections,
                )
            )

    return findings


def iter_prose_blocks(text: str) -> Iterable[ProseBlock]:
    section_stack: list[tuple[int, str]] = []
    segments: list[Segment] = []
    in_fence = False

    def flush() -> ProseBlock | None:
        nonlocal segments
        if not segments:
            return None
        block_text = " ".join(segment.text for segment in segments)
        offset = 0
        normalized_segments: list[Segment] = []
        for segment in segments:
            normalized_segments.append(
                Segment(
                    line=segment.line,
                    column=segment.column,
                    start=offset,
                    text=segment.text,
                )
            )
            offset += len(segment.text) + 1
        segments = []
        return ProseBlock(
            text=block_text,
            segments=tuple(normalized_segments),
            sections=tuple(title for _, title in section_stack),
        )

    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()

        if FENCE_RE.match(line):
            block = flush()
            if block:
                yield block
            in_fence = not in_fence
            continue

        if in_fence:
            continue

        heading = HEADING_RE.match(line)
        if heading:
            block = flush()
            if block:
                yield block
            level = len(heading.group(1))
            title = _strip_markdown_title(heading.group(2))
            while section_stack and section_stack[-1][0] >= level:
                section_stack.pop()
            section_stack.append((level, title))
            continue

        if not stripped or _looks_like_table_row(stripped):
            block = flush()
            if block:
                yield block
            continue

        column = len(line) - len(line.lstrip()) + 1
        segments.append(Segment(line=line_number, column=column, start=0, text=stripped))

    block = flush()
    if block:
        yield block


def _locate_match(block: ProseBlock, offset: int) -> tuple[int, int]:
    for segment in block.segments:
        end = segment.start + len(segment.text)
        if segment.start <= offset <= end:
            return segment.line, segment.column + max(0, offset - segment.start)
    if block.segments:
        last = block.segments[-1]
        return last.line, last.column
    return 1, 1


def _looks_like_table_row(stripped: str) -> bool:
    if stripped.startswith("|") and stripped.endswith("|"):
        return True
    return bool(re.fullmatch(r"\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?", stripped))


def _strip_markdown_title(title: str) -> str:
    return title.strip().strip("#").strip()
