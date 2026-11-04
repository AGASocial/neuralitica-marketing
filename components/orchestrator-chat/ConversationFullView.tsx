"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AgentCard } from "@/components/agent-cards/AgentCard";
import { AssistantMarkdown } from "@/components/orchestrator-chat/AssistantMarkdown";
import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import type { OrchestratorChatCopy } from "@/components/orchestrator-chat/OrchestratorChatPanel";
import { useStickToBottom } from "@/components/orchestrator-chat/use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { safeParseAgentCard } from "@/lib/agent-cards";
import { createOrchestratorConversation } from "@/lib/orchestrator-chat/actions/create-conversation";
import { loadLatestOrchestratorConversation } from "@/lib/orchestrator-chat/actions/load-latest-conversation";
import { sanitizeOrchestratorVisibleText } from "@/lib/orchestrator-chat/sanitize-visible-text";
import type { Locale } from "@/lib/i18n/locales";
import type { SuggestedPromptChip } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";

type ConversationFullViewProps = {
  copy: OrchestratorChatCopy;
  locale: Locale;
  suggestedChips?: SuggestedPromptChip[];
  pageTitle: string;
  canvasTitle: string;
};

function newConversationId(): string {
  return crypto.randomUUID();
}

function collectCards(messages: UIMessage[]) {
  const cards = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
        continue;
      }
      const output =
        "output" in part ? (part as { output?: unknown }).output : undefined;
      if (!output || typeof output !== "object") continue;
      const record = output as Record<string, unknown>;
      if (record.ok === true && record.card) {
        const parsed = safeParseAgentCard(record.card);
        if (parsed.success) cards.push(parsed.data);
      }
    }
  }
  return cards;
}

export function ConversationFullView({
  copy,
  locale,
  pageTitle,
  canvasTitle,
}: ConversationFullViewProps) {
  const {
    pendingSendText,
    consumePendingSendText,
    setConversationHasUserMessages,
  } = useOrchestratorChat();
  const [hydrated, setHydrated] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [seedMessages, setSeedMessages] = useState<UIMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadLatestOrchestratorConversation();
        if (cancelled) return;
        if (result.ok && result.conversation) {
          setConversationId(result.conversation.id);
          setSeedMessages(
            result.messages.map((message) => ({
              id: message.id,
              role: message.role,
              parts: message.parts as UIMessage["parts"],
            })),
          );
        } else {
          setConversationId(newConversationId());
          setSeedMessages([]);
        }
      } catch {
        if (!cancelled) {
          setConversationId(newConversationId());
          setSeedMessages([]);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startNewConversation() {
    try {
      const result = await createOrchestratorConversation();
      if (result.ok && result.conversation) {
        setConversationId(result.conversation.id);
        setSeedMessages([]);
        setHydrated(true);
        return;
      }
    } catch {
      // fall through
    }
    setConversationId(newConversationId());
    setSeedMessages([]);
    setHydrated(true);
  }

  if (!hydrated || !conversationId) {
    return (
      <p className="text-sm text-dim">{copy.loadingConversation}</p>
    );
  }

  return (
    <ConversationBody
      key={conversationId}
      conversationId={conversationId}
      initialMessages={seedMessages}
      copy={copy}
      locale={locale}
      pageTitle={pageTitle}
      canvasTitle={canvasTitle}
      onNew={startNewConversation}
      pendingSendText={pendingSendText}
      consumePendingSendText={consumePendingSendText}
      setConversationHasUserMessages={setConversationHasUserMessages}
    />
  );
}

function ConversationBody({
  conversationId,
  initialMessages,
  copy,
  locale,
  pageTitle,
  canvasTitle,
  onNew,
  pendingSendText,
  consumePendingSendText,
  setConversationHasUserMessages,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  copy: OrchestratorChatCopy;
  locale: Locale;
  pageTitle: string;
  canvasTitle: string;
  onNew: () => void;
  pendingSendText: string | null;
  consumePendingSendText: () => string | null;
  setConversationHasUserMessages: (v: boolean) => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { locale },
      }),
    [locale],
  );

  const { messages, sendMessage, status } = useChat({
    id: `full-${conversationId}`,
    messages: initialMessages,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const cards = collectCards(messages);

  useEffect(() => {
    const hasUser = messages.some((m) => m.role === "user");
    setConversationHasUserMessages(hasUser);
  }, [messages, setConversationHasUserMessages]);

  const contentKey = `${messages.length}:${status}`;
  const { scrollRef, contentRef, isStuck, onScroll, scrollToBottom, stickOnSend } =
    useStickToBottom({ contentKey });

  useEffect(() => {
    if (!pendingSendText || busy) return;
    const text = consumePendingSendText();
    if (!text) return;
    stickOnSend();
    void sendMessage({ text });
  }, [
    pendingSendText,
    busy,
    consumePendingSendText,
    sendMessage,
    stickOnSend,
  ]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <section className="flex min-h-[60vh] flex-col rounded-xl border border-edge bg-panel/20">
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h1 className="font-display text-2xl text-fog">{pageTitle}</h1>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNew}
            className="text-dim hover:text-fog"
          >
            <PlusIcon className="size-4" aria-hidden />
            {copy.newConversation}
          </Button>
        </div>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          <div ref={contentRef} className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-dim">{copy.empty}</p>
            ) : null}
            {messages.map((message) => {
              if (message.role === "user") {
                const text = message.parts
                  .filter((p) => p.type === "text")
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("\n");
                return (
                  <div
                    key={message.id}
                    className="ml-auto max-w-[90%] rounded-2xl bg-butter/20 px-3 py-2 text-sm text-fog"
                  >
                    {text}
                  </div>
                );
              }
              const textParts = message.parts
                .filter((p) => p.type === "text")
                .map((p) =>
                  p.type === "text"
                    ? sanitizeOrchestratorVisibleText(p.text)
                    : "",
                )
                .filter(Boolean);
              if (textParts.length === 0) return null;
              return (
                <div
                  key={message.id}
                  className="max-w-[95%] rounded-2xl border border-edge bg-deep/60 px-3 py-2 text-sm text-fog"
                >
                  <AssistantMarkdown text={textParts.join("\n\n")} />
                </div>
              );
            })}
          </div>
        </div>
        {!isStuck ? (
          <div className="border-t border-edge px-4 py-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => scrollToBottom()}
            >
              {copy.newMessages}
            </Button>
          </div>
        ) : null}
      </section>

      <aside className="space-y-3 rounded-xl border border-edge bg-panel/30 p-4">
        <h2 className="text-sm font-semibold text-fog">{canvasTitle}</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-dim">{copy.description}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {cards.map((card, index) => (
              <li key={`${card.type}-${index}`}>
                <AgentCard card={card} hideActions />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
