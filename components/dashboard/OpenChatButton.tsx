"use client";

import { useOrchestratorChat } from "@/components/orchestrator-chat/OrchestratorChatContext";
import { Button } from "@/components/ui/button";

type OpenChatButtonProps = {
  label: string;
  className?: string;
};

export function OpenChatButton({ label, className }: OpenChatButtonProps) {
  const { setOpen } = useOrchestratorChat();
  return (
    <Button
      type="button"
      className={className ?? "mt-auto w-fit rounded-full"}
      onClick={() => setOpen(true)}
    >
      {label}
    </Button>
  );
}
