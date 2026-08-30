"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

import type {
  SynthesizeVoiceoverForReelScriptSuccess,
  TtsVoiceoverErrorCode,
  VoiceoverSummaryDto,
} from "@/lib/contracts/tts-voiceover";
import type { TtsVoiceId } from "@/lib/contracts/visual-preferences";
import { synthesizeVoiceoverForReelScript } from "@/lib/tts/actions/synthesize-voiceover-for-reel-script";

export type OperatorVoiceoverCopy = {
  title: string;
  aiOnlyNote: string;
  status: {
    missing: string;
    ready: string;
  };
  generate: string;
  regenerate: string;
  generating: string;
  assetIdLabel: string;
  voiceLabel: string;
  voiceNames: Record<TtsVoiceId, string>;
  toastSuccess: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    emptyVoiceoverText: string;
    budgetExceeded: string;
    costPolicyUnavailable: string;
    providerUnavailable: string;
    internal: string;
  };
};

type OperatorVoiceoverPanelProps = {
  reelScriptId: string;
  summary: VoiceoverSummaryDto | null | undefined;
  copy: OperatorVoiceoverCopy;
  disabled: boolean;
  onSuccess: (result: SynthesizeVoiceoverForReelScriptSuccess) => void;
  onError: (message: string) => void;
  onToastSuccess: (summary: string) => void;
};

function messageForVoiceoverError(
  code: TtsVoiceoverErrorCode,
  messageKey: string | undefined,
  copy: OperatorVoiceoverCopy,
): string {
  if (messageKey === "scripts.voiceover.error.budgetExceeded") {
    return copy.errors.budgetExceeded;
  }
  if (messageKey === "scripts.voiceover.error.forbiddenFields") {
    return copy.errors.forbiddenFields;
  }
  if (messageKey === "scripts.voiceover.error.emptyVoiceoverText") {
    return copy.errors.emptyVoiceoverText;
  }
  if (messageKey === "scripts.voiceover.error.providerUnavailable") {
    return copy.errors.providerUnavailable;
  }
  if (messageKey === "scripts.voiceover.error.costPolicyUnavailable") {
    return copy.errors.costPolicyUnavailable;
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
    case "EMPTY_VOICEOVER_TEXT":
      return copy.errors.emptyVoiceoverText;
    case "BUDGET_EXCEEDED":
      return copy.errors.budgetExceeded;
    case "COST_POLICY_UNAVAILABLE":
      return copy.errors.costPolicyUnavailable;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    default:
      return copy.errors.internal;
  }
}

/**
 * Operator voiceover synthesis panel (US-9.3).
 * Calls synthesizeVoiceoverForReelScript({ reelScriptId }) only.
 */
export function OperatorVoiceoverPanel({
  reelScriptId,
  summary,
  copy,
  disabled,
  onSuccess,
  onError,
  onToastSuccess,
}: OperatorVoiceoverPanelProps) {
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const ready = summary?.voiceoverAssetId != null;
  const canGenerate = summary?.canSynthesize && !ready;
  const canRegenerate = summary?.canRegenerate ?? false;

  async function handleSynthesize() {
    if (pending || disabled) {
      return;
    }

    setPending(true);
    setBanner(null);

    try {
      const result = await synthesizeVoiceoverForReelScript({ reelScriptId });

      if (result.ok) {
        onSuccess(result);
        onToastSuccess(copy.toastSuccess);
        return;
      }

      const message = messageForVoiceoverError(
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
      setPending(false);
    }
  }

  if (!summary?.canSynthesize && !ready) {
    return null;
  }

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "1rem 1.25rem",
        marginBottom: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>{copy.title}</h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
            {copy.aiOnlyNote}
          </p>
        </div>
        <Tag
          value={ready ? copy.status.ready : copy.status.missing}
          severity={ready ? "success" : "warning"}
        />
      </div>

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%" }} />
      ) : null}

      {ready && summary.voiceoverAssetId ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <audio
            controls
            preload="none"
            src={`/api/media/assets/${summary.voiceoverAssetId}`}
            style={{ width: "100%", maxWidth: "420px", height: "32px" }}
          />
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8125rem" }}>
            {copy.assetIdLabel}: {summary.voiceoverAssetId}
          </p>
          {summary.voiceId ? (
            <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8125rem" }}>
              {copy.voiceLabel}: {copy.voiceNames[summary.voiceId] ?? summary.voiceId}
            </p>
          ) : null}
        </div>
      ) : null}

      {canGenerate || canRegenerate ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {canGenerate ? (
            <Button
              type="button"
              label={pending ? copy.generating : copy.generate}
              icon="pi pi-volume-up"
              loading={pending}
              disabled={disabled || pending}
              onClick={() => void handleSynthesize()}
            />
          ) : null}
          {canRegenerate ? (
            <Button
              type="button"
              label={pending ? copy.generating : copy.regenerate}
              icon="pi pi-refresh"
              severity="secondary"
              outlined
              loading={pending}
              disabled={disabled || pending}
              onClick={() => void handleSynthesize()}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
