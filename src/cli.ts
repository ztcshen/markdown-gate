#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ParsedArgs, parseCliArgs, wantsJson } from "./cli-args.js";
import { checkPaths, checkText, classifyPaths } from "./gate.js";
import { runPostToolUse } from "./hooks/post-tool-use.js";
import { runPreToolUse } from "./hooks/pre-tool-use.js";
import { runStop } from "./hooks/stop.js";
import { installCodexHooks, installGlobalCodexHooks } from "./install.js";
import { parseSeverity, type Severity } from "./model.js";
import { renderJson, renderText } from "./report.js";
import { builtinRulePackPath, loadRulePack, validateRulePack } from "./rules.js";

export async function main(argv = process.argv.slice(2), stdin?: string): Promise<number> {
  try {
    if (!argv.length || ["--help", "-h", "help"].includes(argv[0])) {
      if (argv.length > 1) throw new Error("help does not accept additional arguments");
      printHelp();
      return 0;
    }
    if (["--version", "-v"].includes(argv[0])) {
      if (argv.length !== 1) throw new Error("--version does not accept additional arguments");
      const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
      console.log(pkg.version);
      return 0;
    }
    const args = parseCliArgs(argv);
    if (booleanFlag(args, "help")) {
      printHelp();
      return 0;
    }
    const input =
      stdin ??
      (args.command === "hook" || booleanFlag(args, "stdin") ? readStdinIfAvailable() : "");
    if (args.command === "check") {
      return runCheck(args, input);
    }
    if (args.command === "classify") {
      return runClassify(args, input);
    }
    if (args.command === "install-codex-hooks") {
      return runInstallCodexHooks(args);
    }
    if (args.command === "hook") {
      return runHook(args, input);
    }
    if (args.command === "rules") {
      return runRules(args);
    }
    printHelp();
    return 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (wantsJson(argv))
      console.log(JSON.stringify({ status: "error", error: { message } }, null, 2));
    else console.error(`markdown-gate: ${message}`);
    return 2;
  }
}

function runCheck(args: ParsedArgs, stdin: string): number {
  const explicitType = stringFlag(args, "type");
  const failOn = optionalSeverity(stringFlag(args, "fail-on"));
  const options = {
    configPath: stringFlag(args, "config"),
    explicitType,
    failOn,
    waiverFile: stringFlag(args, "waiver-file"),
  };
  const result = booleanFlag(args, "stdin")
    ? checkText(stringFlag(args, "stdin-path") ?? "<stdin>", stdin, options)
    : checkPaths(args.positionals, options);

  console.log(stringFlag(args, "format") === "json" ? renderJson(result) : renderText(result));
  return result.status === "fail" ? 1 : 0;
}

function runClassify(args: ParsedArgs, stdin: string): number {
  const options = {
    configPath: stringFlag(args, "config"),
    explicitType: stringFlag(args, "type"),
  };
  const documents = booleanFlag(args, "stdin")
    ? [
        checkText(stringFlag(args, "stdin-path") ?? "<stdin>", stdin, {
          ...options,
          failOn: "off",
        }).documents[0],
      ]
    : classifyPaths(args.positionals, options);

  if (stringFlag(args, "format") === "json") {
    console.log(
      JSON.stringify(
        documents.map((document) => ({
          path: document.path,
          doc_type: document.docType,
          metadata: document.metadata,
        })),
        null,
        2,
      ),
    );
  } else {
    for (const document of documents) {
      console.log(`${document.path}\t${document.docType}`);
    }
  }
  return 0;
}

function runInstallCodexHooks(args: ParsedArgs): number {
  const repoRoot = resolve(stringFlag(args, "repo-root") ?? ".");
  const target = booleanFlag(args, "global")
    ? installGlobalCodexHooks(
        stringFlag(args, "codex-home") ?? "~/.codex",
        stringFlag(args, "repo-root") ? repoRoot : undefined,
        booleanFlag(args, "force"),
      )
    : installCodexHooks(repoRoot, booleanFlag(args, "force"));
  console.log(`installed Codex hooks: ${target}`);
  return 0;
}

function runHook(args: ParsedArgs, stdin: string): number {
  const hook = args.positionals[0];
  if (hook === "pre-tool-use") {
    console.log(runPreToolUse(stdin));
  } else if (hook === "post-tool-use") {
    console.log(runPostToolUse(stdin));
  } else if (hook === "stop") {
    console.log(runStop(stdin));
  } else {
    throw new Error("hook must be one of: pre-tool-use, post-tool-use, stop");
  }
  return 0;
}

function runRules(args: ParsedArgs): number {
  const subcommand = args.positionals[0];
  if (subcommand !== "check") {
    throw new Error("rules subcommand must be: check");
  }
  const path = stringFlag(args, "rule-pack") ?? builtinRulePackPath();
  const rulePack = loadRulePack(path);
  validateRulePack(rulePack);
  console.log(`rules: PASS ${path} (${rulePack.rules.length} rules)`);
  return 0;
}

function optionalSeverity(value?: string): Severity | undefined {
  return value ? parseSeverity(value) : undefined;
}

function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function booleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}

function readStdinIfAvailable(): string {
  try {
    if (process.stdin.isTTY) {
      return "";
    }
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function printHelp(): void {
  console.log(`markdown-gate

Usage:
  markdown-gate check [--stdin] [--type TYPE] [--format text|json] [paths...]
  markdown-gate classify [--stdin] [--type TYPE] [--format text|json] [paths...]
  markdown-gate install-codex-hooks [--repo-root PATH] [--global] [--codex-home PATH] [--force]
  markdown-gate hook pre-tool-use|post-tool-use|stop
  markdown-gate rules check [--rule-pack PATH]
  markdown-gate --help | --version

Check options:
  --config PATH       Load an explicit TOML policy
  --fail-on SEVERITY  Fail on suggestion, warning, or error; off disables failure
  --waiver-file PATH  Apply validated, scoped JSON waivers
  --stdin-path PATH   Classify stdin as this path (requires --stdin)
  --                  Treat remaining arguments as paths
`);
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().then((code) => {
    process.exitCode = code;
  });
}
