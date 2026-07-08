import { classifyPath, type GateConfig } from "./config.js";
import { splitFrontmatter } from "./frontmatter.js";
import type { DocumentType, Metadata } from "./model.js";
import { validateDocType } from "./model.js";

const HEADING_HINTS: Array<[RegExp, DocumentType]> = [
  [/^\s*#.+(api|接口|endpoint)/i, "public-api-doc"],
  [/^\s*#.+(access|接入|guide|指南)/i, "access-guide"],
  [/^\s*#.+(plan|方案|implementation)/i, "implementation-plan"],
  [/^\s*#.+(issue|问题|需求)/i, "issue-description"],
  [/^\s*#.+(adr|architecture decision record)/i, "adr"],
  [/^\s*#.+(runbook|操作手册|应急)/i, "runbook"],
];

export interface ClassifiedDocument {
  docType: DocumentType;
  metadata: Metadata;
  body: string;
}

export function classifyDocument(
  path: string,
  text: string,
  config: GateConfig,
  explicitType?: string,
): ClassifiedDocument {
  const { metadata, body } = splitFrontmatter(text);

  if (explicitType) {
    return { docType: validateDocType(explicitType), metadata, body };
  }

  const pathType = classifyPath(config, path);
  if (pathType) {
    return { docType: pathType, metadata, body };
  }

  const fmType = metadata.doc_type ?? metadata.type;
  if (typeof fmType === "string" && fmType) {
    return { docType: validateDocType(fmType), metadata, body };
  }

  for (const line of body.split(/\r?\n/).slice(0, 20)) {
    for (const [pattern, docType] of HEADING_HINTS) {
      if (pattern.test(line)) {
        return { docType, metadata, body };
      }
    }
  }

  return { docType: "unknown", metadata, body };
}
