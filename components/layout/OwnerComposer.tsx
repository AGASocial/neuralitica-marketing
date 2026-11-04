"use client";

import { MicIcon, SendIcon, SparklesIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import {
  SuggestedPromptChips,
  type SuggestedPromptChipsCopy,
} from "@/components/orchestrator-chat/SuggestedPromptChips";
import { Button } from "@/components/ui/button";
import { trackUxEvent } from "@/lib/analytics/track-ux-event";
import {
  autosizeComposerTextarea,
  shouldSendOnEnterKey,
} from "@/lib/orchestrator-chat/composer-keydown";
import type { SuggestedPromptChip } from "@/lib/orchestrator-chat/select-suggested-prompt-chips";
import { cn } from "@/lib/utils";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type OwnerComposerCopy = {
  placeholder: string;
  send: string;
  micLabel: string;
  micListening: string;
  suggestedPrompts: SuggestedPromptChipsCopy;
};

type OwnerComposerProps = {
  copy: OwnerComposerCopy;
  suggestedChips: SuggestedPromptChip[];
  locale: "en" | "es";
  /** Extra bottom padding when tab bar is present (mobile). */
  className?: string;
  prominent?: boolean;
};

export function OwnerComposer({
  copy,
  suggestedChips,
  locale,
  className,
  prominent = false,
}: OwnerComposerProps) {
  const {
    sendFromComposer,
    registerComposerInput,
    conversationHasUserMessages,
  } = useOrchestratorChat();
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    registerComposerInput(inputRef);
  }, [registerComposerInput]);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() != null);
  }, []);

  useEffect(() => {
    autosizeComposerTextarea(inputRef.current, prominent ? 120 : 96);
  }, [input, prominent]);

  const showChips = !conversationHasUserMessages && suggestedChips.length > 0;

  function submitText(
    text: string,
    source: "chip" | "typed" = "typed",
    chipId?: string,
  ) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (!conversationHasUserMessages) {
      trackUxEvent("chat_first_message", {
        source,
        ...(chipId ? { chip_id: chipId } : {}),
      });
    }
    setInput("");
    sendFromComposer(trimmed);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submitText(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !shouldSendOnEnterKey(event, {
        busy: false,
        hasText: input.trim().length > 0,
      })
    ) {
      return;
    }
    event.preventDefault();
    submitText(input);
  }

  function toggleMic() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = locale === "es" ? "es-MX" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const first = event.results[0]?.[0]?.transcript;
      if (typeof first === "string" && first.trim()) {
        setInput((prev) => {
          const next = prev.trim() ? `${prev.trim()} ${first.trim()}` : first.trim();
          return next;
        });
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <div
      className={cn(
        "border-t border-edge bg-deep/95 backdrop-blur-sm",
        className,
      )}
    >
      <div className={cn("mx-auto w-full space-y-2 px-4 py-3", prominent ? "max-w-3xl" : "max-w-4xl")}>
        {showChips ? (
          <SuggestedPromptChips
            chips={suggestedChips}
            copy={copy.suggestedPrompts}
            onSelect={(chip) => submitText(chip.text, "chip", chip.id)}
          />
        ) : null}
        <form
          onSubmit={onSubmit}
          className={cn(
            "flex items-end gap-2 rounded-xl border border-butter/70 bg-panel/80 px-3 py-2",
            prominent && "py-3",
          )}
        >
          <SparklesIcon
            className="mb-2 size-4 shrink-0 text-butter"
            aria-hidden
          />
          <textarea
            ref={inputRef}
            id="owner-layout-composer"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            className="max-h-28 min-h-11 flex-1 resize-none bg-transparent text-sm text-fog placeholder:text-dim focus-visible:outline-none"
            aria-label={copy.placeholder}
          />
          {speechSupported ? (
            <Button
              type="button"
              size="icon"
              variant={listening ? "default" : "ghost"}
              onClick={toggleMic}
              aria-label={listening ? copy.micListening : copy.micLabel}
              aria-pressed={listening}
              className={
                listening
                  ? "bg-butter text-deep hover:bg-butter/90"
                  : "text-dim hover:text-fog"
              }
            >
              <MicIcon className="size-4" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            aria-label={copy.send}
            className="bg-butter text-deep hover:bg-butter/90 disabled:opacity-40"
          >
            <SendIcon className="size-4" aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}
