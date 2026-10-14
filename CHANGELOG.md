# Changelog

## 0.1.1

- Gate inline and file-based Multica descriptions and comments before publication.
- Match Codex tool events consistently across shell, patch, edit, and write tools.
- Refresh dependencies with a pinned pnpm lockfile, patched FTP parsing, and the unused Java-keystore evaluation provider excluded. Runtime dependencies and the remaining evaluation dependency tree retain a full audit gate.
- Remove machine-specific details from regression fixtures.

## 0.1.0

- Added a TypeScript CLI for Markdown final-state hygiene gates.
- Added Codex hook support for pre-publish, post-tool, and final-answer checks.
- Added a built-in final-state residue rule pack.
- Added promptfoo deterministic evals and optional LLM judge evals.
