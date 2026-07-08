import { checkText } from "../gate.js";
import { empty, stopBlock } from "../hook-output.js";
import { renderText } from "../report.js";
import { cwdFromPayload, extractMarkdownFromMessage, readPayload } from "./shared.js";

export function runStop(rawPayload: string): string {
  const payload = readPayload(rawPayload);
  if (payload.stop_hook_active) {
    return empty();
  }

  const cwd = cwdFromPayload(payload);
  const message = String(payload.last_assistant_message ?? payload.message ?? "");
  const markdown = extractMarkdownFromMessage(message);
  if (!markdown) {
    return empty();
  }

  const result = checkText(`${cwd}/<assistant-message>.md`, markdown, {
    explicitType: String(payload.markdown_gate_doc_type || "unknown"),
  });
  if (result.status === "fail") {
    return stopBlock(
      "markdown-gate blocked final Markdown delivery. Revise the Markdown and rerun the check.",
      renderText(result),
    );
  }
  return empty();
}
