import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPostToolUse } from "../src/hooks/post-tool-use.js";
import { runPreToolUse } from "../src/hooks/pre-tool-use.js";
import { changedMarkdownPaths } from "../src/hooks/shared.js";
import { runStop } from "../src/hooks/stop.js";

const workspaces: string[] = [];
afterEach(() => {
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Codex hooks", () => {
  it("blocks publish commands when the explicit scope is dirty", () => {
    const previous = process.env.MARKDOWN_GATE_PATHS;
    process.env.MARKDOWN_GATE_PATHS = "tests/fixtures/api_dirty.md";
    try {
      const output = runPreToolUse(
        JSON.stringify({
          cwd: process.cwd(),
          tool_name: "Bash",
          tool_input: { command: "docs publish" },
        }),
      );
      const payload = JSON.parse(output);
      expect(payload.decision).toBe("block");
      expect(payload.hookSpecificOutput.permissionDecision).toBe("deny");
    } finally {
      if (previous === undefined) {
        delete process.env.MARKDOWN_GATE_PATHS;
      } else {
        process.env.MARKDOWN_GATE_PATHS = previous;
      }
    }
  });

  it("blocks inline Multica descriptions before the remote write", () => {
    const output = runPreToolUse(
      JSON.stringify({
        cwd: process.cwd(),
        tool_name: "Bash",
        tool_input: {
          command:
            'multica issue create --title "Example names" --description "不应混用：示例一、示例二"',
        },
      }),
    );

    expect(JSON.parse(output).decision).toBe("block");
  });

  it("blocks Multica API helper content files before the remote write", () => {
    const output = runPreToolUse(
      JSON.stringify({
        cwd: process.cwd(),
        tool_name: "Bash",
        tool_input: {
          command:
            "python3 /opt/tools/multica_api.py --profile example comment ISSUE-1 --content-file tests/fixtures/api_dirty.md",
        },
      }),
    );

    expect(JSON.parse(output).decision).toBe("block");
  });

  it("blocks dirty Markdown from an apply_patch payload", () => {
    const output = runPostToolUse(
      JSON.stringify({
        cwd: process.cwd(),
        tool_name: "apply_patch",
        tool_input: {
          command:
            "*** Begin Patch\n*** Update File: tests/fixtures/api_dirty.md\n@@\n-x\n+x\n*** End Patch\n",
        },
      }),
    );

    expect(JSON.parse(output).decision).toBe("block");
  });

  it.each([
    { tool_input: "*** Update File: tests/fixtures/api_dirty.md\n" },
    { input: { patch: "*** Update File: tests/fixtures/api_dirty.md\n" } },
  ])("handles freeform and structured patch inputs", (input) => {
    expect(
      JSON.parse(
        runPostToolUse(JSON.stringify({ cwd: process.cwd(), tool_name: "apply_patch", ...input })),
      ).decision,
    ).toBe("block");
  });

  it.each(["exec_command", "shell_command", "Bash"])("checks Markdown after %s", (tool_name) => {
    const workspace = mkdtempSync(join(tmpdir(), "markdown-gate-shell-"));
    workspaces.push(workspace);
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    writeFileSync(join(workspace, "api.md"), "# API\n\nThe previous design.");
    const output = runPostToolUse(
      JSON.stringify({ cwd: workspace, tool_name, tool_input: { cmd: "cat > api.md" } }),
    );
    expect(JSON.parse(output).decision).toBe("block");
  });

  it("blocks dirty final Markdown messages", () => {
    const output = runStop(
      JSON.stringify({
        cwd: process.cwd(),
        last_assistant_message: "# API\n\nThe previous design used old_field.",
        markdown_gate_doc_type: "public-api-doc",
      }),
    );

    expect(JSON.parse(output).decision).toBe("block");
  });

  it("ignores active stop retries", () => {
    const output = runStop(
      JSON.stringify({
        stop_hook_active: true,
        last_assistant_message: "# API\n\nThe previous design used old_field.",
        markdown_gate_doc_type: "public-api-doc",
      }),
    );

    expect(JSON.parse(output)).toEqual({});
  });

  it("runs from an external git workspace", () => {
    const workspace = mkdtempSync(join(tmpdir(), "markdown-gate-workspace-"));
    workspaces.push(workspace);
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    const doc = join(workspace, "docs", "api", "withdraw.md");
    mkdirSync(join(workspace, "docs", "api"), { recursive: true });
    writeFileSync(
      doc,
      "# Withdraw API\n\nThe previous design used old_field, but it has been removed.\n",
    );

    const output = runPreToolUse(
      JSON.stringify({
        cwd: workspace,
        tool_name: "Bash",
        tool_input: { command: "docs publish" },
      }),
    );

    const payload = JSON.parse(output);
    expect(payload.decision).toBe("block");
    expect(payload.hookSpecificOutput.permissionDecisionReason).toContain(
      "rejected_prior_solution",
    );
  });

  it("discovers staged, unstaged, and untracked Unicode paths without quoting loss", () => {
    const workspace = mkdtempSync(join(tmpdir(), "markdown-gate-paths-"));
    workspaces.push(workspace);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: workspace });
    git("init", "-q");
    mkdirSync(join(workspace, "docs"));
    const staged = "docs/接口 草稿.md";
    writeFileSync(join(workspace, staged), "# API\n\nThe previous design.");
    git("add", "--", staged);
    expect(changedMarkdownPaths(workspace)).toEqual([staged]);
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    writeFileSync(join(workspace, staged), "# API\n\nThe previous approach.");
    const untracked = "docs/ draft\nnotes.md";
    writeFileSync(join(workspace, untracked), "# API\n\nThe previous design.");
    expect(changedMarkdownPaths(workspace)).toEqual([untracked, staged].sort());
    expect(changedMarkdownPaths(join(workspace, "docs"))).toEqual(
      [" draft\nnotes.md", "接口 草稿.md"].sort(),
    );
    expect(
      JSON.parse(
        runPreToolUse(JSON.stringify({ cwd: workspace, tool_input: { command: "docs publish" } })),
      ).decision,
    ).toBe("block");
  });

  it.each(["null", "[]", "1", "invalid json"])(
    "handles a malformed hook envelope %s",
    (payload) => {
      expect(JSON.parse(runPreToolUse(payload))).toEqual({});
      expect(JSON.parse(runPostToolUse(payload))).toEqual({});
      expect(JSON.parse(runStop(payload))).toEqual({});
    },
  );
});
