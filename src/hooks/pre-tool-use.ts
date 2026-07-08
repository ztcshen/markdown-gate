import { empty, preToolDeny } from "../hook-output.js";
import {
  checkMarkdownPaths,
  cwdFromPayload,
  extractCommand,
  publishScope,
  readPayload,
} from "./shared.js";

const PUBLISH_COMMAND_MARKERS = [
  "docs publish",
  "mindoc",
  "multica issue comment add",
  "gh pr create",
];

export function runPreToolUse(rawPayload: string): string {
  const payload = readPayload(rawPayload);
  const cwd = cwdFromPayload(payload);
  const command = extractCommand(payload);

  if (command && PUBLISH_COMMAND_MARKERS.some((marker) => command.includes(marker))) {
    const markdownPaths = publishScope(cwd, command);
    if (markdownPaths.length === 0) {
      return empty();
    }
    const { result, output } = checkMarkdownPaths(markdownPaths, cwd);
    if (result.status === "fail") {
      return preToolDeny("Markdown gate failed before publish command.", output);
    }
  }

  return empty();
}
