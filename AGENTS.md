# markdown-gate Agent Notes

## Scope

This repository builds a local Markdown publication gate for AI-authored docs.
Keep the core CLI dependency-light and deterministic; optional LLM judging should
stay behind explicit commands or config.

## Design Rules

- Treat Markdown as the only first-class input format.
- Keep final-state hygiene separate from generic prose linting.
- Do not turn suspicious phrases into global bans. Route findings through
  document type policy and scoped waivers.
- Keep hook scripts thin. They should call the CLI and translate hook payloads,
  not duplicate scanner logic.
- Prefer JSON output for machine integration and concise text for humans.

## Verification

Run before committing:

```bash
python3 -m unittest discover -s tests -v
python3 -m markdown_gate check tests/fixtures/api_clean.md tests/fixtures/adr_allowed.md
python3 -m markdown_gate check tests/fixtures/api_dirty.md
```

The final command is expected to fail; use it to confirm the gate catches a
dirty public API fixture.
