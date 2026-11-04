"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { confirmPaidGenerationFromChatInputSchema } from "@/lib/contracts/orchestrator-chat";
import { estimateFacelessPipelineCost } from "@/lib/orchestrator-chat/estimate-faceless-pipeline-cost";
import { loadReelScriptForVoiceover } from "@/lib/tts/load-reel-script-for-voiceover";
import { synthesizeVoiceoverForReelScript } from "@/lib/tts/actions/synthesize-voiceover-for-reel-script";
import { createBrollVideoJobs } from "@/lib/video-jobs/actions/create-broll-video-jobs";
import {
  createHeygenTalkingHeadVideoJob,
  previewHeygenTalkingHeadEstimate,
} from "@/lib/video-jobs/actions/create-heygen-talking-head-video-job";

/**
 * Chat Approve boundary for paid video generation (KAN-93).
 * Faceless (broll): TTS (if needed) + b-roll; assembly advances when clips complete.
 * Re-checks live estimate before spending; never trusts the model alone.
 */
export async function confirmPaidGenerationFromChat(rawInput: unknown): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    let operator;
    try {
      operator = await requireOperator("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return {
          ok: false,
          error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        };
      }
      throw error;
    }

    const parsed = confirmPaidGenerationFromChatInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR" };
    }

    const { reelScriptId, paidKind, confirmEstimateCents, targetDurationSec } =
      parsed.data;

    if (paidKind === "broll") {
      const script = await loadReelScriptForVoiceover({
        reelScriptId,
        clientId: operator.id,
        preferredLocale: operator.preferredLocale ?? "en",
      });
      if (!script) {
        return { ok: false, error: "NOT_FOUND" };
      }

      const total = await estimateFacelessPipelineCost({
        reelScriptId,
        clientId: operator.id,
        voiceoverTextLength: script.voiceoverText.length,
      });
      if (!total.ok) {
        return { ok: false, error: "ESTIMATE_FAILED" };
      }
      if (total.blockedReasonKey !== undefined) {
        return { ok: false, error: "BLOCKED" };
      }
      if (total.estimatedCostCents !== confirmEstimateCents) {
        return { ok: false, error: "ESTIMATE_MISMATCH" };
      }

      if (!total.voiceoverAlreadyExists) {
        if (script.voiceoverText.length === 0) {
          return { ok: false, error: "EMPTY_VOICEOVER_TEXT" };
        }
        const tts = await synthesizeVoiceoverForReelScript({ reelScriptId });
        if (!tts.ok) {
          return { ok: false, error: tts.error.code };
        }
      }

      const result = await createBrollVideoJobs({
        reelScriptId,
        clientId: operator.id,
      });
      if (result.ok) {
        revalidatePath("/operator/scripts");
        revalidatePath("/ready-to-publish");
        return { ok: true };
      }
      return { ok: false, error: "CREATE_FAILED" };
    }

    const preview = await previewHeygenTalkingHeadEstimate({
      reelScriptId,
      clientId: operator.id,
      ...(targetDurationSec !== undefined ? { targetDurationSec } : {}),
    });
    if (!preview.ok) {
      return { ok: false, error: "ESTIMATE_FAILED" };
    }
    if (!preview.eligible) {
      return { ok: false, error: "INELIGIBLE" };
    }
    if (preview.estimatedCostCents !== confirmEstimateCents) {
      return { ok: false, error: "ESTIMATE_MISMATCH" };
    }

    const result = await createHeygenTalkingHeadVideoJob({
      reelScriptId,
      clientId: operator.id,
      targetDurationSec: targetDurationSec ?? preview.durationSec,
      confirmEstimateCents,
    });
    if (result.ok) {
      revalidatePath("/operator/scripts");
      return { ok: true };
    }
    return { ok: false, error: "CREATE_FAILED" };
  } catch {
    return { ok: false, error: "INTERNAL" };
  }
}
