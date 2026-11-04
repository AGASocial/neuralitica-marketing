import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import { mediaPreviewUrl } from "@/lib/approvals/caption-preview";
import {
  listApprovedApprovalsForClientUser,
  listPendingApprovalsForClientUser,
} from "@/lib/approvals/list-get-approvals";
import { ASSEMBLY_JOBS_TABLE } from "@/lib/assembly/assembly-job-row";
import { CALENDAR_SLOTS_TABLE } from "@/lib/calendar/sync-calendar-slots-for-week";
import type { ApprovalListItemDto } from "@/lib/contracts/approval";
import {
  hoyFeedDtoSchema,
  type HoyFeedDto,
  type HoyNextSlot,
} from "@/lib/contracts/hoy-feed";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import { listUnreadHoyNotifications } from "@/lib/automation/events";
import { buildHoyTimeline } from "@/lib/dashboard/build-hoy-timeline";
import {
  buildOwnerHomeNextAction,
  resolveOwnerHomeNextStepKey,
} from "@/lib/dashboard/compute-owner-home-snapshot";
import {
  selectHoyProactiveCards,
  type HoyProactiveCandidate,
} from "@/lib/dashboard/select-hoy-proactive-cards";
import { getInterviewDashboardSummary } from "@/lib/interview/get-interview-dashboard-summary";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { VIDEO_JOBS_TABLE } from "@/lib/video-jobs/video-job-row";

async function loadWeekSlots(params: {
  clientId: string;
  weekStart: string;
  locale: "en" | "es";
}): Promise<HoyNextSlot[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .select("id, scheduled_date, slot_index, publish_status")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .order("scheduled_date", { ascending: true })
    .limit(8);

  if (error || !data) {
    return [];
  }

  const weekdayFmt = new Intl.DateTimeFormat(
    params.locale === "es" ? "es" : "en",
    { weekday: "short" },
  );

  return data.map((raw) => {
    const row = raw as {
      id?: unknown;
      scheduled_date?: unknown;
      slot_index?: unknown;
      publish_status?: unknown;
    };
    const id =
      typeof row.id === "string"
        ? row.id
        : `slot-${String(row.slot_index ?? "x")}`;
    const scheduledDate =
      typeof row.scheduled_date === "string" ? row.scheduled_date : undefined;
    const label = scheduledDate
      ? weekdayFmt.format(new Date(`${scheduledDate}T12:00:00`))
      : `Slot ${String(row.slot_index ?? "")}`;
    const status: HoyNextSlot["status"] =
      row.publish_status === "published" ? "done" : "scheduled";
    return { id, label, status, scheduledDate };
  });
}

async function loadInProductionMeta(clientId: string): Promise<{
  count: number;
  updatedAt?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { count: 0 };
  }
  const supabase = createServerSupabaseClient();
  const { data: videoRows } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("updated_at")
    .eq("client_id", clientId)
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: false })
    .limit(20);
  const { data: assemblyRows } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select("updated_at")
    .eq("client_id", clientId)
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: false })
    .limit(20);

  const stamps: string[] = [];
  for (const raw of [...(videoRows ?? []), ...(assemblyRows ?? [])]) {
    const at = (raw as { updated_at?: unknown }).updated_at;
    if (typeof at === "string") {
      stamps.push(at);
    }
  }
  stamps.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return { count: stamps.length, updatedAt: stamps[0] };
}

export async function loadHoyFeed(params: {
  user: CurrentUser;
  locale: "en" | "es";
}): Promise<HoyFeedDto> {
  const weekStart = resolveOrchestratorWeekStart(undefined);
  const lastUpdatedAt = new Date().toISOString();

  let interviewDone = false;
  try {
    const summary = await getInterviewDashboardSummary();
    interviewDone = summary?.status === "completed";
  } catch {
    interviewDone = false;
  }

  let pendingItems: ApprovalListItemDto[] = [];
  try {
    const pending = await listPendingApprovalsForClientUser({
      user: params.user,
    });
    if (pending.ok) {
      pendingItems = pending.items;
    }
  } catch {
    pendingItems = [];
  }

  let approved: Array<{
    approvalId: string;
    decidedAt: string;
    title?: string;
  }> = [];
  let readyVideosCount = 0;
  try {
    const approvedList = await listApprovedApprovalsForClientUser({
      user: params.user,
    });
    if (approvedList.ok) {
      readyVideosCount = approvedList.items.length;
      approved = approvedList.items.map((item) => ({
        approvalId: item.approvalId,
        decidedAt: item.decidedAt,
        title: item.captionPreview,
      }));
    }
  } catch {
    approved = [];
  }

  let strategyStatus: "none" | "draft" | "approved" | "unknown" = "none";
  let planApprovedAt: string | null = null;
  let scriptsPendingCount = 0;
  let scriptsReadyCount = 0;

  try {
    const row = await loadLatestStrategyRowWithApproval({
      clientId: params.user.id,
      weekStart,
    });
    if (!row) {
      strategyStatus = "none";
    } else {
      strategyStatus = row.status === "approved" ? "approved" : "draft";
      planApprovedAt =
        row.status === "approved" && row.approvedAt ? row.approvedAt : null;
      if (row.status === "approved") {
        const { items } = await buildReelScriptListForStrategy({
          clientId: params.user.id,
          weekStart,
          strategyId: row.id,
          version: row.version,
          brief: row.brief,
        });
        scriptsReadyCount = items.filter((i) => i.status === "generated").length;
        scriptsPendingCount = items.filter((i) => i.status === "pending").length;
      }
    }
  } catch {
    strategyStatus = "unknown";
  }

  const inProduction = await loadInProductionMeta(params.user.id);
  const waitingForOk = pendingItems.length;

  const planDone = strategyStatus === "approved";
  const scriptsDone =
    planDone && scriptsPendingCount === 0 && scriptsReadyCount > 0;
  const videosDone = waitingForOk + readyVideosCount > 0;
  const approveDone = waitingForOk === 0 && readyVideosCount > 0;
  const readyDone = readyVideosCount > 0 && waitingForOk === 0;

  const stepKey = resolveOwnerHomeNextStepKey({
    interviewDone,
    planDone,
    scriptsDone,
    videosDone,
    approveDone,
    readyDone,
  });

  const candidates: HoyProactiveCandidate[] = pendingItems.map((item, i) => ({
    id: item.approvalId,
    kind: "needs_ok" as const,
    rank: i,
  }));
  candidates.push({ id: "next-action", kind: "next_action", rank: 0 });

  const { selected } = selectHoyProactiveCards(candidates);
  const selectedPendingIds = selected
    .filter((c) => c.kind === "needs_ok")
    .map((c) => c.id);
  const showNextActionCard = selected.some((c) => c.kind === "next_action");
  const pendingOverflowCount = Math.max(
    0,
    pendingItems.length - selectedPendingIds.length,
  );

  let nextSlots = await loadWeekSlots({
    clientId: params.user.id,
    weekStart,
    locale: params.locale,
  });

  if (waitingForOk > 0 && nextSlots.length > 0) {
    const firstOpen = nextSlots.findIndex((s) => s.status !== "done");
    nextSlots = nextSlots.map((slot, index) => {
      if (index === firstOpen) {
        return { ...slot, status: "needs_ok" as const };
      }
      if (slot.status !== "done" && index > firstOpen) {
        return { ...slot, status: "preparing" as const };
      }
      return slot;
    });
  }

  const timeline = buildHoyTimeline({
    approved,
    inProductionCount: inProduction.count,
    inProductionUpdatedAt: inProduction.updatedAt,
    planApprovedAt,
    generatedVideoCount: waitingForOk > 0 ? waitingForOk : undefined,
    generatedAt:
      pendingItems[0]?.assembledAt ??
      pendingItems[0]?.createdAt ??
      null,
  });

  const hoyNotifications = await listUnreadHoyNotifications({
    clientId: params.user.id,
    limit: 5,
  });

  const dto: HoyFeedDto = {
    weekStart,
    lastUpdatedAt,
    pendingApprovals: pendingItems,
    selectedPendingIds,
    pendingOverflowCount,
    timeline,
    nextSlots,
    nextAction: buildOwnerHomeNextAction(stepKey),
    showNextActionCard,
    results: { insightsAvailable: false },
    notifications: hoyNotifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      approvalIds: n.approvalIds,
      createdAt: n.createdAt,
    })),
  };

  return hoyFeedDtoSchema.parse(dto);
}

/** Attach authenticated media preview URLs for AgentCard player/thumb. */
export function withPendingPreviewUrls(
  items: ApprovalListItemDto[],
): Array<ApprovalListItemDto & { videoPreviewUrl?: string }> {
  return items.map((item) => ({
    ...item,
    videoPreviewUrl: item.videoAssetId
      ? mediaPreviewUrl(item.videoAssetId)
      : undefined,
  }));
}
