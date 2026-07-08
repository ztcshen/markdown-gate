from __future__ import annotations

from dataclasses import replace
from datetime import date
import fnmatch
import json
from pathlib import Path
from typing import Any

from .config import normalize_section
from .model import Finding


def apply_waivers(findings: list[Finding], waiver_file: str | None) -> list[Finding]:
    if not waiver_file:
        return findings

    waivers = _load_waivers(Path(waiver_file))
    today = date.today()
    updated: list[Finding] = []
    for finding in findings:
        waiver_id = _matching_waiver(finding, waivers, today)
        updated.append(replace(finding, waived_by=waiver_id) if waiver_id else finding)
    return updated


def _load_waivers(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"waiver file not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    waivers = data.get("waivers", [])
    if not isinstance(waivers, list):
        raise ValueError("waiver file must contain a list or a top-level 'waivers' list")
    return waivers


def _matching_waiver(
    finding: Finding,
    waivers: list[dict[str, Any]],
    today: date,
) -> str | None:
    for waiver in waivers:
        waiver_id = str(waiver.get("id") or "")
        if not waiver_id:
            continue

        expires = waiver.get("expires")
        if isinstance(expires, str) and expires:
            try:
                if date.fromisoformat(expires) < today:
                    continue
            except ValueError:
                continue

        rules = waiver.get("rules") or waiver.get("allow") or []
        if finding.rule not in rules and "*" not in rules:
            continue

        scope = waiver.get("scope") or {}
        if not _scope_matches(finding, scope):
            continue

        return waiver_id
    return None


def _scope_matches(finding: Finding, scope: dict[str, Any]) -> bool:
    path_pattern = scope.get("path")
    if path_pattern and not fnmatch.fnmatch(finding.path, str(path_pattern)):
        return False

    doc_type = scope.get("doc_type")
    if doc_type and str(doc_type) != finding.doc_type:
        return False

    section = scope.get("section")
    if section:
        if not finding.section:
            return False
        if normalize_section(str(section)) != normalize_section(finding.section):
            return False

    return True
