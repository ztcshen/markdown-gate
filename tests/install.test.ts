import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  globalHooksJson,
  installCodexHooks,
  installGlobalCodexHooks,
  projectHooksJson,
} from "../src/install.js";

let root: string;
let source: string;
let project: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "markdown-gate-install-"));
  source = join(root, "runtime with spaces");
  project = join(root, "external-project");
  mkdirSync(join(source, "dist"), { recursive: true });
  writeFileSync(
    join(source, "dist", "cli.js"),
    "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function saveExisting(value: unknown): string {
  const target = join(project, ".codex", "hooks.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value)}\n`);
  return target;
}
const foreign = { type: "command", command: "other-check", timeout: 7 };

describe("hook installation", () => {
  it("merges integrations and creates an exact backup", () => {
    const existing = {
      custom: { enabled: true },
      hooks: {
        SessionStart: [{ hooks: [foreign] }],
        PreToolUse: [{ matcher: "Write", hooks: [foreign] }],
      },
    };
    const target = saveExisting(existing);
    const original = readFileSync(target, "utf8");
    expect(installCodexHooks(project, false, source)).toBe(target);
    const value = JSON.parse(readFileSync(target, "utf8"));
    expect(value.custom).toEqual(existing.custom);
    expect(value.hooks.SessionStart).toEqual(existing.hooks.SessionStart);
    expect(value.hooks.PreToolUse[0]).toEqual(existing.hooks.PreToolUse[0]);
    expect(value.hooks.PreToolUse).toHaveLength(2);
    const backups = readdirSync(dirname(target)).filter((name) => name.endsWith(".bak"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(dirname(target), backups[0]), "utf8")).toBe(original);
  });

  it("does not rewrite or duplicate a repeated installation", () => {
    const target = installCodexHooks(project, false, source);
    const before = readFileSync(target, "utf8");
    installCodexHooks(project, false, source);
    expect(readFileSync(target, "utf8")).toBe(before);
    expect(readdirSync(dirname(target))).toEqual(["hooks.json"]);
  });

  it("requires force for owned changes and preserves mixed foreign commands", () => {
    const old = {
      type: "command",
      command: 'node "/old/markdown-gate/dist/cli.js" hook pre-tool-use',
      timeout: 30,
      statusMessage: "Checking Markdown publish gate",
    };
    const target = saveExisting({
      hooks: { PreToolUse: [{ matcher: "*", label: "shared", hooks: [old, foreign] }] },
    });
    const before = readFileSync(target, "utf8");
    expect(() => installCodexHooks(project, false, source)).toThrow(/--force/);
    expect(readFileSync(target, "utf8")).toBe(before);
    installCodexHooks(project, true, source);
    const entries = JSON.parse(readFileSync(target, "utf8")).hooks.PreToolUse;
    expect(entries[0]).toEqual({ matcher: "*", label: "shared", hooks: [foreign] });
    expect(entries[1]).toEqual(projectHooksJson(source).hooks.PreToolUse[0]);
  });

  it.each([null, [], { hooks: [] }, { hooks: { Stop: {} } }, { hooks: { Stop: [{}] } }])(
    "rejects malformed configuration even with force: %j",
    (value) => {
      const target = saveExisting(value);
      const before = readFileSync(target, "utf8");
      expect(() => installCodexHooks(project, true, source)).toThrow();
      expect(readFileSync(target, "utf8")).toBe(before);
      expect(readdirSync(dirname(target))).toEqual(["hooks.json"]);
    },
  );

  it("rejects invalid JSON and symlinks without modifying their targets", () => {
    const target = saveExisting({});
    writeFileSync(target, "not json");
    expect(() => installCodexHooks(project, true, source)).toThrow();
    expect(readFileSync(target, "utf8")).toBe("not json");
    rmSync(target);
    const external = join(root, "external.json");
    writeFileSync(external, "{}");
    symlinkSync(external, target);
    expect(() => installCodexHooks(project, true, source)).toThrow(/symlink/);
    expect(readFileSync(external, "utf8")).toBe("{}");
  });

  it("checks the runtime before creating project configuration", () => {
    expect(() => installCodexHooks(project, false, join(root, "missing"))).toThrow(
      /Build markdown-gate/,
    );
    expect(readdirSync(root)).toEqual(["runtime with spaces"]);
  });

  it("quotes executable paths literally and works from another working directory", () => {
    const special = join(root, "source ' $(touch SHOULD_NOT_EXIST) `literal`");
    mkdirSync(join(special, "dist"), { recursive: true });
    writeFileSync(
      join(special, "dist", "cli.js"),
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));",
    );
    for (const [event, action] of [
      ["PreToolUse", "pre-tool-use"],
      ["PostToolUse", "post-tool-use"],
      ["Stop", "stop"],
    ]) {
      const child = spawnSync(
        "/bin/sh",
        ["-c", globalHooksJson(special).hooks[event][0].hooks[0].command],
        { cwd: root, encoding: "utf8", input: "{}" },
      );
      expect(child.status, child.stderr).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual(["hook", action]);
    }
    expect(readdirSync(root)).not.toContain("SHOULD_NOT_EXIST");
  });

  it("installs global hooks into an isolated home using the explicit source runtime", () => {
    const target = installGlobalCodexHooks(join(root, "codex-home"), source);
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(globalHooksJson(source));
  });
});
