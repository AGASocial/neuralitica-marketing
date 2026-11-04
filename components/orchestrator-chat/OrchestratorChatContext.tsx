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

export type ChatAnchorContext = {
  cardId: string;
  title: string;
};

type OrchestratorChatContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Focus the layout composer (Cmd/Ctrl+J). */
  focusComposer: () => void;
  registerComposerInput: (ref: RefObject<HTMLTextAreaElement | null>) => void;
  /** Text queued for the open chat session to send. */
  pendingSendText: string | null;
  consumePendingSendText: () => string | null;
  /** Queue text and open the conversation panel. */
  sendFromComposer: (text: string) => void;
  /** Open panel with Change… prefill for a card. */
  openChangeForCard: (anchor: ChatAnchorContext) => void;
  /** True once the hydrated session has reported a user message. */
  conversationHasUserMessages: boolean;
  setConversationHasUserMessages: (value: boolean) => void;
};

const OrchestratorChatContext =
  createContext<OrchestratorChatContextValue | null>(null);

export function OrchestratorChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingSendText, setPendingSendText] = useState<string | null>(null);
  const pendingSendRef = useRef<string | null>(null);
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

  const consumePendingSendText = useCallback(() => {
    const text = pendingSendRef.current;
    pendingSendRef.current = null;
    setPendingSendText(null);
    return text;
  }, []);

  const sendFromComposer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    pendingSendRef.current = trimmed;
    setPendingSendText(trimmed);
    setOpen(true);
  }, []);

  const openChangeForCard = useCallback((anchor: ChatAnchorContext) => {
    const prompt =
      anchor.title.trim().length > 0
        ? `Cambiar: ${anchor.title} (card:${anchor.cardId})`
        : `Cambiar (card:${anchor.cardId})`;
    pendingSendRef.current = prompt;
    setPendingSendText(prompt);
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
        // Still allow focusing layout composer when already in a non-layout field
        // only if the target is NOT the layout composer itself — skip then.
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

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      focusComposer,
      registerComposerInput,
      pendingSendText,
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
      pendingSendText,
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
