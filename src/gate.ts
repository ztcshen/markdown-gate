import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { classifyDocument } from "./classifier.js";
import type { GateConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { Document, DocumentType, ScanResult, Severity } from "./model.js";
import { resultFailed } from "./model.js";
import { scanDocuments } from "./scanner.js";
import { applyWaivers } from "./waiver.js";

export interface CheckOptions {
  configPath?: string;
  explicitType?: string;
  failOn?: Severity;
  waiverFile?: string;
}

export function checkPaths(paths: string[], options: CheckOptions = {}): ScanResult {
  const config = loadConfig(options.configPath);
  const documents = loadDocuments(paths, config, options.explicitType);
  return checkDocuments(documents, config, options);
}

export function checkText(path: string, text: string, options: CheckOptions = {}): ScanResult {
  const config = loadConfig(options.configPath);
  const document = documentFromText(path, text, config, options.explicitType);
  return checkDocuments([document], config, options);
}

export function classifyPaths(
  paths: string[],
  options: Pick<CheckOptions, "configPath" | "explicitType"> = {},
): Document[] {
  const config = loadConfig(options.configPath);
  return loadDocuments(paths, config, options.explicitType);
}

function checkDocuments(
  documents: Document[],
  config: GateConfig,
  options: CheckOptions,
): ScanResult {
  const failOn = options.failOn ?? config.failOn;
  const findings = applyWaivers(scanDocuments(documents, config), options.waiverFile);
  return {
    status: resultFailed(findings, failOn) ? "fail" : "pass",
    failOn,
    documents: documents.map((document) => ({
      path: document.path,
      docType: document.docType,
      metadata: document.metadata,
    })),
    findings,
  };
}

function loadDocuments(paths: string[], config: GateConfig, explicitType?: string): Document[] {
  const expanded = expandPaths(paths);
  if (expanded.length === 0) {
    throw new Error("provide at least one Markdown path or --stdin");
  }
  return expanded.map((path) =>
    documentFromText(path, readFileSync(path, "utf8"), config, explicitType),
  );
}

export function documentFromText(
  path: string,
  text: string,
  config: GateConfig,
  explicitType?: string,
): Document {
  const classified = classifyDocument(path, text, config, explicitType);
  return {
    path,
    text: classified.body,
    docType: classified.docType as DocumentType,
    metadata: classified.metadata,
    lineOffset: classified.lineOffset,
  };
}

export function expandPaths(values: string[]): string[] {
  const paths: string[] = [];
  for (const value of values) {
    const stats = statSync(value, { throwIfNoEntry: false });
    if (!stats) {
      throw new Error(`path does not exist: ${value}`);
    }
    if (stats.isDirectory()) {
      paths.push(...findMarkdownFiles(value));
    } else if (stats.isFile() && isMarkdownPath(value)) {
      paths.push(value);
    } else {
      throw new Error(`not a Markdown file or directory: ${value}`);
    }
  }
  const unique = new Map<string, string>();
  for (const path of paths) {
    if (!unique.has(resolve(path))) unique.set(resolve(path), path);
  }
  return [...unique.values()].sort();
}

export function isMarkdownPath(value: string): boolean {
  return /\.(md|markdown)$/i.test(value);
}

function findMarkdownFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== ".git" && entry.name !== "node_modules")
        files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && isMarkdownPath(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}
