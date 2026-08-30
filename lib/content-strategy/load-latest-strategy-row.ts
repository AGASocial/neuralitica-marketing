import "server-only";

import {
  contentStrategyBriefSchema,
  contentStrategyStatusSchema,
  type ContentStrategyDraftView,
} from "@/lib/contracts/content-strategy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type StrategySelectRow = {
  id: unknown;
  client_id: unknown;
  week_start: unknown;
  version: unknown;
  status: unknown;
  brief: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function toIso8601(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function formatWeekStart(value: unknown): string | null {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function mapStrategyRow(row: StrategySelectRow): ContentStrategyDraftView | null {
  const createdAt = toIso8601(row.created_at);
  const updatedAt = toIso8601(row.updated_at);
  const weekStart = formatWeekStart(row.week_start);
  if (!createdAt || !updatedAt || !weekStart) {
    return null;
  }

  const briefParsed = contentStrategyBriefSchema.safeParse(row.brief);
  const statusParsed = contentStrategyStatusSchema.safeParse(row.status);
  if (!briefParsed.success || !statusParsed.success) {
    return null;
  }

  if (typeof row.id !== "string" || typeof row.client_id !== "string") {
    return null;
  }
  if (typeof row.version !== "number" || !Number.isInteger(row.version)) {
    return null;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    weekStart,
    version: row.version,
    status: statusParsed.data,
    brief: briefParsed.data,
    createdAt,
    updatedAt,
  };
}

export async function loadLatestStrategyRow(params: {
  clientId: string;
  weekStart: string;
}): Promise<ContentStrategyDraftView | null> {
  if (!isSupabaseConfigured()) {
    console.error("[content-strategy] load unavailable: Supabase not configured");
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select(
      "id, client_id, week_start, version, status, brief, created_at, updated_at",
    )
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[content-strategy] load latest failed", {
      code: error.code,
      clientId: params.clientId,
      weekStart: params.weekStart,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return mapStrategyRow(data as StrategySelectRow);
}

export async function loadNextStrategyVersion(params: {
  clientId: string;
  weekStart: string;
}): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 1;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select("version")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return 1;
  }

  const version = (data as { version: number }).version;
  return typeof version === "number" && version >= 1 ? version + 1 : 1;
}
