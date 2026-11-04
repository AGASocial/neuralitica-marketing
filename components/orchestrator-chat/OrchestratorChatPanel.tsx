"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ImagePlusIcon, MessageSquareIcon, SendIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import {
  ProposalActionCard,
  type KnownProposal,
  type ProposalCardCopy,
} from "@/components/orchestrator-chat/ProposalActionCard";
import {
  ScriptPreviewCard,
  VideoPreviewCard,
  type PreviewCardCopy,
} from "@/components/orchestrator-chat/PreviewCards";
import {
  CampaignStatusCard,
  ScriptsStatusCard,
  WeeklyPlanCard,
  type StatusCardCopy,
} from "@/components/orchestrator-chat/StatusCards";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Locale } from "@/lib/i18n/locales";
import { prepareAvatarReferenceUpload } from "@/lib/media/prepare-avatar-reference-upload";
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
  proposal: ProposalCardCopy;
  status: StatusCardCopy;
  preview: PreviewCardCopy;
};

type OrchestratorChatPanelProps = {
  copy: OrchestratorChatCopy;
  locale: Locale;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asProposal(output: unknown): KnownProposal | null {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.proposal)) {
    return null;
  }
  const p = output.proposal;
  if (
    p.requiresConfirmation !== true ||
    p.mutates !== false ||
    typeof p.kind !== "string" ||
    typeof p.summary !== "string"
  ) {
    return null;
  }
  if (p.kind === "generate_strategy" && typeof p.weekStart === "string") {
    return p as KnownProposal;
  }
  if (
    p.kind === "approve_strategy" &&
    typeof p.weekStart === "string" &&
    typeof p.strategyId === "string"
  ) {
    return p as KnownProposal;
  }
  if (p.kind === "approve_pending_video" && typeof p.approvalId === "string") {
    return p as KnownProposal;
  }
  if (p.kind === "generate_scripts" && typeof p.weekStart === "string") {
    return p as KnownProposal;
  }
  if (
    p.kind === "generate_videos" &&
    typeof p.weekStart === "string" &&
    p.paidMediaRequiresCostConfirm === true
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "request_video_changes" &&
    typeof p.approvalId === "string" &&
    typeof p.changeSummary === "string" &&
    Array.isArray(p.tags)
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "regenerate_script" &&
    typeof p.weekStart === "string" &&
    typeof p.slotIndex === "number"
  ) {
    return p as KnownProposal;
  }
  if (
    p.kind === "confirm_paid_generation" &&
    typeof p.reelScriptId === "string" &&
    typeof p.confirmEstimateCents === "number" &&
    typeof p.estimatedCostCents === "number" &&
    (p.paidKind === "broll" || p.paidKind === "heygen")
  ) {
    return p as KnownProposal;
  }
  return null;
}

export function OrchestratorChatToggle({
  openLabel,
  shortcutHint,
}: {
  openLabel: string;
  shortcutHint: string;
}) {
  const { toggle, open } = useOrchestratorChat();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-expanded={open}
      aria-controls="orchestrator-chat-panel"
      className="border-edge bg-panel text-fog hover:bg-panel/80"
    >
      <MessageSquareIcon className="size-4" aria-hidden />
      <span className="hidden sm:inline">{openLabel}</span>
      <span className="sr-only">{shortcutHint}</span>
    </Button>
  );
}

export function OrchestratorChatPanel({
  copy,
  locale,
}: OrchestratorChatPanelProps) {
  const { open, setOpen } = useOrchestratorChat();
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

  const { messages, sendMessage, status, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming" || attachPending;

  function focusChangeSomething() {
    inputRef.current?.focus();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    setInput("");
    await sendMessage({ text });
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        id="orchestrator-chat-panel"
        side="right"
        showCloseButton={false}
        className="w-full border-edge bg-deep p-0 text-fog sm:max-w-md"
      >
        <SheetHeader className="border-b border-edge px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-display text-2xl text-fog">
                {copy.title}
              </SheetTitle>
              <SheetDescription className="text-dim">
                {copy.description}
              </SheetDescription>
            </div>
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
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-dim">{copy.empty}</p>
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
                    return (
                      <p key={`${message.id}-t-${index}`} className="whitespace-pre-wrap">
                        {visible}
                      </p>
                    );
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
                    (part.type === "tool-proposeGenerateStrategy" ||
                      part.type === "tool-proposeApproveStrategy" ||
                      part.type === "tool-proposeApprovePendingVideo" ||
                      part.type === "tool-proposeGenerateScripts" ||
                      part.type === "tool-proposeGenerateVideos" ||
                      part.type === "tool-proposeRequestVideoChanges" ||
                      part.type === "tool-proposeRegenerateScript" ||
                      part.type === "tool-proposeConfirmPaidGeneration") &&
                    part.state === "output-available"
                  ) {
                    const proposal = asProposal(part.output);
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

          <form
            onSubmit={onSubmit}
            className="border-t border-edge bg-deep/95 p-3"
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
                onChange={(event) => setInput(event.target.value)}
                placeholder={copy.placeholder}
                rows={2}
                disabled={busy}
                className="min-h-10 flex-1 resize-none rounded-md border border-edge bg-panel px-3 py-2 text-sm text-fog placeholder:text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butter/40"
              />
              <Button
                type="submit"
                disabled={busy || input.trim().length === 0}
                aria-label={copy.send}
                className="bg-butter text-deep hover:bg-butter/90"
              >
                <SendIcon className="size-4" />
              </Button>
            </div>
            {attachPending ? (
              <p className="mt-2 text-xs text-dim">{copy.attaching}</p>
            ) : null}
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
