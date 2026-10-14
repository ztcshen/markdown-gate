import { readFileSync } from "node:fs";
import { normalizeSection } from "./config.js";
import { globMatches, normalizePathForMatch } from "./glob.js";
import { type DocumentType, type Finding, validateDocType } from "./model.js";
import {
  assertKnownKeys,
  requireRecord,
  requireString,
  requireStringArray,
} from "./policy-validation.js";
import { loadBuiltinRules } from "./rules.js";

interface Waiver {
  id: string;
  rules: string[];
  reason: string;
  scope: { path?: string; doc_type?: DocumentType; section?: string };
  expires?: string;
}

export function applyWaivers(findings: Finding[], waiverFile?: string): Finding[] {
  if (!waiverFile) return findings;
  const waivers = loadWaivers(waiverFile);
  const today = new Date().toISOString().slice(0, 10);
  return findings.map((finding) => {
    const waiver = waivers.find(
      (candidate) =>
        (!candidate.expires || candidate.expires >= today) &&
        (candidate.rules.includes(finding.rule) || candidate.rules.includes("*")) &&
        scopeMatches(finding, candidate.scope),
    );
    return waiver ? { ...finding, waivedBy: waiver.id } : finding;
  });
}

function loadWaivers(path: string): Waiver[] {
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  let list: unknown = data;
  if (!Array.isArray(data)) {
    const record = requireRecord(data, "waiver file");
    assertKnownKeys(record, ["waivers"], "waiver file");
    list = record.waivers;
  }
  if (!Array.isArray(list))
    throw new Error("waiver file must contain a list or a top-level 'waivers' list");
  const ids = new Set<string>();
  const knownRules = new Set(loadBuiltinRules().map((rule) => rule.id));
  return list.map((value, index) => {
    const location = `waivers[${index}]`;
    const raw = requireRecord(value, location);
    assertKnownKeys(raw, ["id", "rules", "allow", "scope", "reason", "expires"], location);
    const id = requireString(raw.id, `${location}.id`);
    if (ids.has(id)) throw new Error(`duplicate waiver id: ${id}`);
    ids.add(id);
    const reason = requireString(raw.reason, `${location}.reason`);
    if (raw.rules !== undefined && raw.allow !== undefined)
      throw new Error(`${location}: use either rules or allow, not both`);
    const rules = requireStringArray(raw.rules ?? raw.allow, `${location}.rules`);
    for (const rule of rules) {
      if (rule !== "*" && !knownRules.has(rule))
        throw new Error(`${location}: unknown rule ${rule}`);
    }
    const rawScope = requireRecord(raw.scope, `${location}.scope`);
    assertKnownKeys(rawScope, ["path", "doc_type", "section"], `${location}.scope`);
    if (Object.keys(rawScope).length === 0)
      throw new Error(`${location}.scope must restrict path, doc_type, or section`);
    const scope: Waiver["scope"] = {};
    for (const key of ["path", "section"] as const) {
      if (rawScope[key] !== undefined)
        scope[key] = requireString(rawScope[key], `${location}.scope.${key}`);
    }
    if (rawScope.doc_type !== undefined)
      scope.doc_type = validateDocType(
        requireString(rawScope.doc_type, `${location}.scope.doc_type`),
      );
    const expires =
      raw.expires === undefined ? undefined : requireString(raw.expires, `${location}.expires`);
    if (expires !== undefined) {
      const date = new Date(`${expires}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(expires) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== expires
      ) {
        throw new Error(`${location}.expires must be a real YYYY-MM-DD date`);
      }
    }
    return { id, rules, reason, scope, expires };
  });
}

function scopeMatches(finding: Finding, scope: Waiver["scope"]): boolean {
  if (
    scope.path &&
    !globMatches(normalizePathForMatch(finding.path), normalizePathForMatch(scope.path))
  )
    return false;
  if (scope.doc_type && scope.doc_type !== finding.docType) return false;
  if (
    scope.section &&
    !finding.sections.some(
      (section) => normalizeSection(section) === normalizeSection(scope.section ?? ""),
    )
  )
    return false;
  return true;
}
