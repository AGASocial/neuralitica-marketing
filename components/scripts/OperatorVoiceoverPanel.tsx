"use client";

import { useState } from "react";

import { RefreshCwIcon, Volume2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
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
      className="bg-panel border border-edge rounded-lg py-4 px-5 mb-4 flex flex-col gap-3"
    >
      <div
        className="flex justify-between items-start gap-3 flex-wrap"
      >
        <div>
          <h3 className="mt-0 mx-0 mb-[0.35rem] font-display text-fog text-base">{copy.title}</h3>
          <p className="m-0 text-dim text-sm">
            {copy.aiOnlyNote}
          </p>
        </div>
        <StatusBadge
          value={ready ? copy.status.ready : copy.status.missing}
          severity={ready ? "success" : "warning"}
        />
      </div>

      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full" />
      ) : null}

      {ready && summary.voiceoverAssetId ? (
        <div className="grid gap-2">
          <audio
            controls
            preload="none"
            src={`/api/media/assets/${summary.voiceoverAssetId}`}
            className="w-full max-w-[420px] h-8"
          />
          <p className="m-0 text-dim text-[0.8125rem]">
            {copy.assetIdLabel}: {summary.voiceoverAssetId}
          </p>
          {summary.voiceId ? (
            <p className="m-0 text-dim text-[0.8125rem]">
              {copy.voiceLabel}: {copy.voiceNames[summary.voiceId] ?? summary.voiceId}
            </p>
          ) : null}
        </div>
      ) : null}

      {canGenerate || canRegenerate ? (
        <div className="flex flex-wrap gap-2">
          {canGenerate ? (
            <Button
              type="button"
              onClick={() => void handleSynthesize()}
              disabled={disabled || pending}
            >
              {pending ? <Spinner className="size-4 text-current" /> : <Volume2Icon />}
              {pending ? copy.generating : copy.generate}
            </Button>
          ) : null}
          {canRegenerate ? (
            <Button
              type="button"
              onClick={() => void handleSynthesize()}
              variant="outline"
              disabled={disabled || pending}
            >
              {pending ? <Spinner className="size-4 text-current" /> : <RefreshCwIcon />}
              {pending ? copy.generating : copy.regenerate}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
