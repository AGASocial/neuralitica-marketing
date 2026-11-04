"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AgentCard } from "@/components/agent-cards/AgentCard";
import { AssistantMarkdown } from "@/components/orchestrator-chat/AssistantMarkdown";
import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import type { OrchestratorChatCopy } from "@/components/orchestrator-chat/OrchestratorChatPanel";
import {
  ProposalActionCard,
  type KnownProposal,
} from "@/components/orchestrator-chat/ProposalActionCard";
import { useStickToBottom } from "@/components/orchestrator-chat/use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { safeParseAgentCard } from "@/lib/agent-cards";
import { trackUxEvent } from "@/lib/analytics/track-ux-event";
import type { SetupCompletionDto, SetupStepId } from "@/lib/contracts/setup-completion";
import type { Locale } from "@/lib/i18n/locales";
import {
  asProposal,
  isProposeToolType,
} from "@/lib/orchestrator-chat/as-proposal";
import { createOrchestratorConversation } from "@/lib/orchestrator-chat/actions/create-conversation";
import { loadLatestOrchestratorConversation } from "@/lib/orchestrator-chat/actions/load-latest-conversation";
import { sanitizeOrchestratorVisibleText } from "@/lib/orchestrator-chat/sanitize-visible-text";
import type { SuggestedPromptChip } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";

export type OnboardingChromeCopy = {
  skipToHoy: string;
  progressTitle: string;
  progressLabel: string;
  emptyHint: string;
  steps: Record<SetupStepId, string>;
};

type ConversationFullViewProps = {
  copy: OrchestratorChatCopy;
  locale: Locale;
  suggestedChips?: SuggestedPromptChip[];
  pageTitle: string;
  canvasTitle: string;
  onboardingMode?: boolean;
  setupCompletion?: SetupCompletionDto;
  onboardingCopy?: OnboardingChromeCopy;
};

function newConversationId(): string {
  return crypto.randomUUID();
}

function collectAgentCards(messages: UIMessage[]) {
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

function collectProposals(messages: UIMessage[]): KnownProposal[] {
  const proposals: KnownProposal[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isProposeToolType(part.type)) continue;
      if (!("state" in part) || part.state !== "output-available") continue;
      const proposal = asProposal(
        "output" in part ? (part as { output?: unknown }).output : undefined,
      );
      if (proposal) proposals.push(proposal);
    }
  }
  return proposals;
}

export function ConversationFullView({
  copy,
  locale,
  pageTitle,
  canvasTitle,
  onboardingMode = false,
  setupCompletion,
  onboardingCopy,
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

  useEffect(() => {
    if (!onboardingMode || !setupCompletion) return;
    trackUxEvent("onboarding_step", {
      step: "enter",
      percent_complete: setupCompletion.percentComplete,
      required_done: setupCompletion.requiredDone,
      required_total: setupCompletion.requiredTotal,
    });
  }, [onboardingMode, setupCompletion]);

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
      onboardingMode={onboardingMode}
      setupCompletion={setupCompletion}
      onboardingCopy={onboardingCopy}
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
  onboardingMode,
  setupCompletion,
  onboardingCopy,
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
  onboardingMode: boolean;
  setupCompletion?: SetupCompletionDto;
  onboardingCopy?: OnboardingChromeCopy;
}) {
  const firstMessageTracked = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { locale, onboardingMode },
      }),
    [locale, onboardingMode],
  );

  const { messages, sendMessage, status } = useChat({
    id: `full-${conversationId}`,
    messages: initialMessages,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const agentCards = collectAgentCards(messages);
  const proposals = collectProposals(messages);
  const actionable = onboardingMode;

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
    if (!firstMessageTracked.current && !messages.some((m) => m.role === "user")) {
      firstMessageTracked.current = true;
      trackUxEvent("chat_first_message", { source: "typed" });
    }
    stickOnSend();
    void sendMessage({ text });
  }, [
    pendingSendText,
    busy,
    consumePendingSendText,
    sendMessage,
    stickOnSend,
    messages,
  ]);

  function focusChangeSomething() {
    trackUxEvent(onboardingMode ? "onboarding_step" : "hoy_action", {
      action: "change_something",
    });
    const el = document.getElementById("owner-layout-composer");
    el?.focus();
  }

  const progressLabel =
    setupCompletion && onboardingCopy
      ? onboardingCopy.progressLabel.replace(
          "{percent}",
          String(setupCompletion.percentComplete),
        )
      : null;

  const incompleteSteps =
    setupCompletion && onboardingCopy
      ? setupCompletion.steps.filter((s) => s.required && !s.done)
      : [];

  const canvasProposals = proposals.slice(-6);
  const canvasAgentCards = actionable ? [] : agentCards;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <section className="flex min-h-[60vh] flex-col rounded-xl border border-edge bg-panel/20">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-2xl text-fog">{pageTitle}</h1>
            {onboardingMode && progressLabel ? (
              <p
                className="text-xs text-dim"
                data-testid="onboarding-progress"
              >
                {onboardingCopy?.progressTitle}: {progressLabel}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onboardingMode && onboardingCopy ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link
                  href="/dashboard?skipOnboarding=1"
                  data-testid="onboarding-skip-hoy"
                >
                  {onboardingCopy.skipToHoy}
                </Link>
              </Button>
            ) : null}
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
        </div>

        {onboardingMode && incompleteSteps.length > 0 && onboardingCopy ? (
          <ol
            className="flex gap-2 overflow-x-auto border-b border-edge px-4 py-2 text-xs text-dim md:hidden"
            data-testid="onboarding-steps-mobile"
          >
            {incompleteSteps.map((step) => (
              <li
                key={step.id}
                className="shrink-0 rounded-full border border-edge px-2 py-1"
              >
                {onboardingCopy.steps[step.id] ?? step.id}
              </li>
            ))}
          </ol>
        ) : null}

        {actionable && canvasProposals.length > 0 ? (
          <div
            className="flex gap-3 overflow-x-auto border-b border-edge px-4 py-3 md:hidden"
            data-testid="onboarding-card-carousel"
          >
            {canvasProposals.map((proposal, index) => (
              <div
                key={`m-${proposal.kind}-${index}`}
                className="w-[min(85vw,280px)] shrink-0"
              >
                <ProposalActionCard
                  proposal={proposal}
                  copy={copy.proposal}
                  previewCopy={copy.preview}
                  onChangeSomething={focusChangeSomething}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          <div ref={contentRef} className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-dim">
                {onboardingMode && onboardingCopy
                  ? onboardingCopy.emptyHint
                  : copy.empty}
              </p>
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

              const nodes: ReactNode[] = [];
              message.parts.forEach((part, index) => {
                if (part.type === "text") {
                  const text = sanitizeOrchestratorVisibleText(part.text);
                  if (!text) return;
                  nodes.push(
                    <div
                      key={`${message.id}-t-${index}`}
                      className="max-w-[95%] rounded-2xl border border-edge bg-deep/60 px-3 py-2 text-sm text-fog"
                    >
                      <AssistantMarkdown text={text} />
                    </div>,
                  );
                  return;
                }
                if (
                  actionable &&
                  isProposeToolType(part.type) &&
                  "state" in part &&
                  part.state === "output-available"
                ) {
                  const proposal = asProposal(
                    "output" in part
                      ? (part as { output?: unknown }).output
                      : undefined,
                  );
                  if (proposal) {
                    nodes.push(
                      <div
                        key={`${message.id}-p-${index}`}
                        className="max-w-[95%]"
                        data-testid="onboarding-thread-proposal"
                      >
                        <ProposalActionCard
                          proposal={proposal}
                          copy={copy.proposal}
                          previewCopy={copy.preview}
                          onChangeSomething={focusChangeSomething}
                        />
                      </div>,
                    );
                  }
                }
              });
              if (nodes.length === 0) return null;
              return (
                <div key={message.id} className="space-y-2">
                  {nodes}
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

      <aside className="hidden space-y-3 rounded-xl border border-edge bg-panel/30 p-4 md:block">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fog">{canvasTitle}</h2>
          {onboardingMode && progressLabel ? (
            <span className="text-xs text-dim">{progressLabel}</span>
          ) : null}
        </div>
        {onboardingMode && incompleteSteps.length > 0 && onboardingCopy ? (
          <ul className="space-y-1 text-xs text-dim" data-testid="onboarding-steps">
            {incompleteSteps.map((step) => (
              <li key={step.id}>
                ○ {onboardingCopy.steps[step.id] ?? step.id}
              </li>
            ))}
          </ul>
        ) : null}
        {actionable ? (
          canvasProposals.length === 0 ? (
            <p className="text-sm text-dim">{copy.description}</p>
          ) : (
            <ul className="flex list-none flex-col gap-3 p-0">
              {canvasProposals.map((proposal, index) => (
                <li key={`c-${proposal.kind}-${index}`}>
                  <ProposalActionCard
                    proposal={proposal}
                    copy={copy.proposal}
                    previewCopy={copy.preview}
                    onChangeSomething={focusChangeSomething}
                  />
                </li>
              ))}
            </ul>
          )
        ) : canvasAgentCards.length === 0 ? (
          <p className="text-sm text-dim">{copy.description}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {canvasAgentCards.map((card, index) => (
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
