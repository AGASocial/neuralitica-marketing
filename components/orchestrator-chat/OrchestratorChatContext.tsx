"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type OrchestratorChatContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const OrchestratorChatContext =
  createContext<OrchestratorChatContextValue | null>(null);

export function OrchestratorChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

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
        return;
      }
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
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
