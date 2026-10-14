# Changelog

## 0.2.0

- Parse CommonMark/GFM prose with mdast, covering headings, tables, lists, quotes, and formatted link labels while excluding code and URL destinations.
- Report every residue occurrence with original source line/column positions, including frontmatter and escaped/entity text. Keep allowed headings within their document/container scope.
- Reject malformed configuration, rule policies, and waivers. Waivers require a reason and explicit scope; invalid expiry dates and unknown rule IDs fail visibly.
- Apply custom path policies before defaults and support zero-directory globstar matches. Deduplicate input paths and skip dependency/Git directories during recursive discovery.
- Validate CLI arguments, support help/version and equals options, and emit structured JSON errors with exit code 2.
- Discover staged, unstaged, and untracked Markdown through NUL-delimited Git output, preserving Unicode and whitespace in filenames.
- Recognize shell event aliases and freeform/structured patch inputs in post-write hooks.
- Expand deterministic unit and Promptfoo coverage across document classes, Markdown syntax, policy errors, and hook scopes.

Upgrade note: headings/tables and repeated residues can now produce additional findings. Older waivers without a reason/scope and previously ignored policy typos now fail validation. Review custom path ordering before applying a 0.1 policy.

## 0.1.1

- Run the packaged CLI through npm executable symlinks and paths containing spaces, preserving pass/fail exit codes.
- Gate inline and file-based Multica descriptions and comments before publication.
- Match Codex tool events consistently across shell, patch, edit, and write tools.
- Refresh dependencies with a pinned pnpm lockfile, patched FTP parsing, and the unused Java-keystore evaluation provider excluded. Runtime dependencies and the remaining evaluation dependency tree retain a full audit gate.
- Remove machine-specific details from regression fixtures.

## 0.1.0

- Added a TypeScript CLI for Markdown final-state hygiene gates.
- Added Codex hook support for pre-publish, post-tool, and final-answer checks.
- Added a built-in final-state residue rule pack.
- Added promptfoo deterministic evals and optional LLM judge evals.
