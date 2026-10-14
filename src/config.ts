import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { globMatches, normalizePathForMatch } from "./glob.js";
import type { DocumentType, Severity } from "./model.js";
import { parseSeverity, validateDocType } from "./model.js";
import { assertKnownKeys, requireRecord, requireString } from "./policy-validation.js";
import { type CompiledRule, loadBuiltinRules, severityDefaultsFromRules } from "./rules.js";

export const DEFAULT_PATH_TYPES: Record<string, DocumentType> = {
  "docs/api/**": "public-api-doc",
  "docs/public/**": "public-api-doc",
  "docs/reference/**": "public-api-doc",
  "docs/interfaces/**": "public-api-doc",
  "api/**/*.md": "public-api-doc",
  "docs/access/**": "access-guide",
  "docs/guides/access/**": "access-guide",
  "plans/**": "implementation-plan",
  "docs/plans/**": "implementation-plan",
  "issues/**": "issue-description",
  "docs/issues/**": "issue-description",
  "adr/**": "adr",
  "docs/adr/**": "adr",
  "runbooks/**": "runbook",
  "docs/runbooks/**": "runbook",
};

export const DEFAULT_ALLOWED_SECTIONS: Partial<Record<DocumentType, string[]>> = {
  "implementation-plan": ["alternatives considered", "decision record", "rejected alternatives"],
  adr: [
    "context",
    "decision",
    "alternatives",
    "alternatives considered",
    "consequences",
    "rejected alternatives",
  ],
  runbook: ["warnings", "safety", "rollback", "risks", "constraints", "do not"],
};

export interface GateConfig {
  failOn: Severity;
  pathTypes: Record<string, DocumentType>;
  allowedSections: Partial<Record<DocumentType, Set<string>>>;
  severities: Record<DocumentType, Record<string, Severity>>;
  rules: CompiledRule[];
}

export function createDefaultConfig(): GateConfig {
  const rules = loadBuiltinRules();
  const allowedSections: Partial<Record<DocumentType, Set<string>>> = {};
  for (const [docType, sections] of Object.entries(DEFAULT_ALLOWED_SECTIONS)) {
    allowedSections[docType as DocumentType] = new Set(sections.map(normalizeSection));
  }

  return {
    failOn: "error",
    pathTypes: { ...DEFAULT_PATH_TYPES },
    allowedSections,
    severities: severityDefaultsFromRules(rules),
    rules,
  };
}

export function loadConfig(path?: string): GateConfig {
  const config = createDefaultConfig();
  if (!path) {
    return config;
  }

  const data = parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
  assertKnownKeys(data, ["defaults", "path_types", "allowed_sections", "severity"], "config");
  if (data.defaults !== undefined) {
    const defaults = requireRecord(data.defaults, "defaults");
    assertKnownKeys(defaults, ["fail_on"], "defaults");
    if (defaults.fail_on !== undefined) {
      config.failOn = parseSeverity(requireString(defaults.fail_on, "defaults.fail_on"));
    }
  }

  if (data.path_types !== undefined) {
    const pathTypes = requireRecord(data.path_types, "path_types");
    const overrides: Record<string, DocumentType> = {};
    for (const [pattern, docType] of Object.entries(pathTypes)) {
      requireString(pattern, "path_types pattern");
      overrides[pattern] = validateDocType(requireString(docType, `path_types.${pattern}`));
    }
    // User patterns take precedence, in declaration order, then built-ins.
    config.pathTypes = {
      ...overrides,
      ...Object.fromEntries(
        Object.entries(config.pathTypes).filter(([pattern]) => !Object.hasOwn(overrides, pattern)),
      ),
    };
  }

  if (data.allowed_sections !== undefined) {
    const allowedSections = requireRecord(data.allowed_sections, "allowed_sections");
    for (const [docType, sections] of Object.entries(allowedSections)) {
      const validatedDocType = validateDocType(docType);
      if (!Array.isArray(sections)) {
        throw new Error(`allowed_sections.${docType} must be an array`);
      }
      config.allowedSections[validatedDocType] = new Set(
        sections.map((section) =>
          normalizeSection(requireString(section, `allowed_sections.${docType}`)),
        ),
      );
    }
  }

  if (data.severity !== undefined) {
    const severity = requireRecord(data.severity, "severity");
    const ruleIds = config.rules.map((rule) => rule.id);
    for (const [docType, rules] of Object.entries(severity)) {
      const validatedDocType = validateDocType(docType);
      const ruleMap = requireRecord(rules, `severity.${docType}`);
      assertKnownKeys(ruleMap, ruleIds, `severity.${docType}`);
      config.severities[validatedDocType] ??= {};
      for (const [rule, value] of Object.entries(ruleMap)) {
        config.severities[validatedDocType][rule] = parseSeverity(
          requireString(value, `severity.${docType}.${rule}`),
        );
      }
    }
  }

  return config;
}

export function severityFor(config: GateConfig, docType: DocumentType, rule: string): Severity {
  const rules = config.severities[docType] ?? config.severities.unknown;
  return rules[rule] ?? config.severities.unknown[rule] ?? "warning";
}

export function isAllowedSectionPath(
  config: GateConfig,
  docType: DocumentType,
  sections: string[],
): boolean {
  const allowed = config.allowedSections[docType];
  if (!allowed) {
    return false;
  }
  return sections.some((section) => allowed.has(normalizeSection(section)));
}

export function classifyPath(config: GateConfig, path: string): DocumentType | undefined {
  const normalized = normalizePathForMatch(path);
  for (const [pattern, docType] of Object.entries(config.pathTypes)) {
    const normalizedPattern = normalizePathForMatch(pattern);
    if (
      globMatches(normalized, normalizedPattern) ||
      globMatches(normalized, `**/${normalizedPattern}`)
    ) {
      return docType;
    }
  }
  return undefined;
}

export function normalizeSection(section: string): string {
  return section.trim().toLowerCase().split(/\s+/).join(" ");
}

export function assertKnownDocTypes(): void {
  for (const docType of Object.values(DEFAULT_PATH_TYPES)) {
    validateDocType(docType);
  }
  for (const docType of Object.keys(DEFAULT_ALLOWED_SECTIONS)) {
    validateDocType(docType);
  }
}
