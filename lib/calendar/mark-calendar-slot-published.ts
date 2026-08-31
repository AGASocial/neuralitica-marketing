import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import type {
  MarkCalendarSlotPublishedInput,
  MarkCalendarSlotPublishedResult,
} from "@/lib/contracts/calendar";
import { loadApprovalByAssembledReelScoped } from "@/lib/approvals/persist-approval";
import { getAssemblyJobsForReelScripts } from "@/lib/assembly/get-assembly-jobs-for-reel-scripts";
import {
  checkCalendarMarkPublishedRateLimit,
  recordCalendarMarkPublishedAttempt,
} from "@/lib/calendar/check-calendar-mark-published-rate-limit";
import {
  calendarInternalError,
  calendarNotApprovedError,
  calendarNotFoundError,
  calendarRateLimitedError,
  calendarSlotNotReadyError,
  calendarValidationError,
} from "@/lib/calendar/errors";
import {
  buildCalendarSlotDetailDtoForRow,
  loadCalendarSlotRowById,
} from "@/lib/calendar/get-operator-calendar-for-week";
import {
  isPublishedAtWithinBounds,
  publishedAtUtcNoonIsoFromDateInput,
} from "@/lib/calendar/operator-local-calendar-date";
import { CALENDAR_SLOTS_TABLE } from "@/lib/calendar/sync-calendar-slots-for-week";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type MarkCalendarSlotPublishedCoreParams = {
  input: MarkCalendarSlotPublishedInput;
  operator: CurrentUser;
};

async function verifySlotReadyForPublish(params: {
  clientId: string;
  reelScriptId: string | null;
}): Promise<
  | { ok: true; assembledReelId: string }
  | { ok: false; code: "SLOT_NOT_READY" | "NOT_APPROVED" }
> {
  if (params.reelScriptId === null) {
    return { ok: false, code: "SLOT_NOT_READY" };
  }

  const assemblyJobs = await getAssemblyJobsForReelScripts({
    clientId: params.clientId,
    reelScriptIds: [params.reelScriptId],
  });
  const assemblyJob = assemblyJobs[params.reelScriptId];
  const assembledReelId = assemblyJob?.jobId ?? null;
  const hasBrandedOutput =
    assemblyJob?.status === "completed" &&
    assemblyJob.outputMediaAssetId !== null &&
    (assemblyJob.brandingStatus === "completed" ||
      assemblyJob.brandingStatus === "skipped" ||
      assemblyJob.brandingStatus === null);

  if (assembledReelId === null || !hasBrandedOutput) {
    return { ok: false, code: "SLOT_NOT_READY" };
  }

  const approval = await loadApprovalByAssembledReelScoped({
    assembledReelId,
    clientId: params.clientId,
  });

  if (!approval || approval.status !== "approved") {
    return { ok: false, code: "NOT_APPROVED" };
  }

  return { ok: true, assembledReelId };
}

/**
 * Operator mark-published orchestrator (US-12.2).
 * Caller must gate with requireOperator and validate input before invoking.
 */
export async function markCalendarSlotPublishedCore(
  params: MarkCalendarSlotPublishedCoreParams,
): Promise<MarkCalendarSlotPublishedResult> {
  const rateCheck = await checkCalendarMarkPublishedRateLimit({
    clientId: params.operator.id,
  });
  if (!rateCheck.ok) {
    return calendarRateLimitedError();
  }

  const slot = await loadCalendarSlotRowById(params.input.slotId);
  if (!slot) {
    return calendarNotFoundError();
  }

  if (
    !isPublishedAtWithinBounds({
      publishedAt: params.input.publishedAt,
      weekStart: slot.weekStart,
    })
  ) {
    return calendarValidationError({
      publishedAt: ["publishedAt must be within allowed calendar bounds"],
    });
  }

  const readiness = await verifySlotReadyForPublish({
    clientId: slot.clientId,
    reelScriptId: slot.reelScriptId,
  });
  if (!readiness.ok) {
    if (readiness.code === "SLOT_NOT_READY") {
      return calendarSlotNotReadyError();
    }
    return calendarNotApprovedError();
  }

  if (!isSupabaseConfigured()) {
    return calendarInternalError();
  }

  const publishedAtUtc = publishedAtUtcNoonIsoFromDateInput(
    params.input.publishedAt,
  );
  const instagramPostUrl =
    params.input.instagramPostUrl === undefined
      ? null
      : params.input.instagramPostUrl;

  const supabase = createServerSupabaseClient();
  const { data: updated, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .update({
      publish_status: "published",
      published_at: publishedAtUtc,
      instagram_post_url: instagramPostUrl,
    })
    .eq("id", params.input.slotId)
    .select(
      "id, client_id, week_start, scheduled_date, slot_index, strategy_id, reel_script_id, publish_status, published_at, instagram_post_url",
    )
    .maybeSingle();

  if (error || !updated) {
    return calendarInternalError();
  }

  await recordCalendarMarkPublishedAttempt({ clientId: params.operator.id });

  const refreshed = await loadCalendarSlotRowById(params.input.slotId);
  if (!refreshed) {
    return calendarInternalError();
  }

  const detail = await buildCalendarSlotDetailDtoForRow(refreshed);
  return { ok: true, slot: detail };
}
