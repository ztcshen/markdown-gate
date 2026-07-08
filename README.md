# markdown-gate

`markdown-gate` is a TypeScript CLI and Codex hook runtime for gating AI-written
Markdown before it becomes published documentation, issue text, access guides,
or implementation plans.

The project uses [promptfoo](https://github.com/promptfoo/promptfoo) as its eval
harness. The local gate stays deterministic and fast; promptfoo supplies the
regression suite, CI surface, and optional LLM judge layer.

## Quick Start

```bash
npm install
npm run build
node dist/cli.js check docs/api/withdraw.md
node dist/cli.js check --type issue-description --stdin < issue.md
node dist/cli.js check --format json docs
```

Exit codes:

- `0`: no unwaived findings at or above the fail threshold
- `1`: gate failed
- `2`: usage or configuration error

## Document Types

Supported document types:

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

Path policy is ahead of frontmatter, so a public docs path such as `docs/api/**`
keeps its public API policy even when stale metadata exists.

```markdown
---
doc_type: public-api-doc
---

# Withdraw Apply API
```

## Promptfoo Evals

Run the deterministic regression suite:

```bash
npm run build
npm run eval
```

The promptfoo provider in `evals/providers/markdown-gate-provider.cjs` calls the
built CLI and returns the JSON gate report. This keeps local hook checks fast
while still making Markdown quality measurable in CI.

Run the optional LLM judge suite when model credentials are available:

```bash
OPENAI_API_KEY=... npm run eval:llm
```

## Waivers

Waivers live outside the Markdown body.

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
node dist/cli.js check docs/plans/scf-rollout.md \
  --waiver-file .markdown-gate-waivers.json
```

## Codex Hooks

Install project-level hooks:

```bash
npm run build
node dist/cli.js install-codex-hooks --force
```

Install global hooks:

```bash
npm run build
node dist/cli.js install-codex-hooks --global --force --repo-root "$(pwd)"
```

Hook coverage:

- `PreToolUse` blocks publish-like shell commands when changed Markdown fails.
- `PostToolUse` checks Markdown touched by shell commands, patch tools, edit
  tools, and write tools.
- `Stop` checks Markdown final answers, including fenced Markdown and content
  beginning at the first Markdown heading.

## Compatibility Contract

The public contract is the CLI, exit codes, JSON report format, config shape,
document type names, and rule IDs. The scanner implementation can evolve behind
that contract.
