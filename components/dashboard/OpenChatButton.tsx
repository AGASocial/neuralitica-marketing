"use client";

import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import { Button } from "@/components/ui/button";

type OpenChatButtonProps = {
  label: string;
  className?: string;
};

/**
 * Redesign: the chat entry point is the persistent bottom composer, not the
 * old side-sheet launcher. Focus the composer; only fall back to the sheet
 * when no composer is mounted.
 */
export function OpenChatButton({ label, className }: OpenChatButtonProps) {
  const { setOpen, focusComposer } = useOrchestratorChat();
  return (
    <Button
      type="button"
      className={className ?? "mt-auto w-fit rounded-full"}
      onClick={() => {
        const composer = document.querySelector<HTMLTextAreaElement>(
          "#owner-layout-composer",
        );
        if (composer) {
          composer.scrollIntoView({ block: "nearest", behavior: "smooth" });
          focusComposer();
          return;
        }
        setOpen(true);
      }}
    >
      {label}
    </Button>
  );
}
