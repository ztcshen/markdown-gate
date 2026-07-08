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

The classifier uses this order:

1. explicit `--type`
2. path policy
3. frontmatter
4. heading heuristics

Path policy is intentionally ahead of frontmatter so a public docs path such as
`docs/api/**` cannot be downgraded to `adr` by stale metadata.

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

Hook coverage in this repository:

- `PreToolUse` blocks publish-like Bash commands when changed Markdown fails.
- `PostToolUse` checks Markdown touched by `apply_patch`, `Edit`, `Write`, and
  likely Markdown-changing Bash commands.
- `Stop` checks Markdown final answers, including fenced Markdown and content
  beginning at the first Markdown heading, while respecting Codex's active stop
  retry flag.

Install project-level hooks with:

```bash
python3 -m markdown_gate install-codex-hooks --force
```

This writes `.codex/hooks.json` in the current repository. Codex will still ask
you to trust non-managed command hooks before running them.

Install globally with:

```bash
python3 -m markdown_gate install-codex-hooks --global --force
```

Global hooks are written to `~/.codex/hooks.json` and use absolute paths to this
repository's hook scripts, so they can run from other Codex workspaces.
