"use client";

import { useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

import type {
  AssemblyJobErrorCode,
  AssembleReelForScriptSuccess,
} from "@/lib/contracts/assembly-job";
import { assembleReelForScript } from "@/lib/assembly/actions/assemble-reel-for-script";

export type AssemblyReassembleConfirmCopy = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    inputsIncomplete: string;
    facelessNoPrimary: string;
    facelessWaitingForClips: string;
    facelessMissingVoiceover: string;
    missingAudio: string;
    internal: string;
  };
};

type AssemblyReassembleConfirmDialogProps = {
  visible: boolean;
  reelScriptId: string | null;
  copy: AssemblyReassembleConfirmCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (result: AssembleReelForScriptSuccess) => void;
  onError: (message: string) => void;
};

function messageForAssemblyError(
  code: AssemblyJobErrorCode,
  messageKey: string | undefined,
  copy: AssemblyReassembleConfirmCopy,
): string {
  if (messageKey === "scripts.assembly.errors.facelessNoPrimary") {
    return copy.errors.facelessNoPrimary;
  }
  if (messageKey === "scripts.assembly.errors.facelessWaitingForClips") {
    return copy.errors.facelessWaitingForClips;
  }
  if (messageKey === "scripts.assembly.errors.facelessMissingVoiceover") {
    return copy.errors.facelessMissingVoiceover;
  }
  if (messageKey === "scripts.assembly.errors.missingAudio") {
    return copy.errors.missingAudio;
  }
  if (messageKey === "scripts.assembly.errors.inputsIncomplete") {
    return copy.errors.inputsIncomplete;
  }

  switch (code) {
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "ASSEMBLY_INPUTS_INCOMPLETE":
      return copy.errors.inputsIncomplete;
    default:
      return copy.errors.internal;
  }
}

export function AssemblyReassembleConfirmDialog({
  visible,
  reelScriptId,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onError,
}: AssemblyReassembleConfirmDialogProps) {
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setBanner(null);
    }
  }, [visible]);

  async function handleConfirm() {
    if (!reelScriptId || pending) {
      return;
    }

    onPendingChange(true);
    setBanner(null);

    try {
      const result = await assembleReelForScript({ reelScriptId });

      if (result.ok) {
        onSuccess(result);
        onHide();
        return;
      }

      const message = messageForAssemblyError(
        result.error.code,
        result.error.messageKey,
        copy,
      );
      setBanner(message);
      onError(message);
    } catch {
      const message = copy.errors.internal;
      setBanner(message);
      onError(message);
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <Dialog
      open={visible}
      onOpenChange={(open) => {
        if (!open && !pending) {
          onHide();
        }
      }}
    >
      <DialogContent
        className="w-[min(480px,95vw)] border-edge bg-panel text-fog sm:max-w-[480px]"
        showCloseButton={!pending}
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{copy.title}</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm text-fog">{copy.body}</p>
        {banner ? <StatusAlert severity="error" text={banner} className="w-full" /> : null}
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={pending} onClick={onHide}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            disabled={pending || !reelScriptId}
            onClick={() => void handleConfirm()}
          >
            {pending ? <Spinner className="size-4 text-current" /> : <RefreshCwIcon />}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
