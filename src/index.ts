export { classifyDocument } from "./classifier.js";
export {
  createDefaultConfig,
  type GateConfig,
  loadConfig,
  normalizeSection,
} from "./config.js";
export {
  type CheckOptions,
  checkPaths,
  checkText,
  classifyPaths,
  expandPaths,
  isMarkdownPath,
} from "./gate.js";
export type { Document, DocumentType, Finding, Metadata, ScanResult, Severity } from "./model.js";
export { renderJson, renderText, serializeResult } from "./report.js";
export { scanDocument, scanDocuments } from "./scanner.js";
