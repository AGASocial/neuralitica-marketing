"use client";

import {
  parseAssistantMarkdown,
  type MarkdownInline,
} from "@/lib/orchestrator-chat/render-assistant-markdown";

/**
 * Lightweight Markdown for assistant chat text (bold / italic / code / lists).
 * Avoids a full markdown dependency; keeps owner replies readable when the
 * model emits **bold** markers.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const blocks = parseAssistantMarkdown(text);
  return (
    <div className="space-y-2 text-sm text-fog">
      {blocks.map((block, blockIndex) => {
        if (block.type === "list") {
          return (
            <ul
              key={`b-${blockIndex}`}
              className="list-disc space-y-1 pl-5 text-fog"
            >
              {block.items.map((item, i) => (
                <li key={`l-${blockIndex}-${i}`}>{renderInlines(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`b-${blockIndex}`} className="whitespace-pre-wrap">
            {block.lines.map((line, i) => (
              <span key={`s-${blockIndex}-${i}`}>
                {i > 0 ? <br /> : null}
                {renderInlines(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function renderInlines(nodes: MarkdownInline[]) {
  return nodes.map((node, i) => {
    if (node.type === "strong") {
      return (
        <strong key={i} className="font-semibold text-fog">
          {node.value}
        </strong>
      );
    }
    if (node.type === "em") {
      return (
        <em key={i} className="italic">
          {node.value}
        </em>
      );
    }
    if (node.type === "code") {
      return (
        <code
          key={i}
          className="rounded bg-panel/80 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {node.value}
        </code>
      );
    }
    return <span key={i}>{node.value}</span>;
  });
}
