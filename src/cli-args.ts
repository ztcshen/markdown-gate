import { parseArgs } from "node:util";

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean | undefined>;
}

const COMMAND_OPTIONS: Record<string, Record<string, { type: "string" | "boolean" }>> = {
  check: {
    stdin: { type: "boolean" },
    "stdin-path": { type: "string" },
    type: { type: "string" },
    format: { type: "string" },
    config: { type: "string" },
    "fail-on": { type: "string" },
    "waiver-file": { type: "string" },
  },
  classify: {
    stdin: { type: "boolean" },
    "stdin-path": { type: "string" },
    type: { type: "string" },
    format: { type: "string" },
    config: { type: "string" },
  },
  "install-codex-hooks": {
    "repo-root": { type: "string" },
    "codex-home": { type: "string" },
    global: { type: "boolean" },
    force: { type: "boolean" },
  },
  hook: {},
  rules: { "rule-pack": { type: "string" } },
};

export function parseCliArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (!Object.hasOwn(COMMAND_OPTIONS, command)) throw new Error(`unknown command: ${command}`);
  const options: Record<string, { type: "string" | "boolean"; short?: string }> = {
    ...COMMAND_OPTIONS[command],
    help: { type: "boolean", short: "h" },
  };
  const {
    values: flags,
    positionals,
    tokens,
  } = parseArgs({
    args: rest,
    options,
    allowPositionals: true,
    tokens: true,
    strict: true,
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error(`duplicate option --${token.name}`);
    seen.add(token.name);
    if (typeof token.value === "string" && !token.value.trim())
      throw new Error(`--${token.name} requires a non-empty value`);
  }
  if (flags.help) return { command, positionals, flags };
  if (flags.format !== undefined && !["json", "text"].includes(String(flags.format)))
    throw new Error("--format must be text or json");
  if (flags.stdin && positionals.length)
    throw new Error("--stdin cannot be combined with file paths");
  if (flags["stdin-path"] && !flags.stdin) throw new Error("--stdin-path requires --stdin");
  if (command === "install-codex-hooks") {
    if (positionals.length)
      throw new Error("install-codex-hooks does not accept positional arguments");
    if (flags["codex-home"] && !flags.global) throw new Error("--codex-home requires --global");
  }
  if ((command === "hook" || command === "rules") && positionals.length !== 1)
    throw new Error(`${command} requires exactly one subcommand`);
  return { command, positionals, flags };
}

export function wantsJson(argv: string[]): boolean {
  const end = argv.indexOf("--");
  const options = end < 0 ? argv : argv.slice(0, end);
  return options.some(
    (value, index) =>
      value === "--format=json" || (value === "--format" && options[index + 1] === "json"),
  );
}
