"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Message } from "primereact/message";

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

  const footer = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
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
        icon="pi pi-refresh"
        disabled={pending || !reelScriptId}
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
