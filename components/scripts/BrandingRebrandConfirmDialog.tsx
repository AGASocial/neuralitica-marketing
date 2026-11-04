"use client";

import { useEffect, useState } from "react";
import { PaletteIcon } from "lucide-react";

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
  ApplyBrandingForAssemblySuccess,
  BrandingJobErrorCode,
} from "@/lib/contracts/branding-job";
import { applyBrandingForAssembly } from "@/lib/assembly/actions/apply-branding-for-assembly";

export type BrandingRebrandConfirmCopy = {
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
    baseIncomplete: string;
    subtitleSanitize: string;
    coverFrameInvalid: string;
    internal: string;
  };
};

type BrandingRebrandConfirmDialogProps = {
  visible: boolean;
  assemblyJobId: string | null;
  subtitlesEnabled: boolean;
  logoEnabled: boolean;
  coverFrameSec: number;
  copy: BrandingRebrandConfirmCopy;
  pending: boolean;
  onHide: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: (result: ApplyBrandingForAssemblySuccess) => void;
  onError: (message: string) => void;
};

function hasCoverFrameInvalidField(
  fields: Record<string, string[]> | undefined,
): boolean {
  return (
    fields?.coverFrameSec?.some(
      (message) =>
        message === "scripts.branding.coverFrame.invalid" ||
        message.includes("coverFrame"),
    ) === true
  );
}

function messageForBrandingError(
  code: BrandingJobErrorCode,
  messageKey: string | undefined,
  copy: BrandingRebrandConfirmCopy,
  fields?: Record<string, string[]>,
): string {
  if (messageKey === "scripts.branding.failure.subtitleSanitize") {
    return copy.errors.subtitleSanitize;
  }

  if (code === "VALIDATION_ERROR" && hasCoverFrameInvalidField(fields)) {
    return copy.errors.coverFrameInvalid;
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
    case "BRANDING_BASE_INCOMPLETE":
      return copy.errors.baseIncomplete;
    case "SUBTITLE_SANITIZE_FAILED":
      return copy.errors.subtitleSanitize;
    default:
      return copy.errors.internal;
  }
}

export function BrandingRebrandConfirmDialog({
  visible,
  assemblyJobId,
  subtitlesEnabled,
  logoEnabled,
  coverFrameSec,
  copy,
  pending,
  onHide,
  onPendingChange,
  onSuccess,
  onError,
}: BrandingRebrandConfirmDialogProps) {
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setBanner(null);
    }
  }, [visible]);

  async function handleConfirm() {
    if (!assemblyJobId || pending) {
      return;
    }

    onPendingChange(true);
    setBanner(null);

    try {
      const result = await applyBrandingForAssembly({
        assemblyJobId,
        subtitlesEnabled,
        logoEnabled,
        coverFrameSec,
      });

      if (result.ok) {
        onSuccess(result);
        onHide();
        return;
      }

      const message = messageForBrandingError(
        result.error.code,
        result.error.messageKey,
        copy,
        result.error.fields,
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
            disabled={pending || !assemblyJobId}
            onClick={() => void handleConfirm()}
          >
            {pending ? <Spinner className="size-4 text-current" /> : <PaletteIcon />}
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
