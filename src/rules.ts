import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import type { DocumentType, Severity } from "./model.js";
import { DOC_TYPES, parseSeverity } from "./model.js";

export interface RulePack {
  rulePack: {
    id: string;
    version: string;
    description?: string;
  };
  rules: RuleDefinition[];
}

export interface RuleDefinition {
  id: string;
  message: string;
  patterns: string[];
  severity: Partial<Record<DocumentType | "default", Severity>>;
  allowInAllowedSections: boolean;
}

export interface CompiledRule {
  id: string;
  message: string;
  regex: RegExp;
  severity: Record<DocumentType, Severity>;
  allowInAllowedSections: boolean;
}

const RULE_ID_RE = /^[a-z][a-z0-9_]*$/;
const RULE_PACK_ID_RE = /^[a-z][a-z0-9_-]*$/;
let cachedBuiltinRules: CompiledRule[] | undefined;

export function builtinRulePackPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "rules", "builtin", "final-state-residue.toml");
}

export function loadBuiltinRules(): CompiledRule[] {
  cachedBuiltinRules ??= compileRulePack(loadRulePack(builtinRulePackPath()));
  return cachedBuiltinRules;
}

export function loadRulePack(path: string): RulePack {
  return normalizeRulePack(parseToml(readFileSync(path, "utf8")) as Record<string, unknown>, path);
}

export function compileRulePack(rulePack: RulePack): CompiledRule[] {
  validateRulePack(rulePack);
  return rulePack.rules.map((rule) => ({
    id: rule.id,
    message: rule.message,
    regex: new RegExp(`(${rule.patterns.join("|")})`, "i"),
    severity: severityByDocType(rule),
    allowInAllowedSections: rule.allowInAllowedSections,
  }));
}

export function validateRulePack(rulePack: RulePack): void {
  if (!RULE_PACK_ID_RE.test(rulePack.rulePack.id)) {
    throw new Error(`invalid rule_pack.id: ${rulePack.rulePack.id}`);
  }
  if (!rulePack.rulePack.version) {
    throw new Error(`rule_pack.version is required for ${rulePack.rulePack.id}`);
  }
  if (rulePack.rules.length === 0) {
    throw new Error(`rule pack ${rulePack.rulePack.id} must contain at least one rule`);
  }

  const ids = new Set<string>();
  for (const rule of rulePack.rules) {
    if (!RULE_ID_RE.test(rule.id)) {
      throw new Error(`invalid rule id: ${rule.id}`);
    }
    if (ids.has(rule.id)) {
      throw new Error(`duplicate rule id: ${rule.id}`);
    }
    ids.add(rule.id);
    if (!rule.message.trim()) {
      throw new Error(`rule ${rule.id} must define a message`);
    }
    if (rule.patterns.length === 0) {
      throw new Error(`rule ${rule.id} must define at least one pattern`);
    }
    for (const pattern of rule.patterns) {
      assertCompiles(pattern, rule.id);
    }
    if (!rule.severity.default) {
      throw new Error(`rule ${rule.id} must define severity.default`);
    }
    for (const docType of Object.keys(rule.severity)) {
      if (docType !== "default" && !(DOC_TYPES as readonly string[]).includes(docType)) {
        throw new Error(`rule ${rule.id} has severity for unknown doc_type: ${docType}`);
      }
    }
  }
}

export function severityDefaultsFromRules(
  rules: CompiledRule[],
): Record<DocumentType, Record<string, Severity>> {
  const severities = Object.fromEntries(DOC_TYPES.map((docType) => [docType, {}])) as Record<
    DocumentType,
    Record<string, Severity>
  >;
  for (const rule of rules) {
    for (const docType of DOC_TYPES) {
      severities[docType][rule.id] = rule.severity[docType];
    }
  }
  return severities;
}

function normalizeRulePack(data: Record<string, unknown>, path: string): RulePack {
  const rulePack = asRecord(data.rule_pack);
  const rules = data.rules;
  if (!rulePack) {
    throw new Error(`${path}: rule_pack table is required`);
  }
  if (!Array.isArray(rules)) {
    throw new Error(`${path}: rules must be an array`);
  }
  return {
    rulePack: {
      id: requireString(rulePack.id, `${path}: rule_pack.id`),
      version: requireString(rulePack.version, `${path}: rule_pack.version`),
      description: optionalString(rulePack.description, `${path}: rule_pack.description`),
    },
    rules: rules.map((item, index) => normalizeRule(item, `${path}: rules[${index}]`)),
  };
}

function normalizeRule(value: unknown, location: string): RuleDefinition {
  const rule = asRecord(value);
  if (!rule) {
    throw new Error(`${location} must be a table`);
  }
  const severity = asRecord(rule.severity);
  if (!severity) {
    throw new Error(`${location}.severity table is required`);
  }
  return {
    id: requireString(rule.id, `${location}.id`),
    message: requireString(rule.message, `${location}.message`),
    patterns: requireStringArray(rule.patterns, `${location}.patterns`),
    severity: normalizeSeverity(severity, `${location}.severity`),
    allowInAllowedSections: Boolean(rule.allow_in_allowed_sections),
  };
}

function normalizeSeverity(
  value: Record<string, unknown>,
  location: string,
): Partial<Record<DocumentType | "default", Severity>> {
  const severity: Partial<Record<DocumentType | "default", Severity>> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (key !== "default" && !(DOC_TYPES as readonly string[]).includes(key)) {
      throw new Error(`${location}.${key} is not a known doc_type`);
    }
    severity[key as DocumentType | "default"] = parseSeverity(String(rawValue));
  }
  return severity;
}

function severityByDocType(rule: RuleDefinition): Record<DocumentType, Severity> {
  const fallback = rule.severity.default ?? "warning";
  return Object.fromEntries(
    DOC_TYPES.map((docType) => [docType, rule.severity[docType] ?? fallback]),
  ) as Record<DocumentType, Severity>;
}

function requireString(value: unknown, location: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${location} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, location: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${location} must be a string`);
  }
  return value;
}

function requireStringArray(value: unknown, location: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${location} must be a non-empty string array`);
  }
  return value.map((item, index) => requireString(item, `${location}[${index}]`));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function assertCompiles(pattern: string, ruleId: string): void {
  try {
    new RegExp(pattern, "i");
  } catch (error) {
    throw new Error(
      `rule ${ruleId} has invalid regex pattern ${JSON.stringify(pattern)}: ${(error as Error).message}`,
    );
  }
}
