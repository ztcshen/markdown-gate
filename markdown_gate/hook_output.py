from __future__ import annotations

import json
from typing import Any


def empty() -> str:
    return "{}"


def pre_tool_deny(reason: str, feedback: str | None = None) -> str:
    payload: dict[str, Any] = {
        "decision": "block",
        "reason": reason,
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": _join(reason, feedback),
        },
    }
    return json.dumps(payload, ensure_ascii=False)


def post_tool_block(reason: str, feedback: str | None = None) -> str:
    payload: dict[str, Any] = {
        "decision": "block",
        "reason": reason,
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": _join(reason, feedback),
        },
    }
    return json.dumps(payload, ensure_ascii=False)


def stop_block(reason: str, feedback: str | None = None) -> str:
    payload = {
        "decision": "block",
        "reason": _join(reason, feedback),
    }
    return json.dumps(payload, ensure_ascii=False)


def additional_context(event_name: str, message: str) -> str:
    payload = {
        "hookSpecificOutput": {
            "hookEventName": event_name,
            "additionalContext": message,
        }
    }
    return json.dumps(payload, ensure_ascii=False)


def _join(reason: str, feedback: str | None) -> str:
    if not feedback:
        return reason
    trimmed = feedback.strip()
    if not trimmed:
        return reason
    return f"{reason}\n\n{trimmed[-4000:]}"
