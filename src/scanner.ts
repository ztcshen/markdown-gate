import { type GateConfig, isAllowedSectionPath, severityFor } from "./config.js";
import type { Document, Finding, Severity } from "./model.js";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

interface Segment {
  line: number;
  column: number;
  start: number;
  text: string;
}

interface ProseBlock {
  text: string;
  segments: Segment[];
  sections: string[];
  section?: string;
}

export function scanDocuments(documents: Document[], config: GateConfig): Finding[] {
  return documents.flatMap((document) => scanDocument(document, config));
}

export function scanDocument(document: Document, config: GateConfig): Finding[] {
  const findings: Finding[] = [];
  for (const block of iterProseBlocks(document.text)) {
    for (const rule of config.rules) {
      const match = rule.regex.exec(block.text);
      if (!match || match.index === undefined) {
        continue;
      }

      const severity: Severity = severityFor(config, document.docType, rule.id);
      if (isAllowedSectionPath(config, document.docType, block.sections)) {
        if (rule.allowInAllowedSections) {
          continue;
        }
        if (severity === "off" || severity === "suggestion") {
          continue;
        }
      }

      if (severity === "off") {
        continue;
      }

      const [line, column] = locateMatch(block, match.index);
      findings.push({
        path: document.path,
        docType: document.docType,
        line,
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
  return findings;
}

export function* iterProseBlocks(text: string): Iterable<ProseBlock> {
  const sectionStack: Array<[number, string]> = [];
  let segments: Segment[] = [];
  let inFence = false;

  const flush = (): ProseBlock | undefined => {
    if (segments.length === 0) {
      return undefined;
    }
    const normalizedSegments: Segment[] = [];
    let offset = 0;
    for (const segment of segments) {
      normalizedSegments.push({ ...segment, start: offset });
      offset += segment.text.length + 1;
    }
    const block: ProseBlock = {
      text: normalizedSegments.map((segment) => segment.text).join(" "),
      segments: normalizedSegments,
      sections: sectionStack.map(([, title]) => title),
    };
    block.section = block.sections.at(-1);
    segments = [];
    return block;
  };

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const stripped = line.trim();

    if (FENCE_RE.test(line)) {
      const block = flush();
      if (block) {
        yield block;
      }
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const block = flush();
      if (block) {
        yield block;
      }
      const level = heading[1].length;
      const title = stripMarkdownTitle(heading[2]);
      while (sectionStack.length > 0 && (sectionStack.at(-1)?.[0] ?? 0) >= level) {
        sectionStack.pop();
      }
      sectionStack.push([level, title]);
      continue;
    }

    if (!stripped || looksLikeTableRow(stripped)) {
      const block = flush();
      if (block) {
        yield block;
      }
      continue;
    }

    const leading = line.length - line.trimStart().length;
    segments.push({ line: lineNumber, column: leading + 1, start: 0, text: stripped });
  }

  const block = flush();
  if (block) {
    yield block;
  }
}

function locateMatch(block: ProseBlock, offset: number): [number, number] {
  for (const segment of block.segments) {
    const end = segment.start + segment.text.length;
    if (segment.start <= offset && offset <= end) {
      return [segment.line, segment.column + Math.max(0, offset - segment.start)];
    }
  }
  const last = block.segments.at(-1);
  return last ? [last.line, last.column] : [1, 1];
}

function looksLikeTableRow(stripped: string): boolean {
  if (stripped.startsWith("|") && stripped.endsWith("|")) {
    return true;
  }
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(stripped);
}

function stripMarkdownTitle(title: string): string {
  return title
    .trim()
    .replace(/^#+|#+$/g, "")
    .trim();
}
