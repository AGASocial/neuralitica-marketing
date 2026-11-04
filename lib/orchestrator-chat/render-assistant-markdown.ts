/**
 * Pure helpers for lightweight assistant Markdown (bold / italic / code / lists).
 */

export type MarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "code"; value: string };

export type MarkdownBlock =
  | { type: "paragraph"; lines: MarkdownInline[][] }
  | { type: "list"; items: MarkdownInline[][] };

export function parseAssistantMarkdown(text: string): MarkdownBlock[] {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const isList =
      lines.every(
        (line) =>
          line.trim() === "" ||
          /^[-*]\s+/.test(line.trim()) ||
          /^\d+\.\s+/.test(line.trim()),
      ) &&
      lines.some((line) => /^[-*]\s+|^\d+\.\s+/.test(line.trim()));
    if (isList) {
      return {
        type: "list" as const,
        items: lines
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) =>
            parseInline(
              line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""),
            ),
          ),
      };
    }
    return {
      type: "paragraph" as const,
      lines: lines.map((line) => parseInline(line)),
    };
  });
}

export function parseInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) != null) {
    if (match.index > last) {
      nodes.push({ type: "text", value: text.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push({ type: "strong", value: token.slice(2, -2) });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push({ type: "em", value: token.slice(1, -1) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push({ type: "code", value: token.slice(1, -1) });
    } else {
      nodes.push({ type: "text", value: token });
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push({ type: "text", value: text.slice(last) });
  }
  return nodes;
}
