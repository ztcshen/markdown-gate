import { describe, expect, it } from "vitest";
import { classifyDocument } from "../src/classifier.js";
import { createDefaultConfig } from "../src/config.js";
import type { Document } from "../src/model.js";
import { scanDocument } from "../src/scanner.js";

function makeDocument(path: string, text: string, explicitType?: string): Document {
  const config = createDefaultConfig();
  const classified = classifyDocument(path, text, config, explicitType);
  return {
    path,
    text: classified.body,
    docType: classified.docType,
    metadata: classified.metadata,
  };
}

describe("scanner", () => {
  it("fails public API docs with revision history", () => {
    const doc = makeDocument(
      "docs/api/withdraw.md",
      "# Withdraw API\n\nThe previous design used old_field, but it has been removed.\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(new Set(findings.map((finding) => finding.rule))).toEqual(
      new Set(["revision_trace", "rejected_prior_solution"]),
    );
    expect(findings.every((finding) => finding.severity === "error")).toBe(true);
  });

  it("catches soft-wrapped prior version wording", () => {
    const doc = makeDocument(
      "docs/api/withdraw.md",
      "# Withdraw API\n\nThe previous\nversion used old_field.\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings.map((finding) => finding.rule)).toContain("rejected_prior_solution");
  });

  it("allows domain state language that is not drafting residue", () => {
    const doc = makeDocument(
      "docs/api/callback.md",
      "# Callback API\n\n" +
        "The description value must be no longer than 32 characters.\n\n" +
        "When settlement finishes, the order status is changed to SUCCESS.\n\n" +
        "After logout, the access token is no longer valid.\n\n" +
        "Use amount instead of total_amount for the request amount.\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings.some((finding) => finding.severity === "error")).toBe(false);
  });

  it("skips fenced code and table rows", () => {
    const doc = makeDocument(
      "docs/api/withdraw.md",
      "# Withdraw API\n\n" +
        "```json\n" +
        '{"note": "The previous design used old_field"}\n' +
        "```\n\n" +
        "| field | note |\n" +
        "| --- | --- |\n" +
        "| old | The previous design used old_field |\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings).toEqual([]);
  });

  it("allows ADR alternatives to mention prior solutions", () => {
    const doc = makeDocument(
      "docs/adr/withdraw.md",
      "# ADR\n\n## Alternatives\n\nThe previous approach used old_field.\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings).toEqual([]);
  });

  it("inherits allowed section scope through nested headings", () => {
    const doc = makeDocument(
      "docs/adr/withdraw.md",
      "# ADR\n\n## Alternatives\n\n### Legacy field\n\nThe previous approach used old_field.\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings).toEqual([]);
  });

  it("flags self-correction in issue descriptions", () => {
    const doc = makeDocument(
      "issues/withdraw.md",
      "# Issue\n\n不是使用旧字段，而是使用 apply_no。\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings[0]?.severity).toBe("error");
  });

  it("keeps negative constraints in public API docs as suggestions", () => {
    const doc = makeDocument(
      "docs/api/key.md",
      "# API Key\n\nDo not share your API key with client-side code.\n",
    );

    const findings = scanDocument(doc, createDefaultConfig());

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.severity === "suggestion")).toBe(true);
  });
});
