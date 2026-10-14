import { describe, expect, it } from "vitest";
import { checkText } from "../src/gate.js";

const scan = (text: string) => checkText("docs/api/example.md", text);

describe("Markdown prose boundaries", () => {
  it.each([
    ["inline code", "Use `previous design` as the literal search string."],
    ["indented code", "    The previous design used a field.\n"],
    ["long fences", "````md\n```\nThe previous design used a field.\n```\n````"],
    ["different fence markers", "```md\n~~~\nThe previous design used a field.\n```"],
    ["quoted code", "> ```text\n> The previous design used a field.\n> ```"],
    ["raw HTML", "<!-- The previous design used a field. -->"],
    ["URL destinations", "[Reference](https://example.com/correction)"],
    ["automatic URLs", "<https://example.com/correction> and https://example.com/corrected"],
    ["escaped email literals", "<foo\\+@bar.example.com>"],
    ["reference definitions", '[reference]: https://example.com/correction "previous design"'],
    ["separate list items", "- previous\n- design"],
    ["separate table cells", "| previous | design |\n| --- | --- |"],
    ["omitted inline code", "previous `literal` design"],
  ])("excludes %s", (_name, text) => {
    expect(scan(text).findings).toEqual([]);
  });

  it.each([
    ["ATX heading", "## Previous design", 1, 4],
    ["setext heading", "Previous design\n---", 1, 1],
    ["table header", "| Previous design |\n| --- |", 1, 3],
    ["table body", "Name | Details\n--- | ---\nx | The previous design", 3, 9],
    ["emphasis", "The **previous** *design* used a field.", 1, 7],
    ["link label", "The [previous design](https://example.com) used a field.", 1, 6],
    ["soft wrap", "The previous\n   design used a field.", 1, 5],
    ["soft wrap with trailing whitespace", "The previous \n   design used a field.", 1, 5],
    ["quoted soft wrap", "> The previous\n>   design used a field.", 1, 7],
    ["entity in phrase", "The prev&#105;ous design used a field.", 1, 5],
    ["entity before phrase", "&amp; The previous design used a field.", 1, 11],
    ["entity newline", "&#10;The previous design used a field.", 1, 10],
    ["escape before phrase", "\\* The previous design used a field.", 1, 8],
    ["task list", "- [x] The previous design used a field.", 1, 11],
    ["escaped table pipe", "| Note |\n| --- |\n| x\\| The previous design |", 3, 11],
    ["Chinese text", "按你的反馈，接口返回 request_id。", 1, 1],
  ])("scans %s at its original source position", (_name, text, line, column) => {
    const result = scan(text);
    expect(result.status).toBe("fail");
    expect(result.findings[0]).toMatchObject({ line, column });
  });

  it("finds every occurrence and does not retain regex state between scans", () => {
    const text = "The previous design follows the previous approach.";
    for (let pass = 0; pass < 2; pass += 1) {
      expect(scan(text).findings.map(({ line, column }) => [line, column])).toEqual([
        [1, 5],
        [1, 33],
      ]);
    }
  });

  it.each(["\n", "\r\n", "\r"])("preserves frontmatter line numbers with %j", (eol) => {
    const text = [
      "---",
      "doc_type: public-api-doc",
      "---",
      "",
      "# API",
      "",
      "The previous design.",
    ].join(eol);
    expect(checkText("example.md", text).findings[0]).toMatchObject({ line: 7, column: 5 });
  });

  it("ends inherited allowances at a sibling heading", () => {
    const result = checkText(
      "plan.md",
      "# Plan\n\n## **Alternatives Considered**\n\n### Detail\n\nThe previous design.\n\n## Contract\n\nThe previous design.",
      { explicitType: "implementation-plan" },
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ section: "Contract", line: 11 });
  });

  it("keeps allowances inside quoted headings", () => {
    const result = checkText(
      "plan.md",
      "# Plan\n\n> ## Alternatives Considered\n>\n> The previous design.\n\nThe previous design.",
      { explicitType: "implementation-plan" },
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ section: "Plan", line: 7 });
  });
});
