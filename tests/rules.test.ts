import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  builtinRulePackPath,
  compileRulePack,
  loadBuiltinRules,
  loadRulePack,
  severityDefaultsFromRules,
  validateRulePack,
} from "../src/rules.js";

describe("rule packs", () => {
  it("loads and validates the built-in final-state residue rule pack", () => {
    const rulePack = loadRulePack(builtinRulePackPath());

    validateRulePack(rulePack);

    expect(rulePack.rulePack.id).toBe("final-state-residue");
    expect(rulePack.rules.map((rule) => rule.id)).toEqual([
      "revision_trace",
      "rejected_prior_solution",
      "self_correction",
      "internal_authoring_process",
      "negative_constraint",
    ]);
  });

  it("compiles built-in rules into regex and doc-type severity maps", () => {
    const rules = loadBuiltinRules();
    const severities = severityDefaultsFromRules(rules);

    expect(rules).toHaveLength(5);
    expect(rules[0].regex.test("The field has been removed.")).toBe(true);
    expect(severities["public-api-doc"].revision_trace).toBe("error");
    expect(severities.adr.negative_constraint).toBe("off");
  });

  it("rejects duplicate rule ids", () => {
    const rulePack = loadRulePack(builtinRulePackPath());
    rulePack.rules[1] = { ...rulePack.rules[1], id: rulePack.rules[0].id };

    expect(() => compileRulePack(rulePack)).toThrow(/duplicate rule id/);
  });

  it("ships a JSON schema for external rule pack authors", () => {
    const schema = JSON.parse(readFileSync("rules/schema.json", "utf8"));

    expect(schema.title).toBe("markdown-gate rule pack");
    expect(schema.required).toContain("rule_pack");
    expect(schema.required).toContain("rules");
  });
});
