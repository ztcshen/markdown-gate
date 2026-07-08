import type { Finding, ScanResult } from "./model.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(serializeResult(result), null, 2);
}

export function renderText(result: ScanResult): string {
  const lines: string[] = [];
  const status = result.status === "fail" ? "FAIL" : "PASS";
  lines.push(`markdown-gate: ${status} (fail_on=${result.failOn})`);

  if (result.documents.length > 0) {
    lines.push(
      `documents: ${result.documents
        .map((document) => `${document.path} [${document.docType}]`)
        .join(", ")}`,
    );
  }

  if (result.findings.length === 0) {
    lines.push("findings: none");
    return lines.join("\n");
  }

  for (const finding of [...result.findings].sort(compareFinding)) {
    const waived = finding.waivedBy ? ` waived_by=${finding.waivedBy}` : "";
    const section = finding.section ? ` section=${JSON.stringify(finding.section)}` : "";
    lines.push(
      `${finding.severity.toUpperCase()} ${finding.path}:${finding.line}:${finding.column} ${finding.rule}${section}${waived}`,
    );
    lines.push(`  ${finding.message}`);
    lines.push(`  > ${trim(finding.excerpt)}`);
  }

  if (result.status === "fail") {
    lines.push(`gate failed: unwaived ${thresholdLabel(result.failOn)} findings are present`);
  }

  return lines.join("\n");
}

export function serializeResult(result: ScanResult): Record<string, unknown> {
  return {
    status: result.status,
    fail_on: result.failOn,
    documents: result.documents.map((document) => ({
      path: document.path,
      doc_type: document.docType,
      metadata: document.metadata,
    })),
    findings: result.findings.map((finding) => ({
      path: finding.path,
      doc_type: finding.docType,
      line: finding.line,
      column: finding.column,
      rule: finding.rule,
      severity: finding.severity,
      message: finding.message,
      excerpt: finding.excerpt,
      section: finding.section,
      sections: finding.sections,
      waived_by: finding.waivedBy,
    })),
  };
}

function compareFinding(left: Finding, right: Finding): number {
  const severityRank = { error: 3, warning: 2, suggestion: 1, off: 0 };
  return (
    severityRank[right.severity] - severityRank[left.severity] ||
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.column - right.column
  );
}

function thresholdLabel(severity: string): string {
  if (severity === "error") {
    return "error";
  }
  if (severity === "warning") {
    return "warning/error";
  }
  if (severity === "suggestion") {
    return "suggestion/warning/error";
  }
  return "enabled";
}

function trim(value: string, limit = 140): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}
