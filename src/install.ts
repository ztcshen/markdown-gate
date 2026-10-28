import { randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

interface HookCommand {
  type: "command";
  command: string;
  timeout: number;
  statusMessage: string;
}
interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}
interface HooksJson {
  hooks: Record<string, HookEntry[]>;
}
type JsonObject = Record<string, unknown>;
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EVENTS = {
  PreToolUse: { action: "pre-tool-use", timeout: 30, message: "Checking Markdown publish gate" },
  PostToolUse: {
    action: "post-tool-use",
    timeout: 60,
    message: "Checking Markdown final-state hygiene",
  },
  Stop: { action: "stop", timeout: 15, message: "Checking Markdown delivery" },
} as const;

export function projectHooksJson(sourceRoot = SOURCE_ROOT): HooksJson {
  const cli = resolve(sourceRoot, "dist", "cli.js");
  return {
    hooks: Object.fromEntries(
      Object.entries(EVENTS).map(([event, spec]) => [
        event,
        [
          {
            ...(event === "Stop" ? {} : { matcher: "*" }),
            hooks: [
              {
                type: "command",
                command: `${shellQuote(process.execPath)} ${shellQuote(cli)} hook ${spec.action} # markdown-gate`,
                timeout: spec.timeout,
                statusMessage: spec.message,
              },
            ],
          },
        ],
      ]),
    ),
  };
}
export function globalHooksJson(sourceRoot = SOURCE_ROOT): HooksJson {
  return projectHooksJson(sourceRoot);
}
export function installCodexHooks(
  repoRoot: string,
  force = false,
  sourceRoot = SOURCE_ROOT,
): string {
  return install(resolve(repoRoot, ".codex", "hooks.json"), sourceRoot, force);
}
export function installGlobalCodexHooks(
  codexHome: string,
  sourceRoot = SOURCE_ROOT,
  force = false,
): string {
  const home =
    codexHome === "~" || codexHome.startsWith("~/")
      ? resolve(process.env.HOME || "~", codexHome.slice(2))
      : codexHome;
  return install(resolve(home, "hooks.json"), sourceRoot, force);
}
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
function record(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as JsonObject;
}
function ownsCommand(value: unknown, event: keyof typeof EVENTS): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as JsonObject;
  if (command.type !== "command" || typeof command.command !== "string") return false;
  if (command.command.endsWith(` hook ${EVENTS[event].action} # markdown-gate`)) return true;
  // Recognize configurations emitted by older markdown-gate versions. Requiring
  // both the exact status message and CLI/action shape protects unrelated hooks.
  return (
    command.statusMessage === EVENTS[event].message &&
    new RegExp(`(?:/|\\\\)dist(?:/|\\\\)cli\\.js["']?\\s+hook ${EVENTS[event].action}$`).test(
      command.command,
    )
  );
}
function mergeHooks(existing: JsonObject, generated: HooksJson, force: boolean): JsonObject {
  const hooks = existing.hooks === undefined ? {} : record(existing.hooks, "hooks");
  const merged = { ...hooks };
  for (const event of Object.keys(EVENTS) as Array<keyof typeof EVENTS>) {
    const entries = hooks[event] ?? [];
    if (!Array.isArray(entries)) throw new Error(`hooks.${event} must be an array`);
    const desired = generated.hooks[event][0];
    const retained: JsonObject[] = [];
    for (const value of entries) {
      const entry = record(value, `hooks.${event} entry`);
      if (!Array.isArray(entry.hooks))
        throw new Error(`hooks.${event} entry must contain a hooks array`);
      const foreign: unknown[] = [];
      for (const command of entry.hooks) {
        record(command, `hooks.${event} command`);
        if (!ownsCommand(command, event)) {
          foreign.push(command);
          continue;
        }
        if (
          !force &&
          (!isDeepStrictEqual(command, desired.hooks[0]) || entry.matcher !== desired.matcher)
        ) {
          throw new Error(
            `Existing markdown-gate ${event} hook differs; use --force to update only markdown-gate hooks`,
          );
        }
      }
      if (foreign.length === entry.hooks.length) retained.push(entry);
      else if (foreign.length) retained.push({ ...entry, hooks: foreign });
    }
    merged[event] = [...retained, desired];
  }
  return { ...existing, hooks: merged };
}
function install(target: string, sourceRoot: string, force: boolean): string {
  const cli = resolve(sourceRoot, "dist", "cli.js");
  if (!existsSync(cli) || !statSync(cli).isFile())
    throw new Error(`Build markdown-gate before installing hooks: missing ${cli}`);
  if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error(`${target} is a symlink; install into the real configuration directory`);
  let original: string | undefined;
  try {
    original = readFileSync(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const existing = original === undefined ? {} : record(JSON.parse(original), target);
  const merged = mergeHooks(existing, projectHooksJson(sourceRoot), force);
  if (original !== undefined && isDeepStrictEqual(existing, merged)) return target;
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.markdown-gate-${randomUUID()}.tmp`;
  try {
    const mode = original === undefined ? 0o600 : statSync(target).mode & 0o777;
    writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, { flag: "wx", mode });
    if (original !== undefined) {
      if (readFileSync(target, "utf8") !== original)
        throw new Error(`${target} changed during installation; retry`);
      copyFileSync(target, `${target}.markdown-gate-${randomUUID()}.bak`, constants.COPYFILE_EXCL);
    }
    if (original === undefined) linkSync(temporary, target);
    else renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  return target;
}
