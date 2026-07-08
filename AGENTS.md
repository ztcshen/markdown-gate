# markdown-gate Agent Notes

## Scope

This repository builds a Markdown publication gate for AI-authored docs. The
canonical implementation is TypeScript/Node. Promptfoo is the eval harness for
regression suites and optional LLM judging.

## Design Rules

- Treat Markdown as the only first-class input format.
- Keep final-state hygiene separate from generic prose linting.
- Route suspicious phrases through document type policy and scoped waivers.
- Keep hook entrypoints thin. They should call the CLI/runtime and translate hook
  payloads without duplicating scanner logic.
- Prefer JSON output for machine integration and concise text for humans.
- Keep promptfoo evals close to real document classes: API docs, access guides,
  implementation plans, issue descriptions, ADRs, and runbooks.

## Verification

Run before committing:

```bash
npm run check
npm run build
npm run eval
node dist/cli.js check tests/fixtures/api_clean.md tests/fixtures/adr_allowed.md
node dist/cli.js check tests/fixtures/api_dirty.md
node dist/cli.js install-codex-hooks --force
```

The dirty fixture check is expected to fail; use it to confirm the gate catches
a dirty public API fixture.
