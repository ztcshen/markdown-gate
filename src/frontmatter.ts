import type { Metadata } from "./model.js";

export interface FrontmatterSplit {
  metadata: Metadata;
  body: string;
}

export function splitFrontmatter(text: string): FrontmatterSplit {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { metadata: {}, body: text };
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) {
    return { metadata: {}, body: text };
  }

  const metadata: Metadata = {};
  for (const rawLine of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(rawLine);
    if (!match) {
      continue;
    }
    metadata[match[1]] = stripQuotes(match[2].trim());
  }

  return { metadata, body: lines.slice(end + 1).join("\n") };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
