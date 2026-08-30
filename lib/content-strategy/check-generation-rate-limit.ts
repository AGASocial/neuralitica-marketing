import "server-only";

import {
  CONTENT_STRATEGY_AGENT_KEY,
  CONTENT_STRATEGY_IN_FLIGHT_TIMEOUT_MS,
  CONTENT_STRATEGY_MAX_GENERATES_PER_WINDOW,
  CONTENT_STRATEGY_RATE_WINDOW_MS,
} from "@/lib/contracts/content-strategy";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type RateLimitCheckResult =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED" | "GENERATION_IN_FLIGHT" };

function inFlightKey(clientId: string, weekStart: string): string {
  return `${clientId}:${weekStart}`;
}

function currentWindowStart(now: Date): string {
  const bucketMs =
    Math.floor(now.getTime() / CONTENT_STRATEGY_RATE_WINDOW_MS) *
    CONTENT_STRATEGY_RATE_WINDOW_MS;
  return new Date(bucketMs).toISOString();
}

function isInFlightActive(inFlightAt: string | null, now: Date): boolean {
  if (!inFlightAt) {
    return false;
  }
  const started = new Date(inFlightAt).getTime();
  if (Number.isNaN(started)) {
    return false;
  }
  return now.getTime() - started < CONTENT_STRATEGY_IN_FLIGHT_TIMEOUT_MS;
}

export async function checkGenerationRateLimit(params: {
  clientId: string;
  weekStart: string;
}): Promise<RateLimitCheckResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true };
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - CONTENT_STRATEGY_RATE_WINDOW_MS,
  ).toISOString();
  const flightKey = inFlightKey(params.clientId, params.weekStart);

  const { data: inFlightRows, error: inFlightError } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("in_flight_key, in_flight_at")
    .eq("client_id", params.clientId)
    .eq("agent_key", CONTENT_STRATEGY_AGENT_KEY)
    .eq("in_flight_key", flightKey)
    .not("in_flight_at", "is", null);

  if (inFlightError) {
    console.error("[content-strategy] in-flight check failed", {
      code: inFlightError.code,
      clientId: params.clientId,
    });
    return { ok: true };
  }

  for (const row of inFlightRows ?? []) {
    const typed = row as { in_flight_at: string | null };
    if (isInFlightActive(typed.in_flight_at, now)) {
      return { ok: false, code: "GENERATION_IN_FLIGHT" };
    }
  }

  const { data: windowRows, error: windowError } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("attempt_count, window_start")
    .eq("client_id", params.clientId)
    .eq("agent_key", CONTENT_STRATEGY_AGENT_KEY)
    .gte("window_start", windowCutoff);

  if (windowError) {
    console.error("[content-strategy] rate window check failed", {
      code: windowError.code,
      clientId: params.clientId,
    });
    return { ok: true };
  }

  const totalAttempts = (windowRows ?? []).reduce(
    (sum, row) => sum + Number((row as { attempt_count: number }).attempt_count),
    0,
  );

  if (totalAttempts >= CONTENT_STRATEGY_MAX_GENERATES_PER_WINDOW) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  return { ok: true };
}

export async function acquireGenerationInFlight(params: {
  clientId: string;
  weekStart: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowStart = currentWindowStart(now);
  const flightKey = inFlightKey(params.clientId, params.weekStart);

  const { data: existing } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("id, attempt_count")
    .eq("client_id", params.clientId)
    .eq("agent_key", CONTENT_STRATEGY_AGENT_KEY)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("neuramark_agent_rate_limits")
      .update({
        in_flight_key: flightKey,
        in_flight_at: now.toISOString(),
      })
      .eq("id", (existing as { id: string }).id);
    return;
  }

  await supabase.from("neuramark_agent_rate_limits").insert({
    client_id: params.clientId,
    agent_key: CONTENT_STRATEGY_AGENT_KEY,
    window_start: windowStart,
    attempt_count: 0,
    in_flight_key: flightKey,
    in_flight_at: now.toISOString(),
  });
}

export async function recordGenerationSuccess(params: {
  clientId: string;
  weekStart: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowStart = currentWindowStart(now);
  const flightKey = inFlightKey(params.clientId, params.weekStart);

  const { data: existing } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("id, attempt_count")
    .eq("client_id", params.clientId)
    .eq("agent_key", CONTENT_STRATEGY_AGENT_KEY)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; attempt_count: number };
    await supabase
      .from("neuramark_agent_rate_limits")
      .update({
        attempt_count: row.attempt_count + 1,
        in_flight_key: null,
        in_flight_at: null,
      })
      .eq("id", row.id);
    return;
  }

  await supabase.from("neuramark_agent_rate_limits").insert({
    client_id: params.clientId,
    agent_key: CONTENT_STRATEGY_AGENT_KEY,
    window_start: windowStart,
    attempt_count: 1,
    in_flight_key: null,
    in_flight_at: null,
  });

  // Clear in-flight on any other window row for this flight key
  await supabase
    .from("neuramark_agent_rate_limits")
    .update({ in_flight_key: null, in_flight_at: null })
    .eq("client_id", params.clientId)
    .eq("agent_key", CONTENT_STRATEGY_AGENT_KEY)
    .eq("in_flight_key", flightKey);
}

export async function releaseGenerationInFlight(params: {
  clientId: string;
  weekStart: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const flightKey = inFlightKey(params.clientId, params.weekStart);

  await supabase
    .from("neuramark_agent_rate_limits")
    .update({ in_flight_key: null, in_flight_at: null })
    .eq("client_id", params.clientId)
    .eq("agent_key", CONTENT_STRATEGY_AGENT_KEY)
    .eq("in_flight_key", flightKey);
}
