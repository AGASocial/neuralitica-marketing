import "server-only";

import type {
  CalendarClientSummaryDto,
  CalendarSlotDetailDto,
  ClientGapWarningDto,
  GetOperatorCalendarForWeekSuccess,
} from "@/lib/contracts/calendar";
import type { ContentStrategySlotGoal } from "@/lib/contracts/content-strategy";
import { contentStrategyBriefSchema } from "@/lib/contracts/content-strategy";
import type { CalendarPublishStatus } from "@/lib/contracts/calendar";
import { PENDING_REEL_CAPTION_SUMMARY } from "@/lib/contracts/reel-caption";
import type { ReelCaptionSummary } from "@/lib/contracts/reel-caption";
import type { QaReportStatus } from "@/lib/contracts/qa-report";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { loadOperatorClientsForStrategy } from "@/lib/content-strategy/load-operator-clients-for-strategy";
import { deriveCalendarPipelineStatus } from "@/lib/calendar/derive-calendar-pipeline-status";
import { mapPublishMetadataToDto } from "@/lib/calendar/map-publish-metadata-dto";
import {
  CALENDAR_SLOTS_TABLE,
  syncCalendarSlotsForWeek,
} from "@/lib/calendar/sync-calendar-slots-for-week";
import { getAssemblyJobsForReelScripts } from "@/lib/assembly/get-assembly-jobs-for-reel-scripts";
import { mapApprovalRow } from "@/lib/approvals/persist-approval";
import { APPROVALS_TABLE } from "@/lib/approvals/persist-approval";
import {
  buildGeneratedReelCaptionSummary,
  listReelCaptionsForStrategy,
} from "@/lib/reel-captions/persist-reel-caption";
import { getQaReportsForAssembledReels } from "@/lib/qa/get-qa-reports-for-assembled-reels";
import { getVideoJobsForReelScripts } from "@/lib/video-jobs/get-video-jobs-for-reel-scripts";
import {
  buildReelMetricsDtoForPublishedReel,
  loadReelMetricsByAssembledReelIds,
  type ReelMetricsRow,
} from "@/lib/metrics/load-reel-metrics";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type CalendarSlotRow = {
  id: string;
  clientId: string;
  clientDisplayName: string;
  weekStart: string;
  scheduledDate: string;
  slotIndex: number;
  strategyId: string;
  reelScriptId: string | null;
  publishStatus: CalendarPublishStatus;
  publishedAtRaw: string | null;
  instagramPostUrlRaw: string | null;
  tema: string;
  goal: ContentStrategySlotGoal;
};

type StrategySlotMeta = {
  tema: string;
  goal: ContentStrategySlotGoal;
};

async function loadCalendarSlotRows(weekStart: string): Promise<CalendarSlotRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const clients = await loadOperatorClientsForStrategy();
  if (clients.length === 0) {
    return [];
  }

  const displayNameByClientId = new Map(
    clients.map((client) => [client.id, client.displayName]),
  );
  const activeClientIds = clients.map((client) => client.id);

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .select(
      "id, client_id, week_start, scheduled_date, slot_index, strategy_id, reel_script_id, publish_status, published_at, instagram_post_url",
    )
    .eq("week_start", weekStart)
    .in("client_id", activeClientIds);

  if (error || !data) {
    throw new Error("Failed to load calendar slots");
  }

  const strategyMetaById = new Map<string, Map<number, StrategySlotMeta>>();
  const rows: CalendarSlotRow[] = [];

  for (const raw of data) {
    const row = raw as Record<string, unknown>;

    if (
      typeof row.id !== "string" ||
      typeof row.client_id !== "string" ||
      typeof row.week_start !== "string" ||
      typeof row.scheduled_date !== "string" ||
      typeof row.slot_index !== "number" ||
      typeof row.strategy_id !== "string"
    ) {
      continue;
    }

    const displayName = displayNameByClientId.get(row.client_id);
    if (!displayName) {
      continue;
    }

    let meta = strategyMetaById.get(row.strategy_id);
    if (!meta) {
      meta = await loadStrategySlotMeta(row.strategy_id);
      strategyMetaById.set(row.strategy_id, meta);
    }

    const slotMeta = meta.get(row.slot_index);
    if (!slotMeta) {
      continue;
    }

    const publishStatus: CalendarPublishStatus =
      row.publish_status === "published" ? "published" : "ready";

    rows.push({
      id: row.id,
      clientId: row.client_id,
      clientDisplayName: displayName,
      weekStart: row.week_start,
      scheduledDate: row.scheduled_date,
      slotIndex: row.slot_index,
      strategyId: row.strategy_id,
      reelScriptId:
        typeof row.reel_script_id === "string" ? row.reel_script_id : null,
      publishStatus,
      publishedAtRaw:
        typeof row.published_at === "string" ? row.published_at : null,
      instagramPostUrlRaw:
        typeof row.instagram_post_url === "string"
          ? row.instagram_post_url
          : null,
      tema: slotMeta.tema,
      goal: slotMeta.goal,
    });
  }

  return rows;
}

async function loadStrategySlotMeta(
  strategyId: string,
): Promise<Map<number, StrategySlotMeta>> {
  const result = new Map<number, StrategySlotMeta>();
  if (!isSupabaseConfigured()) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select("brief")
    .eq("id", strategyId)
    .maybeSingle();

  if (error || !data) {
    return result;
  }

  const parsed = contentStrategyBriefSchema.safeParse(
    (data as { brief?: unknown }).brief,
  );
  if (!parsed.success) {
    return result;
  }

  for (const slot of parsed.data.slots) {
    result.set(slot.slotIndex, { tema: slot.tema, goal: slot.goal });
  }

  return result;
}

async function loadCaptionsByReelScriptIds(params: {
  clientId: string;
  strategyId: string;
  reelScriptIds: string[];
}): Promise<Map<string, ReelCaptionSummary>> {
  const result = new Map<string, ReelCaptionSummary>();
  if (params.reelScriptIds.length === 0) {
    return result;
  }

  const captionRows = await listReelCaptionsForStrategy({
    clientId: params.clientId,
    strategyId: params.strategyId,
  });

  for (const captionRow of captionRows) {
    if (!params.reelScriptIds.includes(captionRow.reelScriptId)) {
      continue;
    }
    result.set(
      captionRow.reelScriptId,
      buildGeneratedReelCaptionSummary({
        captionRow,
        scriptUpdatedAt: captionRow.updatedAt,
      }),
    );
  }

  return result;
}

async function loadApprovalsByAssembledReelIds(
  assembledReelIds: string[],
): Promise<
  Map<
    string,
    {
      id: string;
      status: import("@/lib/contracts/approval").ApprovalStatus;
    }
  >
> {
  const result = new Map<
    string,
    {
      id: string;
      status: import("@/lib/contracts/approval").ApprovalStatus;
    }
  >();

  if (!isSupabaseConfigured() || assembledReelIds.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(APPROVALS_TABLE)
    .select("*")
    .in("assembled_reel_id", assembledReelIds);

  if (error || !data) {
    return result;
  }

  for (const raw of data) {
    const mapped = mapApprovalRow(raw as Record<string, unknown>);
    if (mapped) {
      result.set(mapped.assembledReelId, {
        id: mapped.id,
        status: mapped.status,
      });
    }
  }

  return result;
}

function sortSlots(slots: CalendarSlotDetailDto[]): CalendarSlotDetailDto[] {
  return [...slots].sort((a, b) => {
    if (a.scheduledDate !== b.scheduledDate) {
      return a.scheduledDate.localeCompare(b.scheduledDate);
    }
    const nameCmp = a.clientDisplayName.localeCompare(b.clientDisplayName);
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.slotIndex - b.slotIndex;
  });
}

async function buildGapWarnings(params: {
  weekStart: string;
  slotRows: CalendarSlotRow[];
}): Promise<ClientGapWarningDto[]> {
  const clients = await loadOperatorClientsForStrategy();
  const countByClient = new Map<string, number>();

  for (const row of params.slotRows) {
    countByClient.set(row.clientId, (countByClient.get(row.clientId) ?? 0) + 1);
  }

  const warnings: ClientGapWarningDto[] = [];

  for (const client of clients) {
    const approved = await getApprovedStrategyForWeek({
      clientId: client.id,
      weekStart: params.weekStart,
    });
    if (!approved || approved.status !== "approved") {
      continue;
    }

    const scheduledCount = countByClient.get(client.id) ?? 0;
    if (scheduledCount >= 3) {
      continue;
    }

    warnings.push({
      clientId: client.id,
      clientDisplayName: client.displayName,
      scheduledCount,
      missingCount: 3 - scheduledCount,
    });
  }

  return warnings.sort((a, b) =>
    a.clientDisplayName.localeCompare(b.clientDisplayName),
  );
}

function buildClientSummaries(params: {
  slots: CalendarSlotDetailDto[];
  gapWarnings: ClientGapWarningDto[];
}): CalendarClientSummaryDto[] {
  const byId = new Map<string, CalendarClientSummaryDto>();

  for (const slot of params.slots) {
    byId.set(slot.clientId, {
      clientId: slot.clientId,
      clientDisplayName: slot.clientDisplayName,
    });
  }

  for (const warning of params.gapWarnings) {
    byId.set(warning.clientId, {
      clientId: warning.clientId,
      clientDisplayName: warning.clientDisplayName,
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.clientDisplayName.localeCompare(b.clientDisplayName),
  );
}

async function buildSlotDetailDtoForRow(
  row: CalendarSlotRow,
  context: {
    captionsByScript: Map<string, ReelCaptionSummary>;
    videoJobs: Awaited<ReturnType<typeof getVideoJobsForReelScripts>>;
    assemblyJobs: Awaited<ReturnType<typeof getAssemblyJobsForReelScripts>>;
    qaByReel: Awaited<ReturnType<typeof getQaReportsForAssembledReels>>;
    approvalsByReel: Map<
      string,
      {
        id: string;
        status: import("@/lib/contracts/approval").ApprovalStatus;
      }
    >;
    metricsByReel: Map<string, ReelMetricsRow>;
  },
): Promise<CalendarSlotDetailDto> {
  const captionSummary =
    row.reelScriptId !== null
      ? (context.captionsByScript.get(row.reelScriptId) ??
        PENDING_REEL_CAPTION_SUMMARY)
      : null;

  const videoJob =
    row.reelScriptId !== null ? context.videoJobs[row.reelScriptId] : null;
  const assemblyJob =
    row.reelScriptId !== null ? context.assemblyJobs[row.reelScriptId] : null;
  const assembledReelId = assemblyJob?.jobId ?? null;
  const qaReport =
    assembledReelId !== null ? context.qaByReel[assembledReelId] : null;
  const approval =
    assembledReelId !== null
      ? context.approvalsByReel.get(assembledReelId)
      : null;

  const derived = deriveCalendarPipelineStatus({
    publishStatus: row.publishStatus,
    reelScriptId: row.reelScriptId,
    captionSummary,
    videoJobStatus: videoJob?.status ?? null,
    assemblyStatus: assemblyJob?.status ?? null,
    brandingStatus: assemblyJob?.brandingStatus ?? null,
    outputMediaAssetId: assemblyJob?.outputMediaAssetId ?? null,
    qaReportStatus: (qaReport?.status as QaReportStatus | undefined) ?? null,
    approvalStatus: approval?.status ?? null,
    approvalId: approval?.id ?? null,
    assembledReelId,
  });

  const publishMetadata = mapPublishMetadataToDto({
    publishStatus: row.publishStatus,
    publishedAtRaw: row.publishedAtRaw,
    instagramPostUrlRaw: row.instagramPostUrlRaw,
  });

  let metrics: CalendarSlotDetailDto["metrics"] = null;
  if (
    derived.pipelineStatus === "published" &&
    derived.assembledReelId !== null &&
    row.reelScriptId !== null
  ) {
    metrics = await buildReelMetricsDtoForPublishedReel({
      assembledReelId: derived.assembledReelId,
      reelScriptId: row.reelScriptId,
      metricsRow: context.metricsByReel.get(derived.assembledReelId) ?? null,
    });
  }

  return {
    slotId: row.id,
    clientId: row.clientId,
    clientDisplayName: row.clientDisplayName,
    weekStart: row.weekStart,
    scheduledDate: row.scheduledDate,
    slotIndex: row.slotIndex,
    tema: row.tema,
    reelScriptId: row.reelScriptId,
    pipelineStatus: derived.pipelineStatus,
    approvalId: derived.approvalId,
    assembledReelId: derived.assembledReelId,
    thumbnailPreviewUrl: derived.thumbnailPreviewUrl,
    strategyId: row.strategyId,
    goal: row.goal,
    approvalStatus: derived.approvalStatus,
    changesRequested: derived.changesRequested,
    publishedAt: publishMetadata.publishedAt,
    instagramPostUrl: publishMetadata.instagramPostUrl,
    metrics,
  };
}

async function buildSlotDetailDtos(
  slotRows: CalendarSlotRow[],
): Promise<CalendarSlotDetailDto[]> {
  const slotsByClient = new Map<string, CalendarSlotRow[]>();
  for (const row of slotRows) {
    const list = slotsByClient.get(row.clientId) ?? [];
    list.push(row);
    slotsByClient.set(row.clientId, list);
  }

  const detailSlots: CalendarSlotDetailDto[] = [];

  for (const [clientId, clientSlots] of slotsByClient) {
    const reelScriptIds = clientSlots
      .map((s) => s.reelScriptId)
      .filter((id): id is string => id !== null);

    const strategyId = clientSlots[0]?.strategyId;
    const captionsByScript = strategyId
      ? await loadCaptionsByReelScriptIds({
          clientId,
          strategyId,
          reelScriptIds,
        })
      : new Map<string, ReelCaptionSummary>();

    const videoJobs = await getVideoJobsForReelScripts({
      clientId,
      reelScriptIds,
    });

    const assemblyJobs = await getAssemblyJobsForReelScripts({
      clientId,
      reelScriptIds,
    });

    const assembledReelIds = [
      ...new Set(
        Object.values(assemblyJobs)
          .map((job) => job?.jobId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];

    const qaByReel = await getQaReportsForAssembledReels({
      clientId,
      assembledReelIds,
    });

    const approvalsByReel = await loadApprovalsByAssembledReelIds(
      assembledReelIds,
    );

    const metricsByReel = await loadReelMetricsByAssembledReelIds(
      assembledReelIds,
    );

    const context = {
      captionsByScript,
      videoJobs,
      assemblyJobs,
      qaByReel,
      approvalsByReel,
      metricsByReel,
    };

    for (const row of clientSlots) {
      detailSlots.push(await buildSlotDetailDtoForRow(row, context));
    }
  }

  return detailSlots;
}

/**
 * Operator calendar aggregate orchestrator (US-12.1).
 * Caller must gate with requireOperator before invoking.
 */
export async function loadCalendarSlotRowById(
  slotId: string,
): Promise<CalendarSlotRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(CALENDAR_SLOTS_TABLE)
    .select(
      "id, client_id, week_start, scheduled_date, slot_index, strategy_id, reel_script_id, publish_status, published_at, instagram_post_url",
    )
    .eq("id", slotId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.client_id !== "string" ||
    typeof row.week_start !== "string" ||
    typeof row.scheduled_date !== "string" ||
    typeof row.slot_index !== "number" ||
    typeof row.strategy_id !== "string"
  ) {
    return null;
  }

  const clients = await loadOperatorClientsForStrategy();
  const client = clients.find((entry) => entry.id === row.client_id);
  if (!client) {
    return null;
  }

  const meta = await loadStrategySlotMeta(row.strategy_id);
  const slotMeta = meta.get(row.slot_index);
  if (!slotMeta) {
    return null;
  }

  const publishStatus: CalendarPublishStatus =
    row.publish_status === "published" ? "published" : "ready";

  return {
    id: row.id,
    clientId: row.client_id,
    clientDisplayName: client.displayName,
    weekStart: row.week_start,
    scheduledDate: row.scheduled_date,
    slotIndex: row.slot_index,
    strategyId: row.strategy_id,
    reelScriptId:
      typeof row.reel_script_id === "string" ? row.reel_script_id : null,
    publishStatus,
    publishedAtRaw:
      typeof row.published_at === "string" ? row.published_at : null,
    instagramPostUrlRaw:
      typeof row.instagram_post_url === "string" ? row.instagram_post_url : null,
    tema: slotMeta.tema,
    goal: slotMeta.goal,
  };
}

export async function buildCalendarSlotDetailDtoForRow(
  row: CalendarSlotRow,
): Promise<CalendarSlotDetailDto> {
  const reelScriptIds = row.reelScriptId !== null ? [row.reelScriptId] : [];

  const captionsByScript = await loadCaptionsByReelScriptIds({
    clientId: row.clientId,
    strategyId: row.strategyId,
    reelScriptIds,
  });

  const videoJobs = await getVideoJobsForReelScripts({
    clientId: row.clientId,
    reelScriptIds,
  });

  const assemblyJobs = await getAssemblyJobsForReelScripts({
    clientId: row.clientId,
    reelScriptIds,
  });

  const assembledReelIds = [
    ...new Set(
      Object.values(assemblyJobs)
        .map((job) => job?.jobId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const qaByReel = await getQaReportsForAssembledReels({
    clientId: row.clientId,
    assembledReelIds,
  });

  const approvalsByReel = await loadApprovalsByAssembledReelIds(
    assembledReelIds,
  );

  const metricsByReel = await loadReelMetricsByAssembledReelIds(
    assembledReelIds,
  );

  return buildSlotDetailDtoForRow(row, {
    captionsByScript,
    videoJobs,
    assemblyJobs,
    qaByReel,
    approvalsByReel,
    metricsByReel,
  });
}

/**
 * Operator calendar aggregate orchestrator (US-12.1).
 * Caller must gate with requireOperator before invoking.
 */
export async function getOperatorCalendarForWeekCore(
  weekStart: string,
): Promise<GetOperatorCalendarForWeekSuccess> {
  const syncStats = await syncCalendarSlotsForWeek(weekStart);
  const slotRows = await loadCalendarSlotRows(weekStart);
  const slots = sortSlots(await buildSlotDetailDtos(slotRows));
  const gapWarnings = await buildGapWarnings({ weekStart, slotRows });

  return {
    ok: true,
    weekStart,
    clients: buildClientSummaries({ slots, gapWarnings }),
    slots,
    gapWarnings,
    clientsWithoutApprovedStrategyCount:
      syncStats.clientsWithoutApprovedStrategyCount,
  };
}
