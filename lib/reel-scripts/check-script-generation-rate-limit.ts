import "server-only";

import {
  VIDEO_SCRIPT_GENERATE_AGENT_KEY,
  VIDEO_SCRIPT_IN_FLIGHT_TIMEOUT_MS,
  VIDEO_SCRIPT_MAX_JOBS_PER_WINDOW,
  VIDEO_SCRIPT_RATE_WINDOW_MS,
} from "@/lib/contracts/reel-script";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ScriptRateLimitCheckResult =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED" | "GENERATION_IN_FLIGHT" };

export type ScriptInFlightScope =
  | { mode: "batch"; clientId: string; strategyId: string }
  | {
      mode: "slot";
      clientId: string;
      strategyId: string;
      slotIndex: number;
    };

function inFlightKey(scope: ScriptInFlightScope): string {
  if (scope.mode === "batch") {
    return `${scope.clientId}:${scope.strategyId}:batch`;
  }
  return `${scope.clientId}:${scope.strategyId}:${scope.slotIndex}`;
}

function currentWindowStart(now: Date): string {
  const bucketMs =
    Math.floor(now.getTime() / VIDEO_SCRIPT_RATE_WINDOW_MS) *
    VIDEO_SCRIPT_RATE_WINDOW_MS;
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
  return now.getTime() - started < VIDEO_SCRIPT_IN_FLIGHT_TIMEOUT_MS;
}

export async function checkScriptGenerationRateLimit(params: {
  clientId: string;
  scope: ScriptInFlightScope;
}): Promise<ScriptRateLimitCheckResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true };
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - VIDEO_SCRIPT_RATE_WINDOW_MS,
  ).toISOString();
  const flightKey = inFlightKey(params.scope);

  const { data: inFlightRows, error: inFlightError } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("in_flight_key, in_flight_at")
    .eq("client_id", params.clientId)
    .eq("agent_key", VIDEO_SCRIPT_GENERATE_AGENT_KEY)
    .eq("in_flight_key", flightKey)
    .not("in_flight_at", "is", null);

  if (inFlightError) {
    console.error("[reel-scripts] in-flight check failed", {
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
    .eq("agent_key", VIDEO_SCRIPT_GENERATE_AGENT_KEY)
    .gte("window_start", windowCutoff);

  if (windowError) {
    console.error("[reel-scripts] rate window check failed", {
      code: windowError.code,
      clientId: params.clientId,
    });
    return { ok: true };
  }

  const totalAttempts = (windowRows ?? []).reduce(
    (sum, row) => sum + Number((row as { attempt_count: number }).attempt_count),
    0,
  );

  if (totalAttempts >= VIDEO_SCRIPT_MAX_JOBS_PER_WINDOW) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  return { ok: true };
}

export async function acquireScriptGenerationInFlight(
  scope: ScriptInFlightScope,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowStart = currentWindowStart(now);
  const flightKey = inFlightKey(scope);
  const clientId = scope.clientId;

  const { data: existing } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("id, attempt_count")
    .eq("client_id", clientId)
    .eq("agent_key", VIDEO_SCRIPT_GENERATE_AGENT_KEY)
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
    client_id: clientId,
    agent_key: VIDEO_SCRIPT_GENERATE_AGENT_KEY,
    window_start: windowStart,
    attempt_count: 0,
    in_flight_key: flightKey,
    in_flight_at: now.toISOString(),
  });
}

export async function recordScriptGenerationSuccess(
  scope: ScriptInFlightScope,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowStart = currentWindowStart(now);
  const flightKey = inFlightKey(scope);
  const clientId = scope.clientId;

  const { data: existing } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("id, attempt_count")
    .eq("client_id", clientId)
    .eq("agent_key", VIDEO_SCRIPT_GENERATE_AGENT_KEY)
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
    client_id: clientId,
    agent_key: VIDEO_SCRIPT_GENERATE_AGENT_KEY,
    window_start: windowStart,
    attempt_count: 1,
    in_flight_key: null,
    in_flight_at: null,
  });

  await supabase
    .from("neuramark_agent_rate_limits")
    .update({ in_flight_key: null, in_flight_at: null })
    .eq("client_id", clientId)
    .eq("agent_key", VIDEO_SCRIPT_GENERATE_AGENT_KEY)
    .eq("in_flight_key", flightKey);
}

export async function releaseScriptGenerationInFlight(
  scope: ScriptInFlightScope,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  const flightKey = inFlightKey(scope);

  await supabase
    .from("neuramark_agent_rate_limits")
    .update({ in_flight_key: null, in_flight_at: null })
    .eq("client_id", scope.clientId)
    .eq("agent_key", VIDEO_SCRIPT_GENERATE_AGENT_KEY)
    .eq("in_flight_key", flightKey);
}
