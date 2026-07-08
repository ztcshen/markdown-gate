# Contributing

Thanks for helping improve `markdown-gate`.

Before opening a pull request, run:

```bash
npm ci
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
