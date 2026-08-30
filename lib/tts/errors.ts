import type {
  SynthesizeVoiceoverForReelScriptErrorEnvelope,
  TtsVoiceoverErrorCode,
} from "@/lib/contracts/tts-voiceover";

export function ttsVoiceoverError(
  code: TtsVoiceoverErrorCode,
  messageKey: string,
  extra?: { fields?: Record<string, string[]> },
): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return {
    ok: false,
    error: {
      code,
      messageKey,
      ...extra,
    },
  };
}

export function ttsVoiceoverValidationError(
  fields: Record<string, string[]>,
): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "VALIDATION_ERROR",
    "scripts.voiceover.error.validation",
    { fields },
  );
}

export function ttsVoiceoverForbiddenFieldsError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "FORBIDDEN_FIELDS",
    "scripts.voiceover.error.forbiddenFields",
  );
}

export function ttsVoiceoverForbiddenError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError("FORBIDDEN", "scripts.voiceover.error.forbidden");
}

export function ttsVoiceoverUnauthenticatedError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "UNAUTHENTICATED",
    "scripts.voiceover.error.unauthenticated",
  );
}

export function ttsVoiceoverNotFoundError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError("NOT_FOUND", "scripts.voiceover.error.notFound");
}

export function ttsVoiceoverEmptyTextError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "EMPTY_VOICEOVER_TEXT",
    "scripts.voiceover.error.emptyVoiceoverText",
  );
}

export function ttsVoiceoverBudgetExceededError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "BUDGET_EXCEEDED",
    "scripts.voiceover.error.budgetExceeded",
  );
}

export function ttsVoiceoverCostPolicyUnavailableError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "COST_POLICY_UNAVAILABLE",
    "scripts.voiceover.error.costPolicyUnavailable",
  );
}

export function ttsVoiceoverProviderUnavailableError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "PROVIDER_UNAVAILABLE",
    "scripts.voiceover.error.providerUnavailable",
  );
}

export function ttsVoiceoverInternalError(): SynthesizeVoiceoverForReelScriptErrorEnvelope {
  return ttsVoiceoverError(
    "INTERNAL_ERROR",
    "scripts.voiceover.error.internal",
  );
}
