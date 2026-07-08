from __future__ import annotations

from typing import Any


def split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse a small YAML-like frontmatter block without adding dependencies."""
    if not text.startswith("---\n"):
        return {}, text

    lines = text.splitlines(keepends=True)
    end_index = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            end_index = idx
            break

    if end_index is None:
        return {}, text

    metadata: dict[str, Any] = {}
    for raw in lines[1:end_index]:
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        metadata[key.strip()] = _parse_scalar(value.strip())

    # Preserve source line numbers after stripping metadata from semantic scans.
    body = "\n" * (end_index + 1) + "".join(lines[end_index + 1 :])
    return metadata, body


def _parse_scalar(value: str) -> Any:
    if value in {"true", "True"}:
        return True
    if value in {"false", "False"}:
        return False
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(part.strip()) for part in inner.split(",")]
    return value
