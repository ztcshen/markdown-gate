import type { Nodes, Root, Text } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { decodeString } from "micromark-util-decode-string";

export interface ProseBlock {
  text: string;
  offsets: number[];
  sections: string[];
  section?: string;
}

type SectionStack = Array<[number, string]>;

export function parseMarkdown(text: string): Root {
  const extensions = gfmFromMarkdown().map((extension) =>
    // Keep syntax-token autolinks. The optional text-rewrite pass drops source
    // positions for escaped email forms; those remain ordinary literal text.
    extension.enter?.literalAutolink ? { ...extension, transforms: [] } : extension,
  );
  return fromMarkdown(text, { extensions: [gfm()], mdastExtensions: extensions });
}

export function headingText(node: Nodes): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  if (node.type === "break") return " ";
  return "children" in node ? node.children.map(headingText).join("") : "";
}

export function* iterProseBlocks(text: string): Iterable<ProseBlock> {
  function* visit(node: Nodes, stack: SectionStack): Iterable<ProseBlock> {
    if (node.type === "heading") {
      while (stack.length && (stack.at(-1)?.[0] ?? 0) >= node.depth) stack.pop();
      stack.push([node.depth, headingText(node).trim().replace(/\s+/g, " ")]);
    }
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
      yield* inlineBlocks(
        node,
        text,
        stack.map(([, title]) => title),
      );
    } else if ("children" in node) {
      // A heading in a quote, list item, or footnote cannot allow outside prose.
      const localStack = node.type === "root" ? stack : [...stack];
      for (const child of node.children) yield* visit(child, localStack);
    }
  }
  yield* visit(parseMarkdown(text), []);
}

function* inlineBlocks(node: Nodes, source: string, sections: string[]): Iterable<ProseBlock> {
  let text = "";
  let offsets: number[] = [];
  function flush(): ProseBlock | undefined {
    const block = text.trim() ? { text, offsets, sections, section: sections.at(-1) } : undefined;
    text = "";
    offsets = [];
    return block;
  }
  function append(value: string, positions: number[]): void {
    for (let index = 0; index < value.length; index += 1) {
      const char = /\s/.test(value[index]) ? " " : value[index];
      if (char === " " && text.endsWith(" ")) continue;
      text += char;
      offsets.push(positions[index]);
    }
  }
  function* visitInline(child: Nodes): Iterable<ProseBlock> {
    if (child.type === "text") {
      append(child.value, textOffsets(child, source));
    } else if (child.type === "break") {
      append(" ", [child.position?.start.offset ?? 0]);
    } else if ("children" in child && !isAutolink(child, source)) {
      for (const descendant of child.children) yield* visitInline(descendant);
    } else {
      // Omitted code/HTML/images/URLs split prose, avoiding cross-node matches.
      const block = flush();
      if (block) yield block;
    }
  }
  yield* visitInline(node);
  const block = flush();
  if (block) yield block;
}

function isAutolink(node: Nodes, source: string): boolean {
  return node.type === "link" && source[node.position?.start.offset ?? 0] !== "[";
}

function textOffsets(node: Text, source: string): number[] {
  const start = node.position?.start.offset ?? 0;
  const raw = source.slice(start, node.position?.end.offset);
  const offsets: number[] = [];
  let consumed = 0;
  // Container prefixes are absent from mdast text. Decode each source line and
  // align its suffix, keeping positions for escaped characters and entities.
  for (const line of raw.matchAll(/[^\r\n]+|\r\n|[\r\n]/g)) {
    const next = raw[line.index + line[0].length];
    const content = next === "\r" || next === "\n" ? line[0].replace(/[ \t]+$/, "") : line[0];
    const decoded = decodeWithOffsets(content, start + line.index);
    let prefix = 0;
    while (
      prefix < decoded.text.length &&
      !node.value.startsWith(decoded.text.slice(prefix), consumed)
    ) {
      prefix += 1;
    }
    for (const offset of decoded.offsets.slice(prefix)) offsets.push(offset);
    consumed += decoded.text.length - prefix;
  }
  if (consumed !== node.value.length) {
    throw new Error(`cannot map Markdown text at line ${node.position?.start.line ?? 1}`);
  }
  return offsets;
}

function decodeWithOffsets(raw: string, start: number): { text: string; offsets: number[] } {
  let text = "";
  const offsets: number[] = [];
  const tokens = /\\[!-/:-@[-`{-~]|&(?:#[xX][\da-fA-F]{1,6}|#\d{1,7}|[\da-zA-Z]+);|[\s\S]/g;
  for (const token of raw.matchAll(tokens)) {
    const value = decodeString(token[0]).replace(/\0/g, "\uFFFD");
    text += value;
    for (let index = 0; index < value.length; index += 1) {
      offsets.push(start + token.index + (value === token[0] ? index : 0));
    }
  }
  return { text, offsets };
}

export function sourceLocator(source: string): (offset: number) => [number, number] {
  const starts = [0];
  for (const match of source.matchAll(/\r\n|[\r\n]/g)) starts.push(match.index + match[0].length);
  return (offset) => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle;
    }
    return [low + 1, offset - starts[low] + 1];
  };
}
