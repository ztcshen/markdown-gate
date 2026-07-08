export const DOC_TYPES = [
  "public-api-doc",
  "access-guide",
  "implementation-plan",
  "issue-description",
  "adr",
  "runbook",
  "unknown",
] as const;

export type DocumentType = (typeof DOC_TYPES)[number];

export const SEVERITY_VALUE = {
  off: 0,
  suggestion: 1,
  warning: 2,
  error: 3,
} as const;

export type Severity = keyof typeof SEVERITY_VALUE;

export type Metadata = Record<string, unknown>;

export interface Document {
  path: string;
  text: string;
  docType: DocumentType;
  metadata: Metadata;
}

export interface Finding {
  path: string;
  docType: DocumentType;
  line: number;
  column: number;
  rule: string;
  severity: Severity;
  message: string;
  excerpt: string;
  section?: string;
  sections: string[];
  waivedBy?: string;
}

export interface ScanResult {
  status: "pass" | "fail";
  failOn: Severity;
  documents: Array<{
    path: string;
    docType: DocumentType;
    metadata: Metadata;
  }>;
  findings: Finding[];
}

export function parseSeverity(value: string | undefined, fallback: Severity = "error"): Severity {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  const aliases: Record<string, Severity> = {
    off: "off",
    none: "off",
    suggestion: "suggestion",
    suggest: "suggestion",
    warning: "warning",
    warn: "warning",
    error: "error",
    fail: "error",
    never: "off",
  };
  const severity = aliases[normalized];
  if (!severity) {
    throw new Error(`unknown severity: ${value}`);
  }
  return severity;
}

export function isDocType(value: string): value is DocumentType {
  return (DOC_TYPES as readonly string[]).includes(value);
}

export function validateDocType(value: string): DocumentType {
  if (!isDocType(value)) {
    throw new Error(
      `unknown doc_type ${JSON.stringify(value)}; expected one of: ${DOC_TYPES.join(", ")}`,
    );
  }
  return value;
}

export function severityAtLeast(value: Severity, threshold: Severity): boolean {
  if (threshold === "off") {
    return false;
  }
  return SEVERITY_VALUE[value] >= SEVERITY_VALUE[threshold];
}

export function resultFailed(findings: Finding[], failOn: Severity): boolean {
  if (failOn === "off") {
    return false;
  }
  return findings.some((finding) => !finding.waivedBy && severityAtLeast(finding.severity, failOn));
}
