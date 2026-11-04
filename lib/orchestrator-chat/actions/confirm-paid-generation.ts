"use server";

import { revalidatePath } from "next/cache";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { confirmPaidGenerationFromChatInputSchema } from "@/lib/contracts/orchestrator-chat";
import { createBrollVideoJobs } from "@/lib/video-jobs/actions/create-broll-video-jobs";
import {
  createHeygenTalkingHeadVideoJob,
  previewHeygenTalkingHeadEstimate,
} from "@/lib/video-jobs/actions/create-heygen-talking-head-video-job";
import { previewBrollVideoJobsEstimate } from "@/lib/video-jobs/actions/preview-broll-video-jobs-estimate";

/**
 * Chat Approve boundary for paid video generation (KAN-93).
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
      const preview = await previewBrollVideoJobsEstimate({
        reelScriptId,
        clientId: operator.id,
      });
      if (!preview.ok) {
        return { ok: false, error: "ESTIMATE_FAILED" };
      }
      if (
        "blockedReasonKey" in preview &&
        preview.blockedReasonKey !== undefined
      ) {
        return { ok: false, error: "BLOCKED" };
      }
      if (preview.estimatedCostCents !== confirmEstimateCents) {
        return { ok: false, error: "ESTIMATE_MISMATCH" };
      }
      const result = await createBrollVideoJobs({
        reelScriptId,
        clientId: operator.id,
      });
      if (result.ok) {
        revalidatePath("/operator/scripts");
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
