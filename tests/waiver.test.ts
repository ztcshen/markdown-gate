import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkText } from "../src/gate.js";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "markdown-gate-waiver-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
const valid = {
  id: "review-1",
  rules: ["rejected_prior_solution"],
  reason: "Approved migration context.",
  scope: { path: "docs/api/example.md", doc_type: "public-api-doc", section: "Migration" },
  expires: "2099-01-01",
};
function scan(waivers: unknown) {
  const waiverFile = join(directory, "waivers.json");
  writeFileSync(waiverFile, JSON.stringify({ waivers }));
  return checkText("docs/api/example.md", "# API\n\n## Migration\n\nThe previous design.", {
    waiverFile,
  });
}

describe("scoped waiver validation", () => {
  it.each([
    [{ id: "" }, "non-empty string"],
    [{ reason: undefined }, "reason"],
    [{ rules: "rejected_prior_solution" }, "string array"],
    [{ rules: [] }, "string array"],
    [{ rules: ["rejected_prior_soluton"] }, "unknown rule"],
    [{ rules: [42] }, "non-empty string"],
    [{ allow: ["*"] }, "either rules or allow"],
    [{ scope: undefined }, "object/table"],
    [{ scope: {} }, "must restrict"],
    [{ scope: { paths: "docs/**" } }, "unknown key"],
    [{ scope: { path: "" } }, "non-empty string"],
    [{ scope: { doc_type: "typo" } }, "unknown doc_type"],
    [{ scope: { section: false } }, "non-empty string"],
    [{ expires: "tomorrow" }, "real YYYY-MM-DD"],
    [{ expires: "2027-02-29" }, "real YYYY-MM-DD"],
    [{ expires: "2099-13-01" }, "real YYYY-MM-DD"],
    [{ expires: 20990101 }, "non-empty string"],
    [{ expiry: "2099-01-01" }, "unknown key"],
  ])("rejects invalid waiver fields %j", (override, message) => {
    expect(() => scan([{ ...valid, ...override }])).toThrow(message);
  });

  it("rejects duplicate waiver IDs and non-object entries", () => {
    expect(() => scan([valid, valid])).toThrow("duplicate waiver id");
    expect(() => scan([null])).toThrow("object/table");
  });

  it("preserves findings and records the applied waiver ID", () => {
    const result = scan([valid]);
    expect(result.status).toBe("pass");
    expect(result.findings[0]).toMatchObject({
      rule: "rejected_prior_solution",
      waivedBy: valid.id,
    });
  });

  it("does not apply expired or out-of-scope waivers", () => {
    for (const waiver of [
      { ...valid, expires: "2000-01-01" },
      { ...valid, scope: { path: "docs/api/other.md" } },
      { ...valid, scope: { doc_type: "adr" } },
      { ...valid, scope: { section: "Other" } },
    ]) {
      const result = scan([waiver]);
      expect(result.status).toBe("fail");
      expect(result.findings[0].waivedBy).toBeUndefined();
    }
  });

  it("includes the expiry day in UTC and preserves the allow alias", () => {
    expect(
      scan([
        {
          ...valid,
          rules: undefined,
          allow: valid.rules,
          expires: new Date().toISOString().slice(0, 10),
        },
      ]).status,
    ).toBe("pass");
  });

  it("validates waivers even when the document is clean", () => {
    const waiverFile = join(directory, "invalid.json");
    writeFileSync(waiverFile, JSON.stringify({ waivers: [{ ...valid, expires: "bad" }] }));
    expect(() => checkText("docs/api/example.md", "# API", { waiverFile })).toThrow(
      "real YYYY-MM-DD",
    );
  });
});
