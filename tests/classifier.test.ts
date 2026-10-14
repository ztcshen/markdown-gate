import { describe, expect, it } from "vitest";
import { classifyDocument } from "../src/classifier.js";
import { createDefaultConfig } from "../src/config.js";

describe("classifier", () => {
  it("uses rendered setext headings for classification", () => {
    expect(
      classifyDocument("example.md", "Example API\n===========", createDefaultConfig()).docType,
    ).toBe("public-api-doc");
  });

  it("ignores headings inside code examples and quoted documents", () => {
    expect(
      classifyDocument("example.md", "```md\n# API\n```\n\n> # API", createDefaultConfig()).docType,
    ).toBe("unknown");
  });
  it("uses explicit type first", () => {
    const result = classifyDocument("docs/api/test.md", "# ADR\n", createDefaultConfig(), "adr");
    expect(result.docType).toBe("adr");
  });

  it("keeps public path policy ahead of stale frontmatter", () => {
    const result = classifyDocument(
      "docs/api/test.md",
      "---\ndoc_type: adr\n---\n\n# API\n",
      createDefaultConfig(),
    );
    expect(result.docType).toBe("public-api-doc");
  });

  it("classifies absolute public docs paths", () => {
    const result = classifyDocument(
      "/tmp/workspace/docs/api/withdraw.md",
      "# Withdraw\n",
      createDefaultConfig(),
    );
    expect(result.docType).toBe("public-api-doc");
  });

  it("classifies Chinese no-space guide headings", () => {
    const result = classifyDocument("guide.md", "# 支付接入指南\n", createDefaultConfig());
    expect(result.docType).toBe("access-guide");
  });
});
