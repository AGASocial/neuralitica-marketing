import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import { listApprovedApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";
import { listPendingApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";
import { CALENDAR_SLOTS_TABLE } from "@/lib/calendar/sync-calendar-slots-for-week";
import type { ApprovedListItemDto } from "@/lib/contracts/approval";
import {
  ownerHomeDashboardDtoSchema,
  type OwnerHomeDashboardDto,
} from "@/lib/contracts/owner-home-dashboard";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import {
  buildOwnerHomeNextAction,
  computeOwnerHomeCampaignProgress,
  computeOwnerHomeTrafficLight,
  computeOwnerHomeWeekCounts,
  resolveOwnerHomeNextStepKey,
} from "@/lib/dashboard/compute-owner-home-snapshot";
import { getInterviewDashboardSummary } from "@/lib/interview/get-interview-dashboard-summary";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

async function loadCalendarPublishCounts(params: {
  clientId: string;
  weekStart: string;
}): Promise<{ scheduled: number; published: number }> {
  if (!isSupabaseConfigured()) {
    return { scheduled: 0, published: 0 };
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .select("publish_status")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart);

  if (error || !data) {
    return { scheduled: 0, published: 0 };
  }

  let scheduled = 0;
  let published = 0;
  for (const raw of data) {
    const status = (raw as { publish_status?: unknown }).publish_status;
    if (status === "published") {
      published += 1;
    } else {
      scheduled += 1;
    }
  }
  return { scheduled, published };
}

export async function loadOwnerHomeDashboard(params: {
  user: CurrentUser;
}): Promise<OwnerHomeDashboardDto> {
  const weekStart = resolveOrchestratorWeekStart(undefined);
  const lastUpdatedAt = new Date().toISOString();

  let interviewDone = false;
  try {
    const summary = await getInterviewDashboardSummary();
    interviewDone = summary?.status === "completed";
  } catch {
    interviewDone = false;
  }

  let waitingForOk = 0;
  let readyItems: ApprovedListItemDto[] = [];

  const calendarCountsPromise = loadCalendarPublishCounts({
    clientId: params.user.id,
    weekStart,
  });

  try {
    const pending = await listPendingApprovalsForClientUser({
      user: params.user,
    });
    if (pending.ok) {
      waitingForOk = pending.items.length;
    }
  } catch {
    waitingForOk = 0;
  }

  try {
    const approvedList = await listApprovedApprovalsForClientUser({
      user: params.user,
    });
    if (approvedList.ok) {
      readyItems = approvedList.items;
    }
  } catch {
    readyItems = [];
  }

  const calendarCounts = await calendarCountsPromise;
  const readyVideosCount = readyItems.length;

  let strategyStatus: "none" | "draft" | "approved" | "unknown" = "none";
  let slotTotal = 0;
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
      slotTotal = Array.isArray(row.brief?.slots) ? row.brief.slots.length : 0;
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

  const weekCounts = computeOwnerHomeWeekCounts({
    scheduled: calendarCounts.scheduled,
    published: calendarCounts.published,
    waitingForOk,
    inProduction: scriptsPendingCount,
  });

  const completedTowardPlan = Math.min(
    slotTotal,
    calendarCounts.published + readyVideosCount,
  );

  const dto: OwnerHomeDashboardDto = {
    weekStart,
    lastUpdatedAt,
    nextAction: buildOwnerHomeNextAction(stepKey),
    weekCounts,
    trafficLight: computeOwnerHomeTrafficLight(weekCounts),
    campaignProgress: computeOwnerHomeCampaignProgress({
      slotTotal,
      completed: completedTowardPlan,
      hasPlan: strategyStatus === "approved" || strategyStatus === "draft",
    }),
    results: { insightsAvailable: false },
    recentVideos: readyItems.slice(0, 6).map((item) => ({
      approvalId: item.approvalId,
      captionPreview: item.captionPreview,
      href: "/ready-to-publish",
    })),
    atajos: [
      { id: "interview", href: "/interview" },
      { id: "profile", href: "/profile" },
      { id: "preferences", href: "/settings/preferences" },
      { id: "approvals", href: "/approvals" },
      { id: "readyToPublish", href: "/ready-to-publish" },
    ],
  };

  return ownerHomeDashboardDtoSchema.parse(dto);
}
