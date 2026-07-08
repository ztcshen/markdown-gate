import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPostToolUse } from "../src/hooks/post-tool-use.js";
import { runPreToolUse } from "../src/hooks/pre-tool-use.js";
import { runStop } from "../src/hooks/stop.js";

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
    execFileSync("git", ["init", "-q"], { cwd: workspace });
    const doc = join(workspace, "docs", "api", "withdraw.md");
    execFileSync("mkdir", ["-p", join(workspace, "docs", "api")]);
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
});
