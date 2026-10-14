import { type GateConfig, isAllowedSectionPath, severityFor } from "./config.js";
import { iterProseBlocks, sourceLocator } from "./markdown.js";
import type { Document, Finding } from "./model.js";

export { iterProseBlocks } from "./markdown.js";

export function scanDocuments(documents: Document[], config: GateConfig): Finding[] {
  return documents.flatMap((document) => scanDocument(document, config));
}

export function scanDocument(document: Document, config: GateConfig): Finding[] {
  const findings: Finding[] = [];
  const locate = sourceLocator(document.text);
  for (const block of iterProseBlocks(document.text)) {
    for (const rule of config.rules) {
      const severity = severityFor(config, document.docType, rule.id);
      if (severity === "off") continue;
      if (
        isAllowedSectionPath(config, document.docType, block.sections) &&
        (rule.allowInAllowedSections || severity === "suggestion")
      ) {
        continue;
      }
      // Cached expressions never share lastIndex between scans. matchAll also
      // advances safely for zero-length matches, which are not findings.
      const regex = new RegExp(rule.regex.source, `${rule.regex.flags.replace(/[gy]/g, "")}g`);
      for (const match of block.text.matchAll(regex)) {
        if (!match[0]) continue;
        const [line, column] = locate(block.offsets[match.index]);
        findings.push({
          path: document.path,
          docType: document.docType,
          line: line + (document.lineOffset ?? 0),
          column,
          rule: rule.id,
          severity,
          message: rule.message,
          excerpt: block.text.trim(),
          section: block.section,
          sections: block.sections,
        });
      }
    }
  }
  return findings;
}
