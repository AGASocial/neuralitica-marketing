import "server-only";

import {
  QA_IN_FLIGHT_TIMEOUT_MS,
  QA_MAX_JOBS_PER_WINDOW,
  QA_RATE_WINDOW_MS,
  QA_RUN_AGENT_KEY,
} from "@/lib/contracts/qa-report";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type QaRateLimitCheckResult =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED" };

function currentWindowStart(now: Date): string {
  const bucketMs =
    Math.floor(now.getTime() / QA_RATE_WINDOW_MS) * QA_RATE_WINDOW_MS;
  return new Date(bucketMs).toISOString();
}

export function isQaInFlightActive(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
  timeoutMs: number = QA_IN_FLIGHT_TIMEOUT_MS,
): boolean {
  if (!updatedAt) return false;
  const started = new Date(updatedAt).getTime();
  if (Number.isNaN(started)) return false;
  return now.getTime() - started < timeoutMs;
}

export async function checkQaRunRateLimit(params: {
  clientId: string;
}): Promise<QaRateLimitCheckResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true };
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - QA_RATE_WINDOW_MS,
  ).toISOString();

  const { data: windowRows, error: windowError } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("attempt_count, window_start")
    .eq("client_id", params.clientId)
    .eq("agent_key", QA_RUN_AGENT_KEY)
    .gte("window_start", windowCutoff);

  if (windowError) {
    console.error("[qa] rate window check failed", {
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

  if (totalAttempts >= QA_MAX_JOBS_PER_WINDOW) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  return { ok: true };
}

export async function recordQaRunAttempt(params: {
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
    .eq("agent_key", QA_RUN_AGENT_KEY)
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
    agent_key: QA_RUN_AGENT_KEY,
    window_start: windowStart,
    attempt_count: 1,
    in_flight_key: null,
    in_flight_at: null,
  });
}
