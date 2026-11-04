"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ImagePlusIcon,
  MessageSquareIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import { useStickToBottom } from "@/components/orchestrator-chat/use-stick-to-bottom";
import {
  ProposalActionCard,
  type ProposalCardCopy,
} from "@/components/orchestrator-chat/ProposalActionCard";
import {
  asProposal,
  isProposeToolType,
} from "@/lib/orchestrator-chat/as-proposal";
import { trackUxEvent } from "@/lib/analytics/track-ux-event";
import {
  DownloadReadyCard,
  type DownloadReadyCardCopy,
} from "@/components/orchestrator-chat/DownloadReadyCard";
import {
  ScriptPreviewCard,
  VideoPreviewCard,
  type PreviewCardCopy,
} from "@/components/orchestrator-chat/PreviewCards";
import { AssistantMarkdown } from "@/components/orchestrator-chat/AssistantMarkdown";
import {
  InterviewProgressCard,
  type InterviewProgressCardCopy,
} from "@/components/orchestrator-chat/InterviewProgressCard";
import {
  ProgressCard,
  type ProgressCardCopy,
} from "@/components/orchestrator-chat/ProgressCard";
import {
  CampaignStatusCard,
  ScriptsStatusCard,
  WeeklyPlanCard,
  type StatusCardCopy,
} from "@/components/orchestrator-chat/StatusCards";
import {
  SuggestedPromptChips,
  type SuggestedPromptChipsCopy,
} from "@/components/orchestrator-chat/SuggestedPromptChips";
import { AgentCard } from "@/components/agent-cards/AgentCard";
import { parseAgentCard } from "@/lib/agent-cards";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Locale } from "@/lib/i18n/locales";
import { createOrchestratorConversation } from "@/lib/orchestrator-chat/actions/create-conversation";
import { loadLatestOrchestratorConversation } from "@/lib/orchestrator-chat/actions/load-latest-conversation";
import { prepareAvatarReferenceUpload } from "@/lib/media/prepare-avatar-reference-upload";
import {
  autosizeComposerTextarea,
  shouldSendOnEnterKey,
} from "@/lib/orchestrator-chat/composer-keydown";
import { conversationHasUserMessages } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";
import type { SuggestedPromptChip } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";
import { uploadAvatarReferenceAsset } from "@/lib/media/upload-avatar-reference-asset";
import { sanitizeOrchestratorVisibleText } from "@/lib/orchestrator-chat/sanitize-visible-text";

export type OrchestratorChatCopy = {
  title: string;
  description: string;
  openLabel: string;
  openShortcutHint: string;
  closeLabel: string;
  placeholder: string;
  send: string;
  attach: string;
  attaching: string;
  empty: string;
  error: string;
  attachError: string;
  attachedNote: string;
  newMessages: string;
  newConversation: string;
  loadingConversation: string;
  suggestedPrompts: SuggestedPromptChipsCopy;
  proposal: ProposalCardCopy;
  status: StatusCardCopy;
  preview: PreviewCardCopy;
  progress: ProgressCardCopy;
  interview: InterviewProgressCardCopy;
  download: DownloadReadyCardCopy;
};

type OrchestratorChatPanelProps = {
  copy: OrchestratorChatCopy;
  locale: Locale;
  suggestedChips: SuggestedPromptChip[];
};

export function OrchestratorChatToggle({
  openLabel,
  shortcutHint,
}: {
  openLabel: string;
  shortcutHint: string;
}) {
  const { setOpen, open } = useOrchestratorChat();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      aria-expanded={open}
      aria-controls="orchestrator-chat-panel"
      className="border-edge bg-panel text-fog hover:bg-panel/80"
    >
      <MessageSquareIcon className="size-4" aria-hidden />
      <span>{openLabel}</span>
      <span className="sr-only">{shortcutHint}</span>
    </Button>
  );
}

function newConversationId(): string {
  return crypto.randomUUID();
}

export function OrchestratorChatPanel({
  copy,
  locale,
  suggestedChips,
}: OrchestratorChatPanelProps) {
  const { open, setOpen } = useOrchestratorChat();
  const [hydrated, setHydrated] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [seedMessages, setSeedMessages] = useState<UIMessage[]>([]);

  useEffect(() => {
    if (!open || hydrated) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadLatestOrchestratorConversation();
        if (cancelled) {
          return;
        }
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
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, hydrated]);

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
      // fall through to local id
    }
    setConversationId(newConversationId());
    setSeedMessages([]);
    setHydrated(true);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        id="orchestrator-chat-panel"
        side="right"
        showCloseButton={false}
        className="gap-0 overflow-hidden border-edge bg-deep p-0 text-fog h-dvh max-h-dvh w-full sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-edge px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display text-2xl text-fog">
                {copy.title}
              </SheetTitle>
              <SheetDescription className="text-dim">
                {copy.description}
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={startNewConversation}
                disabled={!hydrated}
                className="text-dim hover:text-fog"
              >
                <PlusIcon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{copy.newConversation}</span>
                <span className="sr-only sm:hidden">{copy.newConversation}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label={copy.closeLabel}
                className="text-dim hover:text-fog"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {!hydrated || !conversationId ? (
          <p className="px-4 py-4 text-sm text-dim">{copy.loadingConversation}</p>
        ) : (
          <OrchestratorChatSession
            key={conversationId}
            conversationId={conversationId}
            initialMessages={seedMessages}
            copy={copy}
            locale={locale}
            suggestedChips={suggestedChips}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrchestratorChatSession({
  conversationId,
  initialMessages,
  copy,
  locale,
  suggestedChips,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  copy: OrchestratorChatCopy;
  locale: Locale;
  suggestedChips: SuggestedPromptChip[];
}) {
  const {
    pendingSendText,
    consumePendingSendText,
    setConversationHasUserMessages,
  } = useOrchestratorChat();
  const [input, setInput] = useState("");
  const [attachPending, setAttachPending] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { locale },
      }),
    [locale],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
  });
  const busy = status === "submitted" || status === "streaming" || attachPending;
  const hasUserMessages = conversationHasUserMessages(messages);
  const showSuggested = !hasUserMessages && suggestedChips.length > 0;

  useEffect(() => {
    setConversationHasUserMessages(hasUserMessages);
  }, [hasUserMessages, setConversationHasUserMessages]);

  const contentKey = useMemo(() => {
    const last = messages[messages.length - 1];
    const partsSig = last
      ? last.parts
          .map((part) =>
            part.type === "text"
              ? `t:${part.text.length}`
              : `${part.type}:${"state" in part ? String(part.state) : ""}`,
          )
          .join("|")
      : "";
    return `${messages.length}:${partsSig}:${status}`;
  }, [messages, status]);

  const {
    scrollRef,
    contentRef,
    isStuck,
    onScroll,
    scrollToBottom,
    stickOnSend,
  } = useStickToBottom({ contentKey });

  useEffect(() => {
    if (!pendingSendText || busy) {
      return;
    }
    const text = consumePendingSendText();
    if (!text) {
      return;
    }
    stickOnSend();
    void sendMessage({ text });
  }, [
    pendingSendText,
    busy,
    consumePendingSendText,
    sendMessage,
    stickOnSend,
  ]);

  function focusChangeSomething() {
    inputRef.current?.focus();
  }

  function trackFirstMessage(
    source: "chip" | "typed",
    chipId?: string,
  ) {
    if (hasUserMessages) return;
    trackUxEvent("chat_first_message", {
      source,
      ...(chipId ? { chip_id: chipId } : {}),
    });
  }

  async function sendCurrentInput() {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    trackFirstMessage("typed");
    setInput("");
    requestAnimationFrame(() => autosizeComposerTextarea(inputRef.current));
    stickOnSend();
    await sendMessage({ text });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await sendCurrentInput();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !shouldSendOnEnterKey(event, {
        busy,
        hasText: input.trim().length > 0,
      })
    ) {
      return;
    }
    event.preventDefault();
    void sendCurrentInput();
  }

  async function onPickFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setAttachError(null);
    setAttachPending(true);
    try {
      const prepared = await prepareAvatarReferenceUpload(file);
      const formData = new FormData();
      formData.set("file", prepared);
      const result = await uploadAvatarReferenceAsset(formData);
      if (!result.ok) {
        setAttachError(copy.attachError);
        return;
      }
      const note = copy.attachedNote
        .replace("{filename}", result.asset.metadata.originalFilename)
        .replace("{assetId}", result.asset.id);
      stickOnSend();
      await sendMessage({ text: note });
    } catch {
      setAttachError(copy.attachError);
    } finally {
      setAttachPending(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              <div ref={contentRef} className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-dim">{copy.empty}</p>
            ) : null}
            {showSuggested ? (
              <SuggestedPromptChips
                chips={suggestedChips}
                copy={copy.suggestedPrompts}
                disabled={busy}
                onSelect={(chip) => {
                  trackFirstMessage("chip", chip.id);
                  stickOnSend();
                  void sendMessage({ text: chip.text });
                }}
              />
            ) : null}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-6 rounded-lg bg-panel/80 px-3 py-2 text-sm text-fog"
                    : "mr-2 space-y-2 text-sm text-fog"
                }
              >
                {message.parts.map((part, index) => {
                  // Never render model reasoning / CoT parts
                  if (part.type === "reasoning") {
                    return null;
                  }

                  if (part.type === "text") {
                    const visible =
                      message.role === "assistant"
                        ? sanitizeOrchestratorVisibleText(part.text)
                        : part.text;
                    if (!visible) {
                      return null;
                    }
                    if (message.role === "assistant") {
                      return (
                        <AssistantMarkdown
                          key={`${message.id}-t-${index}`}
                          text={visible}
                        />
                      );
                    }
                    return (
                      <p key={`${message.id}-t-${index}`} className="whitespace-pre-wrap">
                        {visible}
                      </p>
                    );
                  }

                  if (
                    part.type === "tool-suggestNextActions" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      actions?: Array<{ id: string; text: string }>;
                    };
                    if (output?.ok && Array.isArray(output.actions) && output.actions.length > 0) {
                      const chipCard = parseAgentCard({
                        type: "next_step_chips",
                        props: {
                          chips: output.actions.map((action) => ({
                            id: action.id,
                            text: action.text,
                          })),
                          ariaLabel: copy.suggestedPrompts.listAriaLabel,
                        },
                        actions: [],
                      });
                      return (
                        <AgentCard
                          key={`${message.id}-sna-${index}`}
                          card={chipCard}
                          disabled={busy}
                          onAction={(event) => {
                            const text =
                              typeof event.meta?.text === "string"
                                ? event.meta.text
                                : null;
                            if (!text) {
                              return;
                            }
                            trackFirstMessage("chip", event.id);
                            stickOnSend();
                            void sendMessage({ text });
                          }}
                        />
                      );
                    }
                  }

                  if (part.type === "tool-listCampaignStatus" && part.state === "output-available") {
                    const output = part.output as { ok?: boolean };
                    if (output?.ok) {
                      return (
                        <CampaignStatusCard
                          key={`${message.id}-cs-${index}`}
                          output={part.output as never}
                          copy={copy.status}
                        />
                      );
                    }
                  }

                  if (part.type === "tool-getWeeklyStrategy" && part.state === "output-available") {
                    const output = part.output as { ok?: boolean };
                    if (output?.ok) {
                      return (
                        <WeeklyPlanCard
                          key={`${message.id}-ws-${index}`}
                          output={part.output as never}
                          copy={copy.status}
                        />
                      );
                    }
                  }

                  if (part.type === "tool-getScriptsStatus" && part.state === "output-available") {
                    const output = part.output as { ok?: boolean };
                    if (output?.ok) {
                      return (
                        <ScriptsStatusCard
                          key={`${message.id}-ss-${index}`}
                          output={part.output as never}
                          copy={copy.status}
                        />
                      );
                    }
                  }

                  if (
                    part.type === "tool-getVideoPreview" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      videoPreviewUrl?: string;
                      coverPreviewUrl?: string;
                      captionBody?: string;
                    };
                    if (output?.ok && output.videoPreviewUrl) {
                      return (
                        <VideoPreviewCard
                          key={`${message.id}-vp-${index}`}
                          videoPreviewUrl={output.videoPreviewUrl}
                          coverPreviewUrl={output.coverPreviewUrl}
                          captionBody={output.captionBody}
                          copy={copy.preview}
                          onChangeSomething={focusChangeSomething}
                        />
                      );
                    }
                  }

                  if (
                    part.type === "tool-getScriptPreview" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      tema?: string;
                      status?: "pending" | "generated";
                      hook?: string;
                      body?: string;
                      cta?: string;
                    };
                    if (output?.ok && output.tema && output.status) {
                      return (
                        <ScriptPreviewCard
                          key={`${message.id}-sp-${index}`}
                          tema={output.tema}
                          status={output.status}
                          hook={output.hook}
                          body={output.body}
                          cta={output.cta}
                          copy={copy.preview}
                          onChangeSomething={focusChangeSomething}
                        />
                      );
                    }
                  }

                  if (
                    part.type === "tool-getPresenterSetupStatus" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      nextHint?: string;
                      consentActive?: boolean;
                      hasPresenterConfig?: boolean;
                    };
                    if (output?.ok && output.nextHint) {
                      return (
                        <p
                          key={`${message.id}-ps-${index}`}
                          className="rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-fog"
                        >
                          {output.nextHint}
                        </p>
                      );
                    }
                  }

                  if (
                    part.type === "tool-getInterviewStatus" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      progressLabel?: string;
                      stepLabel?: string;
                      question?: string;
                      helper?: string;
                      status?: "not_started" | "in_progress" | "completed";
                      canSubmit?: boolean;
                      answerKind?: "list" | "text";
                    };
                    if (
                      output?.ok &&
                      output.progressLabel &&
                      output.stepLabel &&
                      output.question &&
                      output.helper &&
                      output.status &&
                      output.answerKind != null &&
                      typeof output.canSubmit === "boolean"
                    ) {
                      return (
                        <InterviewProgressCard
                          key={`${message.id}-iv-${index}`}
                          progressLabel={output.progressLabel}
                          stepLabel={output.stepLabel}
                          question={output.question}
                          helper={output.helper}
                          status={output.status}
                          canSubmit={output.canSubmit}
                          answerKind={output.answerKind}
                          copy={copy.interview}
                        />
                      );
                    }
                  }

                  if (
                    part.type === "tool-getGuidedProgress" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      steps?: Array<{
                        key: string;
                        status: "todo" | "current" | "done";
                      }>;
                      nextStepHint?: string;
                      interviewHref?: string;
                      nextStepKey?: string;
                    };
                    if (
                      output?.ok &&
                      output.steps &&
                      output.nextStepHint &&
                      output.interviewHref &&
                      output.nextStepKey
                    ) {
                      return (
                        <ProgressCard
                          key={`${message.id}-gp-${index}`}
                          steps={output.steps}
                          nextStepHint={output.nextStepHint}
                          interviewHref={output.interviewHref}
                          nextStepKey={output.nextStepKey}
                          copy={copy.progress}
                        />
                      );
                    }
                  }

                  if (
                    part.type === "tool-getReadyVideoDownload" &&
                    part.state === "output-available"
                  ) {
                    const output = part.output as {
                      ok?: boolean;
                      videoPreviewUrl?: string;
                      downloadUrl?: string;
                      coverPreviewUrl?: string;
                      captionBody?: string;
                      readyToPublishHref?: string;
                    };
                    if (
                      output?.ok &&
                      output.videoPreviewUrl &&
                      output.downloadUrl &&
                      output.readyToPublishHref
                    ) {
                      return (
                        <DownloadReadyCard
                          key={`${message.id}-dl-${index}`}
                          videoPreviewUrl={output.videoPreviewUrl}
                          downloadUrl={output.downloadUrl}
                          coverPreviewUrl={output.coverPreviewUrl}
                          captionBody={output.captionBody}
                          readyToPublishHref={output.readyToPublishHref}
                          copy={copy.download}
                        />
                      );
                    }
                  }

                  if (isProposeToolType(part.type)) {
                    const toolPart = part as {
                      state?: string;
                      output?: unknown;
                    };
                    if (toolPart.state === "output-available") {
                      const proposal = asProposal(toolPart.output);
                      if (proposal) {
                        return (
                          <ProposalActionCard
                            key={`${message.id}-p-${index}`}
                            proposal={proposal}
                            copy={copy.proposal}
                            previewCopy={copy.preview}
                            onChangeSomething={focusChangeSomething}
                          />
                        );
                      }
                    }
                  }

                  if (
                    typeof part.type === "string" &&
                    part.type.startsWith("tool-") &&
                    "state" in part &&
                    part.state === "input-available"
                  ) {
                    return (
                      <p key={`${message.id}-loading-${index}`} className="text-dim">
                        …
                      </p>
                    );
                  }

                  return null;
                })}
              </div>
            ))}
            {error ? <p className="text-sm text-rose">{copy.error}</p> : null}
            {attachError ? (
              <p className="text-sm text-rose">{attachError}</p>
            ) : null}
              </div>
            </div>
            {!isStuck ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="pointer-events-auto border-edge bg-panel/95 text-fog shadow-sm backdrop-blur-sm"
                  onClick={() => scrollToBottom()}
                >
                  {copy.newMessages}
                </Button>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={onSubmit}
            className="shrink-0 border-t border-edge bg-deep/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                className="sr-only"
                onChange={(event) => void onPickFile(event.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={busy}
                aria-label={copy.attach}
                className="border-edge bg-panel"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlusIcon className="size-4" />
              </Button>
              <label className="sr-only" htmlFor="orchestrator-chat-input">
                {copy.placeholder}
              </label>
              <textarea
                ref={inputRef}
                id="orchestrator-chat-input"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  autosizeComposerTextarea(event.currentTarget);
                }}
                onKeyDown={onComposerKeyDown}
                placeholder={copy.placeholder}
                rows={1}
                disabled={busy}
                className="max-h-40 min-h-10 flex-1 resize-none overflow-y-auto rounded-md border border-edge bg-panel px-3 py-2 text-sm text-fog placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butter/40"
              />
              <Button
                type="submit"
                disabled={busy || input.trim().length === 0}
                aria-label={copy.send}
                className="shrink-0 bg-butter text-deep hover:bg-butter/90"
              >
                <SendIcon className="size-4" />
              </Button>
            </div>
            {attachPending ? (
              <p className="mt-2 text-xs text-dim">{copy.attaching}</p>
            ) : null}
          </form>
        </div>
  );
}
