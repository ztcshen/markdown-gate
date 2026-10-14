# markdown-gate

`markdown-gate` is a TypeScript CLI and Codex hook runtime for gating AI-written
Markdown before it becomes published documentation, issue text, access guides,
or implementation plans.

The project uses [promptfoo](https://github.com/promptfoo/promptfoo) as its eval
harness. The local gate stays deterministic and fast; promptfoo supplies the
regression suite, CI surface, and optional LLM judge layer.

## Quick Start

```bash
corepack pnpm install --frozen-lockfile
npm run build
node dist/cli.js check docs/api/request.md
node dist/cli.js check --type issue-description --stdin < issue.md
node dist/cli.js check --format json docs
npm run rules:check
```

Exit codes:

- `0`: no unwaived findings at or above the fail threshold
- `1`: gate failed
- `2`: usage or configuration error

## Scanning Markdown

The scanner uses [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown)
and its [GFM extensions](https://github.com/syntax-tree/mdast-util-gfm), following
CommonMark structure instead of guessing Markdown boundaries from individual lines.

- Scan prose in headings, paragraphs, lists, blockquotes, link labels, and table cells.
- Ignore fenced/indented code, inline code, raw HTML blocks/comments, image nodes,
  link destinations, and automatic URLs. Markdown embedded in raw HTML is outside
  the scanner's coverage. Escaped email spellings that require GFM's additional
  text-rewrite pass stay literal text so source positions remain available.
- Join soft wraps and formatting within a prose block. Keep separate list items,
  table cells, and text around code examples separate.
- Report every rule occurrence with one-based source line/column positions,
  including frontmatter, escaped characters, and character references. Columns
  count UTF-16 code units, consistent with JavaScript string offsets.
- Inherit allowed sections through nested headings until a sibling/ancestor
  heading begins. Headings inside quotes and list items stay inside that container.

Directory inputs skip `.git` and `node_modules`; explicitly supplied files remain
checkable. Overlapping file/directory inputs are deduplicated. Files must be UTF-8
Markdown; this is a policy-based residue detector, not a general Markdown linter
or a semantic proof that a document is ready to publish.

## Policy Configuration

Pass a TOML policy explicitly; configuration files are not automatically discovered:

```bash
node dist/cli.js check --config rules/example.markdown-gate.toml docs
node dist/cli.js check --fail-on warning --format=json docs
node dist/cli.js --help
```

User `path_types` patterns run before built-in defaults, in declaration order.
The first match wins. `**/` matches zero or more directories; `*` stays within one
path segment. Put narrower patterns first. `allowed_sections` replaces the list
for a document type; an empty list clears its allowances.

Unknown keys, rule IDs, document types, invalid severity values, and wrong value
types are errors. Rule packs require actual booleans for
`allow_in_allowed_sections`, so a quoted `"false"` cannot enable an allowance.

CLI options support `--flag=value` and `--` before literal paths. Unknown,
duplicate, missing, and incompatible options exit with code `2`. With
`--format=json`, errors use the following stdout envelope (without a stack trace):

```json
{"status":"error","error":{"message":"path does not exist: missing.md"}}
```

Successful checks retain the `pass`/`fail`, `fail_on`, `documents`, and `findings`
JSON contract. `--help` and `--version` exit successfully.

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

# Request API
```

## Promptfoo Evals

Development uses the pinned pnpm version and Node.js 22.22 or newer. The dependency
policy excludes Promptfoo's optional Java-keystore provider (`jks-js`) because its
cryptography dependency has an unpatched advisory. Local deterministic providers
and the configured OpenAI judge remain available. FTP parsing uses a patched
dependency version; the full remaining development and runtime tree is audited.

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

## Rule Packs

The scanner engine does not hard-code final-state residue phrases. Built-in
rules live in `rules/builtin/final-state-residue.toml` and are validated by:

```bash
npm run rules:check
```

Each rule defines:

- a stable `id`
- a reader-facing `message`
- regex `patterns`
- per-document-type severity
- whether the rule is allowed inside document-type allowed sections

`rules/schema.json` documents the rule pack shape for external rule authors.
The public compatibility surface is rule IDs, document type names, exit codes,
and the JSON report contract.

## Waivers

Waivers live outside the Markdown body. Each entry requires a unique non-empty
`id`, a `reason`, a non-empty list of known rule IDs (or `*`), and a non-empty
`scope` restricting `path`, `doc_type`, or `section`. Scope conditions combine
with AND; a section may match any ancestor heading. Path patterns match the
reported path, so use an absolute pattern when checking absolute file paths.

`expires` is optional. When present it must be a real `YYYY-MM-DD` calendar date;
it remains active through that UTC day. Expired waivers do not suppress findings.
Malformed waivers fail even when the document is clean. The legacy `allow` alias
and a top-level JSON array remain supported; specify either `rules` or `allow`.
Waived findings remain in the report with `waived_by` for inspection.

```json
{
  "waivers": [
    {
      "id": "migration-review-001",
      "rules": ["rejected_prior_solution"],
      "scope": {
        "doc_type": "implementation-plan",
        "path": "docs/plans/service-rollout.md",
        "section": "Alternatives Considered"
      },
      "reason": "The user asked to keep the trade-off note.",
      "expires": "2099-01-01"
    }
  ]
}
```

Run with:

```bash
node dist/cli.js check docs/plans/service-rollout.md \
  --waiver-file .markdown-gate-waivers.json
```

Use a real review deadline in place of the illustrative expiry date above.

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

- `PreToolUse` blocks publish-like shell commands and Multica description/content writes when Markdown fails.
- `PostToolUse` checks Markdown touched by shell commands, patch tools, edit
  tools, and write tools, including `exec_command`/`shell_command` events and
  freeform patch inputs.
- `Stop` checks Markdown final answers, including fenced Markdown and content
  beginning at the first Markdown heading.

Changed-file discovery includes staged, unstaged, and untracked Markdown, handles
Unicode/space/newline filenames, and works in repositories without an initial
commit. Set `MARKDOWN_GATE_PATHS` to an explicit scope when a shell command builds
its inputs dynamically. Hooks inspect recognized payloads and static inputs;
they are a workflow aid, not a sandbox for arbitrary shell execution. A
`PostToolUse` check reports a completed write and cannot undo publication.

## Compatibility Contract

The public contract is the CLI, exit codes, JSON report format, config shape,
document type names, and rule IDs. The scanner implementation can evolve behind
that contract.

For the 0.2 upgrade, review findings newly exposed in headings/table cells and
repeated occurrences. Add `reason` and a non-empty scope to older waivers, fix
previously ignored policy keys, and review user path patterns now that they take
precedence over defaults. The exported `Document` type adds an optional
`lineOffset` for callers scanning a body with a removed frontmatter header.

## GitHub Gates

The GitHub Actions workflow runs:

```bash
corepack pnpm install --frozen-lockfile
npm run check
npm run rules:check
npm run build
npm run eval
npm run pack:dry-run
npm run audit:high
```
