# markdown-gate

`markdown-gate` checks Markdown drafts before they become published docs,
issue descriptions, access guides, or plans. It focuses on one AI-writing
failure mode: process residue leaking into final copy.

It is not a generic forbidden-words linter. Phrases such as "not", "do not",
or "previous design" can be valid in ADRs and runbooks. The gate combines
document type policy, suspicious-signal scanning, and scoped waivers.

## Quick Start

```bash
python3 -m markdown_gate check docs/api/withdraw.md
python3 -m markdown_gate check --type issue-description --stdin < issue.md
python3 -m markdown_gate check --format json docs
```

Exit codes:

- `0`: no unwaived findings at or above the fail threshold
- `1`: gate failed
- `2`: usage or configuration error

## Document Types

Supported types in the MVP:

- `public-api-doc`
- `access-guide`
- `implementation-plan`
- `issue-description`
- `adr`
- `runbook`
- `unknown`

The classifier uses frontmatter first, then path and heading heuristics.

```markdown
---
doc_type: public-api-doc
---

# Withdraw Apply API
```

## Waivers

Waivers live outside the document body.

```json
{
  "waivers": [
    {
      "id": "W-2026-07-08-001",
      "rules": ["rejected_prior_solution"],
      "scope": {
        "doc_type": "implementation-plan",
        "path": "docs/plans/scf-rollout.md",
        "section": "Alternatives Considered"
      },
      "reason": "The user asked to keep the trade-off note.",
      "expires": "2026-07-15"
    }
  ]
}
```

Run with:

```bash
python3 -m markdown_gate check docs/plans/scf-rollout.md \
  --waiver-file .markdown-gate-waivers.json
```

## Codex Hooks

Hook scripts under `hooks/codex/` are intentionally thin wrappers around the
CLI. They read hook JSON from stdin, inspect changed Markdown files or publish
commands, and return JSON that Codex can use as feedback.

This repository does not install hooks automatically yet. Keep hook rollout
explicit until the rule set is stable.
