import { classifyPath, type GateConfig } from "./config.js";
import { splitFrontmatter } from "./frontmatter.js";
import { headingText, parseMarkdown } from "./markdown.js";
import type { DocumentType, Metadata } from "./model.js";
import { validateDocType } from "./model.js";

const HEADING_HINTS: Array<[RegExp, DocumentType]> = [
  [/\b(api|endpoint)\b|接口/i, "public-api-doc"],
  [/\b(access|guide)\b|接入|指南/i, "access-guide"],
  [/\b(plan|implementation)\b|方案/i, "implementation-plan"],
  [/\bissue\b|问题|需求/i, "issue-description"],
  [/\b(adr|architecture decision record)\b/i, "adr"],
  [/\brunbook\b|操作手册|应急/i, "runbook"],
];

export interface ClassifiedDocument {
  docType: DocumentType;
  metadata: Metadata;
  body: string;
  lineOffset: number;
}

export function classifyDocument(
  path: string,
  text: string,
  config: GateConfig,
  explicitType?: string,
): ClassifiedDocument {
  const content = splitFrontmatter(text);
  const { metadata, body } = content;

  if (explicitType) {
    return { ...content, docType: validateDocType(explicitType) };
  }

  const pathType = classifyPath(config, path);
  if (pathType) {
    return { ...content, docType: pathType };
  }

  const fmType = metadata.doc_type ?? metadata.type;
  if (typeof fmType === "string" && fmType) {
    return { ...content, docType: validateDocType(fmType) };
  }

  for (const node of parseMarkdown(body).children) {
    if (node.type !== "heading" || (node.position?.start.line ?? 0) > 20) continue;
    for (const [pattern, docType] of HEADING_HINTS) {
      if (pattern.test(headingText(node))) {
        return { ...content, docType };
      }
    }
  }

  return { ...content, docType: "unknown" };
}
