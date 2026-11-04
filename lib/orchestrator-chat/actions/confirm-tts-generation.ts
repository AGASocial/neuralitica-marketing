"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { confirmTtsGenerationFromChatInputSchema } from "@/lib/contracts/orchestrator-chat";
import { estimateTtsCostCentsFromTextLength } from "@/lib/orchestrator-chat/estimate-tts-cost";
import { loadReelScriptForVoiceover } from "@/lib/tts/load-reel-script-for-voiceover";
import { synthesizeVoiceoverForReelScript } from "@/lib/tts/actions/synthesize-voiceover-for-reel-script";

/**
 * Chat Approve boundary for TTS/voice spend — distinct from b-roll/HeyGen
 * `confirmPaidGenerationFromChat`. Re-checks estimate; nothing runs without Approve.
 */
export async function confirmTtsGenerationFromChat(rawInput: unknown): Promise<{
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

    const parsed = confirmTtsGenerationFromChatInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR" };
    }

    const { reelScriptId, confirmEstimateCents } = parsed.data;
    const script = await loadReelScriptForVoiceover({
      reelScriptId,
      clientId: operator.id,
      preferredLocale: operator.preferredLocale ?? "en",
    });
    if (!script) {
      return { ok: false, error: "NOT_FOUND" };
    }
    if (script.voiceoverText.length === 0) {
      return { ok: false, error: "EMPTY_VOICEOVER_TEXT" };
    }

    const liveEstimate = estimateTtsCostCentsFromTextLength(
      script.voiceoverText.length,
    );
    if (liveEstimate !== confirmEstimateCents) {
      return { ok: false, error: "ESTIMATE_MISMATCH" };
    }

    const result = await synthesizeVoiceoverForReelScript({ reelScriptId });
    if (result.ok) {
      revalidatePath("/operator/scripts");
      return { ok: true };
    }
    return { ok: false, error: result.error.code };
  } catch {
    return { ok: false, error: "INTERNAL" };
  }
}
