#!/usr/bin/env python3
from __future__ import annotations

import json
import sys


def main() -> int:
    # The Stop hook is intentionally conservative in the MVP. It can remind the
    # agent when the transcript suggests Markdown delivery, but it does not
    # parse full conversation state yet.
    payload = _read_payload()
    last_message = str(payload.get("last_assistant_message") or payload.get("message") or "")
    if "```markdown" in last_message or last_message.strip().startswith("#"):
        print(
            json.dumps(
                {
                    "feedback": (
                        "Before final delivery, run `python3 -m markdown_gate check` "
                        "on any Markdown artifact or pipe the Markdown through "
                        "`--stdin --type <doc-type>`."
                    )
                }
            )
        )
    else:
        print(json.dumps({}))
    return 0


def _read_payload() -> dict[str, object]:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


if __name__ == "__main__":
    raise SystemExit(main())
