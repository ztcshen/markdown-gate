import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
  hooks: {
    PreToolUse: HookEntry[];
    PostToolUse: HookEntry[];
    Stop: HookEntry[];
  };
}

export function projectHooksJson(): HooksJson {
  return hooksJson(
    'node "$(git rev-parse --show-toplevel)/dist/cli.js" hook pre-tool-use',
    'node "$(git rev-parse --show-toplevel)/dist/cli.js" hook post-tool-use',
    'node "$(git rev-parse --show-toplevel)/dist/cli.js" hook stop',
  );
}

export function globalHooksJson(sourceRoot: string): HooksJson {
  const cliPath = resolve(sourceRoot, "dist", "cli.js");
  return hooksJson(
    `node "${cliPath}" hook pre-tool-use`,
    `node "${cliPath}" hook post-tool-use`,
    `node "${cliPath}" hook stop`,
  );
}

export function installCodexHooks(repoRoot: string, force = false): string {
  const target = resolve(repoRoot, ".codex", "hooks.json");
  return writeHooks(target, projectHooksJson(), force);
}

export function installGlobalCodexHooks(
  codexHome: string,
  sourceRoot: string,
  force = false,
): string {
  const target = resolve(codexHome.replace(/^~/, process.env.HOME || "~"), "hooks.json");
  return writeHooks(target, globalHooksJson(sourceRoot), force);
}

function hooksJson(preCommand: string, postCommand: string, stopCommand: string): HooksJson {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "^Bash$",
          hooks: [
            {
              type: "command",
              command: preCommand,
              timeout: 30,
              statusMessage: "Checking Markdown publish gate",
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "^Bash$|^apply_patch$|^Edit$|^Write$",
          hooks: [
            {
              type: "command",
              command: postCommand,
              timeout: 60,
              statusMessage: "Checking Markdown final-state hygiene",
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: stopCommand,
              timeout: 15,
              statusMessage: "Checking Markdown delivery",
            },
          ],
        },
      ],
    },
  };
}

function writeHooks(target: string, hooks: HooksJson, force: boolean): string {
  const desired = `${JSON.stringify(hooks, null, 2)}\n`;
  mkdirSync(dirname(target), { recursive: true });
  try {
    const existing = readFileSync(target, "utf8");
    if (existing !== desired && !force) {
      throw new Error(`${target} already exists and differs; rerun with --force to replace it`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  writeFileSync(target, desired, "utf8");
  return target;
}
