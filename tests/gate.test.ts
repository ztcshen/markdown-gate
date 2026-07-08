import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPaths, checkText } from "../src/gate.js";

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
});
