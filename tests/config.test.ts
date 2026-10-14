import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyDocument } from "../src/classifier.js";
import { loadConfig } from "../src/config.js";
import { checkText } from "../src/gate.js";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "markdown-gate-config-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function policy(text: string): string {
  const file = join(directory, "policy.toml");
  writeFileSync(file, text);
  return file;
}

describe("explicit policy validation", () => {
  it.each([
    ['fail_on = "off"', "unknown key"],
    ['[defaults]\nfail_onn = "off"', "unknown key"],
    ["defaults = []", "object/table"],
    ["[defaults]\nfail_on = false", "non-empty string"],
    ['[defaults]\nfail_on = ""', "non-empty string"],
    ['path_types = "adr"', "object/table"],
    ['[path_types]\n"docs/**" = "typo"', "unknown doc_type"],
    ["allowed_sections = []", "object/table"],
    ["[allowed_sections]\nadr = [false]", "non-empty string"],
    ['[allowed_sections]\nadr = "Alternatives"', "must be an array"],
    ["severity = []", "object/table"],
    ['[severity.public-api-doc]\nrevision_tracce = "off"', "unknown key"],
    ["[severity.public-api-doc]\nrevision_trace = false", "non-empty string"],
    ['[severity.public-api-doc]\nrevision_trace = "typo"', "unknown severity"],
  ])("rejects malformed policy %s", (text, error) => {
    expect(() => loadConfig(policy(text))).toThrow(error);
  });

  it("applies user path rules before defaults, preserving first-match order", () => {
    const config = loadConfig(
      policy('[path_types]\n"docs/api/decisions/**" = "adr"\n"docs/api/**" = "access-guide"'),
    );
    expect(classifyDocument("docs/api/decisions/request.md", "# API", config).docType).toBe("adr");
    expect(classifyDocument("docs/api/request.md", "# API", config).docType).toBe("access-guide");
  });

  it("matches globstar paths with zero or multiple subdirectories", () => {
    for (const path of ["api/request.md", "api/v1/request.md", "/workspace/api/request.md"]) {
      expect(classifyDocument(path, "# Contract", loadConfig()).docType).toBe("public-api-doc");
    }
  });

  it("supports explicit severity changes and clearing allowed sections", () => {
    const configPath = policy(
      '[allowed_sections]\nadr = []\n[severity.adr]\nrejected_prior_solution = "error"',
    );
    const result = checkText(
      "docs/adr/example.md",
      "# ADR\n\n## Alternatives\n\nThe previous design.",
      { configPath },
    );
    expect(result.status).toBe("fail");
  });
});
