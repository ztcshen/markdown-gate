import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { checkPaths, checkText, isMarkdownPath } from "../gate.js";
import type { ScanResult } from "../model.js";
import { renderText } from "../report.js";

export type HookPayload = Record<string, unknown>;

export type MarkdownTextInput = {
  source: string;
  text: string;
};

export function readPayload(raw: string): HookPayload {
  if (!raw.trim()) {
    return {};
  }
  try {
    return getRecord(JSON.parse(raw)) ?? {};
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

export function checkMarkdownText(
  source: string,
  text: string,
  explicitType: string,
): { result: ScanResult; output: string } {
  const result = checkText(source, text, { explicitType });
  return { result, output: renderText(result) };
}

export function changedMarkdownPaths(cwd: string): string[] {
  const paths = new Set<string>();
  for (const args of [
    ["diff", "--relative", "--name-only", "--diff-filter=ACMRT", "-z"],
    ["diff", "--cached", "--relative", "--name-only", "--diff-filter=ACMRT", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ]) {
    for (const path of gitPaths(cwd, args)) {
      if (isExistingMarkdown(cwd, path)) paths.add(path);
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

  const rawInput = payload.tool_input ?? payload.input;
  if (typeof rawInput === "string") candidates.push(...extractPathsFromPatch(rawInput));
  const toolInput = getRecord(rawInput);
  if (toolInput) {
    for (const key of ["path", "file_path", "file"]) {
      const value = toolInput[key];
      if (typeof value === "string") {
        candidates.push(value);
      }
    }
    for (const key of ["command", "cmd", "patch", "input"]) {
      if (typeof toolInput[key] === "string")
        candidates.push(...extractPathsFromPatch(toolInput[key]));
    }
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

export function extractMulticaTextInputs(cwd: string, command: string): MarkdownTextInput[] {
  if (!isMulticaTextWriteCommand(command)) {
    return [];
  }

  const inputs: MarkdownTextInput[] = [];
  for (const option of ["description", "content"]) {
    for (const text of optionValues(command, option)) {
      inputs.push({ source: `${cwd}/<multica-${option}>.md`, text });
    }
  }

  for (const option of ["description-file", "content-file"]) {
    for (const path of optionValues(command, option)) {
      const source = isAbsolute(path) ? path : resolve(cwd, path);
      try {
        inputs.push({ source, text: readFileSync(source, "utf8") });
      } catch {
        // Let the target CLI report unreadable files with its native error.
      }
    }
  }

  return inputs;
}

export function isBashPayload(payload: HookPayload): boolean {
  return ["bash", "exec_command", "shell_command", "shell"].includes(
    String(payload.tool_name || "").toLowerCase(),
  );
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

function gitPaths(cwd: string, args: string[]): string[] {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\0")
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

function isMulticaTextWriteCommand(command: string): boolean {
  const isMulticaCli = /\bmultica(?:\s|$)/i.test(command);
  const isMulticaHelper = /\bmultica_api\.py\b/i.test(command);
  const hasTextOption = ["description", "description-file", "content", "content-file"].some(
    (option) => new RegExp(`(?:^|\\s)--${option}(?:=|\\s|$)`).test(command),
  );
  return (isMulticaCli || isMulticaHelper) && hasTextOption;
}

function optionValues(command: string, option: string): string[] {
  const matcher = new RegExp(
    `(?:^|\\s)--${option}(?:=|\\s+)(?:"((?:\\\\.|[^"])*)"|'((?:\\\\.|[^'])*)'|([^\\s]+))`,
    "g",
  );
  const values: string[] = [];
  for (const match of command.matchAll(matcher)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value) {
      values.push(value.replace(/\\([\\"'])/g, "$1"));
    }
  }
  return values;
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
