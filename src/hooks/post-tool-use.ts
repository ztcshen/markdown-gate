import { empty, postToolBlock } from "../hook-output.js";
import {
  bashMayHaveChangedMarkdown,
  changedMarkdownPaths,
  checkMarkdownPaths,
  cwdFromPayload,
  extractCommand,
  extractMarkdownPaths,
  isBashPayload,
  readPayload,
} from "./shared.js";

export function runPostToolUse(rawPayload: string): string {
  const payload = readPayload(rawPayload);
  const cwd = cwdFromPayload(payload);
  let markdownPaths = extractMarkdownPaths(payload, cwd);
  if (markdownPaths.length === 0 && isBashPayload(payload)) {
    const command = extractCommand(payload);
    if (bashMayHaveChangedMarkdown(command)) {
      markdownPaths = changedMarkdownPaths(cwd);
    }
  }

  if (markdownPaths.length === 0) {
    return empty();
  }

  const { result, output } = checkMarkdownPaths(markdownPaths, cwd);
  if (result.status === "fail") {
    return postToolBlock(
      "markdown-gate found final-state hygiene issues. Revise the Markdown and rerun the check.",
      output,
    );
  }
  return empty();
}
