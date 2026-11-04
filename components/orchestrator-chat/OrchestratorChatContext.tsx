"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  formatChangePrefill,
  type ChangePrefill,
} from "@/lib/orchestrator-chat/format-change-prefill";
import type { Locale } from "@/lib/i18n/locales";

export type ChatAnchorContext = {
  cardId: string;
  title: string;
  locale: Locale;
};

export type PendingComposerSend = ChangePrefill;

type OrchestratorChatContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Focus the layout composer (Cmd/Ctrl+J). */
  focusComposer: () => void;
  registerComposerInput: (ref: RefObject<HTMLTextAreaElement | null>) => void;
  /** Queued send for the open chat session (visible text + optional card metadata). */
  pendingSend: PendingComposerSend | null;
  /** Visible text of the pending send (effect trigger / legacy). */
  pendingSendText: string | null;
  consumePendingSend: () => PendingComposerSend | null;
  consumePendingSendText: () => string | null;
  /** Queue text and open the conversation panel. */
  sendFromComposer: (text: string) => void;
  /** Open panel with Change… prefill for a card (UUID stays in metadata). */
  openChangeForCard: (anchor: ChatAnchorContext) => void;
  /** True once the hydrated session has reported a user message. */
  conversationHasUserMessages: boolean;
  setConversationHasUserMessages: (value: boolean) => void;
};

const OrchestratorChatContext =
  createContext<OrchestratorChatContextValue | null>(null);

export function OrchestratorChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingComposerSend | null>(
    null,
  );
  const pendingSendRef = useRef<PendingComposerSend | null>(null);
  const [conversationHasUserMessages, setConversationHasUserMessages] =
    useState(false);
  const composerRef = useRef<RefObject<HTMLTextAreaElement | null> | null>(
    null,
  );
  const focusNonce = useRef(0);
  const [, setFocusTick] = useState(0);

  const registerComposerInput = useCallback(
    (ref: RefObject<HTMLTextAreaElement | null>) => {
      composerRef.current = ref;
    },
    [],
  );

  const focusComposer = useCallback(() => {
    focusNonce.current += 1;
    setFocusTick(focusNonce.current);
    const el = composerRef.current?.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  const consumePendingSend = useCallback(() => {
    const value = pendingSendRef.current;
    pendingSendRef.current = null;
    setPendingSend(null);
    return value;
  }, []);

  const consumePendingSendText = useCallback(() => {
    return consumePendingSend()?.text ?? null;
  }, [consumePendingSend]);

  const sendFromComposer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const next: PendingComposerSend = { text: trimmed };
    pendingSendRef.current = next;
    setPendingSend(next);
    setOpen(true);
  }, []);

  const openChangeForCard = useCallback((anchor: ChatAnchorContext) => {
    const prefill = formatChangePrefill(anchor);
    pendingSendRef.current = prefill;
    setPendingSend(prefill);
    setOpen(true);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod || event.key.toLowerCase() !== "j") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable
      ) {
        if (target === composerRef.current?.current) {
          return;
        }
      }
      event.preventDefault();
      focusComposer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusComposer]);

  const pendingSendText = pendingSend?.text ?? null;

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      focusComposer,
      registerComposerInput,
      pendingSend,
      pendingSendText,
      consumePendingSend,
      consumePendingSendText,
      sendFromComposer,
      openChangeForCard,
      conversationHasUserMessages,
      setConversationHasUserMessages,
    }),
    [
      open,
      toggle,
      focusComposer,
      registerComposerInput,
      pendingSend,
      pendingSendText,
      consumePendingSend,
      consumePendingSendText,
      sendFromComposer,
      openChangeForCard,
      conversationHasUserMessages,
    ],
  );

  return (
    <OrchestratorChatContext.Provider value={value}>
      {children}
    </OrchestratorChatContext.Provider>
  );
}

export function useOrchestratorChat() {
  const ctx = useContext(OrchestratorChatContext);
  if (!ctx) {
    throw new Error("useOrchestratorChat requires OrchestratorChatProvider");
  }
  return ctx;
}
