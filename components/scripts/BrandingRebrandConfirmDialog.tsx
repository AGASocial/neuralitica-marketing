"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";

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

  const footer = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        justifyContent: "flex-end",
      }}
    >
      <Button
        type="button"
        label={copy.cancel}
        className="p-button-text"
        disabled={pending}
        onClick={onHide}
      />
      <Button
        type="button"
        label={copy.confirm}
        icon="pi pi-palette"
        disabled={pending || !assemblyJobId}
        loading={pending}
        onClick={() => void handleConfirm()}
      />
    </div>
  );

  return (
    <Dialog
      header={copy.title}
      visible={visible}
      style={{ width: "min(480px, 95vw)" }}
      onHide={onHide}
      footer={footer}
      closable={!pending}
      dismissableMask={!pending}
    >
      <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#374151" }}>
        {copy.body}
      </p>
      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}
    </Dialog>
  );
}
