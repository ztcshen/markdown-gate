import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("runs the installed-style symlink entrypoint from a path containing spaces", () => {
  const directory = mkdtempSync(join(tmpdir(), "markdown-gate cli "));
  const entrypoint = join(directory, "markdown-gate.ts");
  try {
    symlinkSync(resolve("src/cli.ts"), entrypoint);
    for (const [fixture, status, result] of [
      ["api_clean.md", 0, "pass"],
      ["api_dirty.md", 1, "fail"],
    ] as const) {
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          entrypoint,
          "check",
          "--format",
          "json",
          resolve("tests/fixtures", fixture),
        ],
        { encoding: "utf8", input: "" },
      );
      expect(child.status, child.stderr).toBe(status);
      expect(JSON.parse(child.stdout).status).toBe(result);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
