# Contributing

Thanks for helping improve `markdown-gate`.

Before opening a pull request, run:

```bash
corepack pnpm install --frozen-lockfile
npm run check
npm run rules:check
npm run build
npm run eval
npm run pack:dry-run
npm run audit:high
```

Rule changes should update `rules/builtin/final-state-residue.toml`, add or
adjust Vitest coverage, and add a promptfoo example when the behavior affects
publishability decisions.

Keep scanner engine changes separate from rule-pack changes when practical.

Scanner changes should cover both missed findings and legitimate Markdown code
examples, plus source coordinates and section scope. Policy changes need invalid
input cases to ensure a typo cannot silently weaken the gate. Keep the
CommonMark/GFM parser responsible for syntax and the rule pack responsible for
publication policy. Exercise hook installation only in an isolated test directory.
