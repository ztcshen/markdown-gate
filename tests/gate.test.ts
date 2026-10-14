import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPaths, checkText, expandPaths } from "../src/gate.js";

const workspaces: string[] = [];
afterEach(() => {
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("gate", () => {
  it("fails dirty public API stdin content", () => {
    const result = checkText("<stdin>", "# API\n\n已移除上一版方案中的 old_field。\n", {
      explicitType: "public-api-doc",
    });

    expect(result.status).toBe("fail");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("passes the clean fixture", () => {
    const result = checkPaths(["tests/fixtures/api_clean.md"]);
    expect(result.status).toBe("pass");
  });

  it("supports scoped waivers outside the Markdown body", () => {
    const root = mkdtempSync(join(tmpdir(), "markdown-gate-"));
    workspaces.push(root);
    const doc = join(root, "api.md");
    const waiver = join(root, "waivers.json");
    writeFileSync(
      doc,
      "---\ndoc_type: public-api-doc\n---\n\n# API\n\nThe previous design used old_field.\n",
    );
    writeFileSync(
      waiver,
      JSON.stringify({
        waivers: [
          {
            id: "W-test",
            reason: "This migration guide intentionally records the prior contract.",
            rules: ["rejected_prior_solution"],
            scope: {
              doc_type: "public-api-doc",
              path: doc,
              section: "API",
            },
            expires: "2099-01-01",
          },
        ],
      }),
    );

    const result = checkPaths([doc], { waiverFile: waiver });

    expect(result.status).toBe("pass");
    expect(result.findings.some((finding) => finding.waivedBy === "W-test")).toBe(true);
  });

  it("deduplicates overlapping inputs and skips dependencies during directory discovery", () => {
    const root = mkdtempSync(join(tmpdir(), "markdown-gate-paths-"));
    workspaces.push(root);
    const doc = join(root, "example.md");
    writeFileSync(doc, "# API");
    for (const name of [".git", "node_modules"]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "ignored.md"), "# API\n\nThe previous design.");
    }
    expect(expandPaths([root, doc, join(root, ".", "example.md")])).toEqual([doc]);
    expect(checkPaths([root]).status).toBe("pass");
    expect(expandPaths([join(root, "node_modules", "ignored.md")])).toHaveLength(1);
  });
});
