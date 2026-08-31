import "server-only";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import { contentStrategyBriefSchema } from "@/lib/contracts/content-strategy";
import {
  strategyPerformanceInsightsDtoSchema,
  type StrategyPerformanceInsightsDto,
} from "@/lib/contracts/strategy-insights";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { computeStrategyMetricsWindow } from "@/lib/metrics/compute-strategy-metrics-window";
import { normalizeTemaKey } from "@/lib/metrics/normalize-tema-key";
import { REEL_METRICS_TABLE } from "@/lib/metrics/load-reel-metrics";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type MetricsRow = {
  assembledReelId: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  dms: number;
};

type AssembledReelRow = {
  id: string;
  clientId: string;
  reelScriptId: string;
};

type ReelScriptRow = {
  id: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
};

type StrategyRow = {
  id: string;
  clientId: string;
  brief: unknown;
};

type ThemeAccumulator = {
  displayTema: string;
  reelIds: Set<string>;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  dms: number;
};

function extractTemaFromBrief(brief: unknown, slotIndex: number): string | null {
  const parsed = contentStrategyBriefSchema.safeParse(brief);
  if (!parsed.success) {
    return null;
  }

  const slot = parsed.data.slots.find((s) => s.slotIndex === slotIndex);
  if (!slot) {
    return null;
  }

  const tema = slot.tema.trim();
  if (tema.length === 0 || tema.length > 200) {
    return null;
  }

  return tema;
}

function computeEngagementScore(row: {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  dms: number;
}): number {
  return row.views + row.likes + row.comments + row.saves + row.dms;
}

function rankTopThemes(
  groups: Map<string, ThemeAccumulator>,
): StrategyPerformanceInsightsDto["topThemes"] {
  const sorted = [...groups.entries()].sort((a, b) => {
    const scoreA = computeEngagementScore(a[1]);
    const scoreB = computeEngagementScore(b[1]);
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    if (b[1].views !== a[1].views) {
      return b[1].views - a[1].views;
    }
    return b[1].reelIds.size - a[1].reelIds.size;
  });

  return sorted.slice(0, 3).map(([_, group], index) => ({
    rank: (index + 1) as 1 | 2 | 3,
    tema: group.displayTema,
    reelCount: group.reelIds.size,
    views: group.views,
    likes: group.likes,
    comments: group.comments,
    saves: group.saves,
    dms: group.dms,
    engagementScore: computeEngagementScore(group),
  }));
}

async function loadMetricsInWindow(params: {
  clientId: string;
  windowStartTs: Date;
  windowEndTs: Date;
}): Promise<MetricsRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(REEL_METRICS_TABLE)
    .select(
      "assembled_reel_id, views, likes, comments, saves, dms",
    )
    .eq("client_id", params.clientId)
    .gte("recorded_at", params.windowStartTs.toISOString())
    .lt("recorded_at", params.windowEndTs.toISOString());

  if (error || !data) {
    throw new Error("METRICS_QUERY_FAILED");
  }

  const rows: MetricsRow[] = [];
  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (typeof row.assembled_reel_id !== "string") {
      continue;
    }
    const counters = ["views", "likes", "comments", "saves", "dms"] as const;
    const values: Partial<Record<(typeof counters)[number], number>> = {};
    let valid = true;
    for (const key of counters) {
      if (typeof row[key] !== "number" || !Number.isInteger(row[key])) {
        valid = false;
        break;
      }
      values[key] = row[key] as number;
    }
    if (!valid) {
      continue;
    }
    rows.push({
      assembledReelId: row.assembled_reel_id,
      views: values.views!,
      likes: values.likes!,
      comments: values.comments!,
      saves: values.saves!,
      dms: values.dms!,
    });
  }

  return rows;
}

async function loadAssembledReelsByIds(
  clientId: string,
  ids: string[],
): Promise<Map<string, AssembledReelRow>> {
  const result = new Map<string, AssembledReelRow>();
  if (ids.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_assembled_reels")
    .select("id, client_id, reel_script_id")
    .eq("client_id", clientId)
    .in("id", ids);

  if (error || !data) {
    throw new Error("ASSEMBLED_REELS_QUERY_FAILED");
  }

  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.client_id !== "string" ||
      typeof row.reel_script_id !== "string"
    ) {
      continue;
    }
    if (row.client_id !== clientId) {
      continue;
    }
    result.set(row.id, {
      id: row.id,
      clientId: row.client_id,
      reelScriptId: row.reel_script_id,
    });
  }

  return result;
}

async function loadReelScriptsByIds(
  clientId: string,
  ids: string[],
): Promise<Map<string, ReelScriptRow>> {
  const result = new Map<string, ReelScriptRow>();
  if (ids.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("id, client_id, strategy_id, slot_index")
    .eq("client_id", clientId)
    .in("id", ids);

  if (error || !data) {
    throw new Error("REEL_SCRIPTS_QUERY_FAILED");
  }

  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.client_id !== "string" ||
      typeof row.strategy_id !== "string" ||
      typeof row.slot_index !== "number"
    ) {
      continue;
    }
    if (row.client_id !== clientId) {
      continue;
    }
    result.set(row.id, {
      id: row.id,
      clientId: row.client_id,
      strategyId: row.strategy_id,
      slotIndex: row.slot_index,
    });
  }

  return result;
}

async function loadStrategiesByIds(
  clientId: string,
  ids: string[],
): Promise<Map<string, StrategyRow>> {
  const result = new Map<string, StrategyRow>();
  if (ids.length === 0) {
    return result;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select("id, client_id, brief")
    .eq("client_id", clientId)
    .in("id", ids);

  if (error || !data) {
    throw new Error("STRATEGIES_QUERY_FAILED");
  }

  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.client_id !== "string"
    ) {
      continue;
    }
    if (row.client_id !== clientId) {
      continue;
    }
    result.set(row.id, {
      id: row.id,
      clientId: row.client_id,
      brief: row.brief,
    });
  }

  return result;
}

/**
 * Aggregates Metrics Lite counters over the last 28 days grouped by slot tema.
 * Caller must run validateActiveOperatorClientId on user-facing paths first.
 */
export async function aggregateReelMetricsByTema(params: {
  clientId: string;
  weekStart: string;
}): Promise<StrategyPerformanceInsightsDto | null> {
  const clientParsed = agentClientIdSchema.safeParse(params.clientId);
  const weekParsed = trendWeekStartSchema.safeParse(params.weekStart);
  if (!clientParsed.success || !weekParsed.success) {
    throw new Error("INVALID_AGGREGATE_PARAMS");
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  const clientId = clientParsed.data;
  const weekStart = weekParsed.data;
  const { windowStart, windowEnd, windowStartTs, windowEndTs } =
    computeStrategyMetricsWindow(weekStart);

  const metricsRows = await loadMetricsInWindow({
    clientId,
    windowStartTs,
    windowEndTs,
  });

  if (metricsRows.length === 0) {
    return null;
  }

  const assembledReelIds = metricsRows.map((row) => row.assembledReelId);
  const assembledReels = await loadAssembledReelsByIds(clientId, assembledReelIds);

  const scriptIds = [
    ...new Set(
      [...assembledReels.values()].map((row) => row.reelScriptId),
    ),
  ];
  const scripts = await loadReelScriptsByIds(clientId, scriptIds);

  const strategyIds = [
    ...new Set([...scripts.values()].map((row) => row.strategyId)),
  ];
  const strategies = await loadStrategiesByIds(clientId, strategyIds);

  const groups = new Map<string, ThemeAccumulator>();

  for (const metric of metricsRows) {
    const assembled = assembledReels.get(metric.assembledReelId);
    if (!assembled || assembled.clientId !== clientId) {
      continue;
    }

    const script = scripts.get(assembled.reelScriptId);
    if (!script || script.clientId !== clientId) {
      continue;
    }

    const strategy = strategies.get(script.strategyId);
    if (!strategy || strategy.clientId !== clientId) {
      continue;
    }

    const tema = extractTemaFromBrief(strategy.brief, script.slotIndex);
    if (tema === null) {
      continue;
    }

    const groupKey = normalizeTemaKey(tema);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.reelIds.add(metric.assembledReelId);
      existing.views += metric.views;
      existing.likes += metric.likes;
      existing.comments += metric.comments;
      existing.saves += metric.saves;
      existing.dms += metric.dms;
    } else {
      groups.set(groupKey, {
        displayTema: tema,
        reelIds: new Set([metric.assembledReelId]),
        views: metric.views,
        likes: metric.likes,
        comments: metric.comments,
        saves: metric.saves,
        dms: metric.dms,
      });
    }
  }

  if (groups.size === 0) {
    return null;
  }

  const topThemes = rankTopThemes(groups);
  const dto = strategyPerformanceInsightsDtoSchema.parse({
    available: true,
    windowStart,
    windowEnd,
    topThemes,
  });

  console.info("[strategy-insights] aggregated", {
    clientId,
    windowStart,
    windowEnd,
    topCount: topThemes.length,
  });

  return dto;
}
