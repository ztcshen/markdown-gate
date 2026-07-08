import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { checkPaths, isMarkdownPath } from "../gate.js";
import type { ScanResult } from "../model.js";
import { renderText } from "../report.js";

export type HookPayload = Record<string, unknown>;

export function readPayload(raw: string): HookPayload {
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as HookPayload;
  } catch {
    return {};
  }
}

export function extractCommand(payload: HookPayload): string {
  const toolInput = getRecord(payload.tool_input) ?? getRecord(payload.input);
  if (!toolInput) {
    return "";
  }
  return String(toolInput.command ?? toolInput.cmd ?? toolInput.cmdline ?? "");
}

export function cwdFromPayload(payload: HookPayload): string {
  return String(payload.cwd || process.cwd());
}

export function checkMarkdownPaths(
  paths: string[],
  cwd = process.cwd(),
): { result: ScanResult; output: string } {
  const result = checkPaths(paths.map((item) => (isAbsolute(item) ? item : resolve(cwd, item))));
  return { result, output: renderText(result) };
}

export function changedMarkdownPaths(cwd: string): string[] {
  const paths = new Set<string>();
  for (const line of gitLines(cwd, ["diff", "--name-only", "--diff-filter=ACMRT", "HEAD"])) {
    if (isExistingMarkdown(cwd, line)) {
      paths.add(line);
    }
  }
  for (const line of gitLines(cwd, ["ls-files", "--others", "--exclude-standard"])) {
    if (isExistingMarkdown(cwd, line)) {
      paths.add(line);
    }
  }
  return [...paths].sort();
}

export function publishScope(cwd: string, command: string): string[] {
  const explicit = process.env.MARKDOWN_GATE_PATHS;
  if (explicit) {
    return explicit.split(delimiter).filter(Boolean);
  }

  const paths = new Set(
    extractMarkdownPathsFromText(command).filter((item) => isExistingMarkdown(cwd, item)),
  );
  for (const path of changedMarkdownPaths(cwd)) {
    paths.add(path);
  }
  return [...paths].sort();
}

export function extractMarkdownPaths(payload: HookPayload, cwd: string): string[] {
  const candidates: string[] = [];
  for (const key of ["path", "file_path", "file"]) {
    const value = payload[key];
    if (typeof value === "string") {
      candidates.push(value);
    }
  }

  const toolInput = getRecord(payload.tool_input) ?? getRecord(payload.input);
  if (toolInput) {
    for (const key of ["path", "file_path", "file"]) {
      const value = toolInput[key];
      if (typeof value === "string") {
        candidates.push(value);
      }
    }
    candidates.push(...extractPathsFromPatch(String(toolInput.command ?? toolInput.cmd ?? "")));
  }

  if (typeof payload.tool_response === "string") {
    candidates.push(...extractPathsFromPatch(payload.tool_response));
  } else {
    const toolResponse = getRecord(payload.tool_response);
    if (toolResponse) {
      candidates.push(...extractPathsFromPatch(JSON.stringify(toolResponse)));
    }
  }

  return [...new Set(candidates.filter((item) => isExistingMarkdown(cwd, item)))].sort();
}

export function isBashPayload(payload: HookPayload): boolean {
  return String(payload.tool_name || "").toLowerCase() === "bash";
}

export function bashMayHaveChangedMarkdown(command: string): boolean {
  return (
    /\.(md|markdown)\b/i.test(command) ||
    /(^|[;&|]\s*)(cat|tee|touch|cp|mv|rm|sed|perl|python3?)\b/.test(command) ||
    command.includes(">")
  );
}

export function extractMarkdownFromMessage(message: string): string {
  const fenced = [...message.matchAll(/```(?:markdown|md)\s*\n(.*?)```/gis)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (fenced.length > 0) {
    return fenced.join("\n\n");
  }

  const lines = message.split(/\r?\n/);
  const index = lines.findIndex((line) => /^\s*#\s+/.test(line));
  return index >= 0 ? lines.slice(index).join("\n").trim() : "";
}

function gitLines(cwd: string, args: string[]): string[] {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isExistingMarkdown(cwd: string, value: string): boolean {
  return isMarkdownPath(value) && existsSync(isAbsolute(value) ? value : resolve(cwd, value));
}

function extractMarkdownPathsFromText(text: string): string[] {
  return [...text.matchAll(/(?<![\w./-])([\w./-]+\.(?:md|markdown))\b/gi)].map((match) => match[1]);
}

function extractPathsFromPatch(text: string): string[] {
  const prefixes = ["*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "];
  const paths: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    for (const prefix of prefixes) {
      if (line.startsWith(prefix)) {
        paths.push(line.slice(prefix.length).trim());
      }
    }
  }
  return paths;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
