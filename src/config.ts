import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { globMatches, normalizePathForMatch } from "./glob.js";
import type { DocumentType, Severity } from "./model.js";
import { parseSeverity, validateDocType } from "./model.js";

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

export const DEFAULT_SEVERITIES: Record<DocumentType, Record<string, Severity>> = {
  "public-api-doc": {
    revision_trace: "error",
    rejected_prior_solution: "error",
    self_correction: "error",
    internal_authoring_process: "error",
    negative_constraint: "suggestion",
  },
  "access-guide": {
    revision_trace: "error",
    rejected_prior_solution: "error",
    self_correction: "error",
    internal_authoring_process: "error",
    negative_constraint: "suggestion",
  },
  "implementation-plan": {
    revision_trace: "error",
    rejected_prior_solution: "error",
    self_correction: "error",
    internal_authoring_process: "error",
    negative_constraint: "suggestion",
  },
  "issue-description": {
    revision_trace: "error",
    rejected_prior_solution: "error",
    self_correction: "error",
    internal_authoring_process: "error",
    negative_constraint: "suggestion",
  },
  adr: {
    revision_trace: "suggestion",
    rejected_prior_solution: "suggestion",
    self_correction: "warning",
    internal_authoring_process: "warning",
    negative_constraint: "off",
  },
  runbook: {
    revision_trace: "warning",
    rejected_prior_solution: "suggestion",
    self_correction: "warning",
    internal_authoring_process: "warning",
    negative_constraint: "off",
  },
  unknown: {
    revision_trace: "warning",
    rejected_prior_solution: "warning",
    self_correction: "warning",
    internal_authoring_process: "warning",
    negative_constraint: "suggestion",
  },
};

export interface GateConfig {
  failOn: Severity;
  pathTypes: Record<string, DocumentType>;
  allowedSections: Partial<Record<DocumentType, Set<string>>>;
  severities: Record<DocumentType, Record<string, Severity>>;
}

export function createDefaultConfig(): GateConfig {
  const allowedSections: Partial<Record<DocumentType, Set<string>>> = {};
  for (const [docType, sections] of Object.entries(DEFAULT_ALLOWED_SECTIONS)) {
    allowedSections[docType as DocumentType] = new Set(sections.map(normalizeSection));
  }

  return {
    failOn: "error",
    pathTypes: { ...DEFAULT_PATH_TYPES },
    allowedSections,
    severities: structuredClone(DEFAULT_SEVERITIES),
  };
}

export function loadConfig(path?: string): GateConfig {
  const config = createDefaultConfig();
  if (!path) {
    return config;
  }

  const data = parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
  const defaults = asRecord(data.defaults);
  if (typeof defaults?.fail_on === "string") {
    config.failOn = parseSeverity(defaults.fail_on);
  }

  const pathTypes = asRecord(data.path_types);
  if (pathTypes) {
    for (const [pattern, docType] of Object.entries(pathTypes)) {
      if (typeof docType !== "string") {
        throw new Error(`doc_type for pattern ${JSON.stringify(pattern)} must be a string`);
      }
      config.pathTypes[pattern] = validateDocType(docType);
    }
  }

  const allowedSections = asRecord(data.allowed_sections);
  if (allowedSections) {
    for (const [docType, sections] of Object.entries(allowedSections)) {
      const validatedDocType = validateDocType(docType);
      if (!Array.isArray(sections)) {
        throw new Error(`allowed_sections.${docType} must be an array`);
      }
      config.allowedSections[validatedDocType] = new Set(
        sections.map((section) => normalizeSection(String(section))),
      );
    }
  }

  const severity = asRecord(data.severity);
  if (severity) {
    for (const [docType, rules] of Object.entries(severity)) {
      const validatedDocType = validateDocType(docType);
      const ruleMap = asRecord(rules);
      if (!ruleMap) {
        throw new Error(`severity.${docType} must be a table`);
      }
      config.severities[validatedDocType] ??= {};
      for (const [rule, value] of Object.entries(ruleMap)) {
        config.severities[validatedDocType][rule] = parseSeverity(String(value));
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function assertKnownDocTypes(): void {
  for (const docType of Object.keys(DEFAULT_SEVERITIES)) {
    validateDocType(docType);
  }
  for (const docType of Object.values(DEFAULT_PATH_TYPES)) {
    validateDocType(docType);
  }
  for (const docType of Object.keys(DEFAULT_ALLOWED_SECTIONS)) {
    validateDocType(docType);
  }
}
