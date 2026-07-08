import { readFileSync } from "node:fs";
import { normalizeSection } from "./config.js";
import { globMatches, normalizePathForMatch } from "./glob.js";
import type { Finding } from "./model.js";

interface Waiver {
  id?: string;
  rules?: string[];
  allow?: string[];
  scope?: {
    path?: string;
    doc_type?: string;
    section?: string;
  };
  expires?: string;
}

export function applyWaivers(findings: Finding[], waiverFile?: string): Finding[] {
  if (!waiverFile) {
    return findings;
  }
  const waivers = loadWaivers(waiverFile);
  const today = new Date().toISOString().slice(0, 10);
  return findings.map((finding) => {
    const waiverId = matchingWaiver(finding, waivers, today);
    return waiverId ? { ...finding, waivedBy: waiverId } : finding;
  });
}

function loadWaivers(path: string): Waiver[] {
  const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (Array.isArray(data)) {
    return data as Waiver[];
  }
  if (data && typeof data === "object" && Array.isArray((data as { waivers?: unknown }).waivers)) {
    return (data as { waivers: Waiver[] }).waivers;
  }
  throw new Error("waiver file must contain a list or a top-level 'waivers' list");
}

function matchingWaiver(finding: Finding, waivers: Waiver[], today: string): string | undefined {
  for (const waiver of waivers) {
    const waiverId = waiver.id ?? "";
    if (!waiverId) {
      continue;
    }
    if (waiver.expires && waiver.expires < today) {
      continue;
    }
    const rules = waiver.rules ?? waiver.allow ?? [];
    if (!rules.includes(finding.rule) && !rules.includes("*")) {
      continue;
    }
    if (!scopeMatches(finding, waiver.scope ?? {})) {
      continue;
    }
    return waiverId;
  }
  return undefined;
}

function scopeMatches(finding: Finding, scope: NonNullable<Waiver["scope"]>): boolean {
  if (scope.path) {
    const path = normalizePathForMatch(finding.path);
    const pattern = normalizePathForMatch(scope.path);
    if (!globMatches(path, pattern)) {
      return false;
    }
  }

  if (scope.doc_type && scope.doc_type !== finding.docType) {
    return false;
  }

  if (scope.section) {
    const expected = normalizeSection(scope.section);
    if (!finding.sections.some((section) => normalizeSection(section) === expected)) {
      return false;
    }
  }

  return true;
}
