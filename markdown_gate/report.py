from __future__ import annotations

import json

from .model import ScanResult, Severity


def render_json(result: ScanResult) -> str:
    return json.dumps(result.as_dict(), ensure_ascii=False, indent=2)


def render_text(result: ScanResult) -> str:
    lines: list[str] = []
    status = "FAIL" if result.failed else "PASS"
    lines.append(f"markdown-gate: {status} (fail_on={result.fail_on.label()})")

    if result.documents:
        docs = ", ".join(f"{doc.path} [{doc.doc_type}]" for doc in result.documents)
        lines.append(f"documents: {docs}")

    if not result.findings:
        lines.append("findings: none")
        return "\n".join(lines)

    for finding in sorted(
        result.findings,
        key=lambda item: (-int(item.severity), item.path, item.line, item.column),
    ):
        waived = f" waived_by={finding.waived_by}" if finding.waived_by else ""
        location = f"{finding.path}:{finding.line}:{finding.column}"
        section = f" section={finding.section!r}" if finding.section else ""
        lines.append(
            f"{finding.severity.label().upper()} {location} "
            f"{finding.rule}{section}{waived}"
        )
        lines.append(f"  {finding.message}")
        lines.append(f"  > {_trim(finding.excerpt)}")

    if result.failed:
        threshold = _threshold_label(result.fail_on)
        lines.append(f"gate failed: unwaived {threshold} findings are present")

    return "\n".join(lines)


def _threshold_label(severity: Severity) -> str:
    if severity == Severity.ERROR:
        return "error"
    if severity == Severity.WARNING:
        return "warning/error"
    if severity == Severity.SUGGESTION:
        return "suggestion/warning/error"
    return "enabled"


def _trim(value: str, limit: int = 140) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"
