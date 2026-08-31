import "server-only";

import {
  REEL_METRICS_UPSERT_AGENT_KEY,
  REEL_METRICS_UPSERT_MAX_PER_WINDOW,
  REEL_METRICS_UPSERT_RATE_WINDOW_MS,
} from "@/lib/contracts/reel-metrics";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ReelMetricsUpsertRateLimitCheckResult =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED" };

export async function checkReelMetricsUpsertRateLimit(params: {
  clientId: string;
}): Promise<ReelMetricsUpsertRateLimitCheckResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true };
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - REEL_METRICS_UPSERT_RATE_WINDOW_MS,
  ).toISOString();

  const { data: windowRows, error: windowError } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("attempt_count, window_start")
    .eq("client_id", params.clientId)
    .eq("agent_key", REEL_METRICS_UPSERT_AGENT_KEY)
    .gte("window_start", windowCutoff);

  if (windowError) {
    console.error("[metrics] reel-metrics upsert rate window check failed", {
      code: windowError.code,
      clientId: params.clientId,
    });
    return { ok: true };
  }

  const totalAttempts = (windowRows ?? []).reduce(
    (sum, row) =>
      sum + Number((row as { attempt_count: number }).attempt_count),
    0,
  );

  if (totalAttempts >= REEL_METRICS_UPSERT_MAX_PER_WINDOW) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  return { ok: true };
}

function currentWindowStart(now: Date): string {
  const bucketMs =
    Math.floor(now.getTime() / REEL_METRICS_UPSERT_RATE_WINDOW_MS) *
    REEL_METRICS_UPSERT_RATE_WINDOW_MS;
  return new Date(bucketMs).toISOString();
}

export async function recordReelMetricsUpsertAttempt(params: {
  clientId: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowStart = currentWindowStart(now);

  const { data: existing } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("id, attempt_count")
    .eq("client_id", params.clientId)
    .eq("agent_key", REEL_METRICS_UPSERT_AGENT_KEY)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; attempt_count: number };
    await supabase
      .from("neuramark_agent_rate_limits")
      .update({ attempt_count: row.attempt_count + 1 })
      .eq("id", row.id);
    return;
  }

  await supabase.from("neuramark_agent_rate_limits").insert({
    client_id: params.clientId,
    agent_key: REEL_METRICS_UPSERT_AGENT_KEY,
    window_start: windowStart,
    attempt_count: 1,
    in_flight_key: null,
    in_flight_at: null,
  });
}
