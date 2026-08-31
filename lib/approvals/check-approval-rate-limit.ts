import "server-only";

import {
  APPROVAL_DECIDE_AGENT_KEY,
  APPROVAL_ENSURE_AGENT_KEY,
  APPROVAL_MAX_PER_WINDOW,
  APPROVAL_OPERATOR_GRANT_AGENT_KEY,
  APPROVAL_OPERATOR_GRANT_MAX_PER_WINDOW,
  APPROVAL_RATE_WINDOW_MS,
} from "@/lib/contracts/approval";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ApprovalRateLimitCheckResult =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED" };

export type ApprovalRateAgentKey =
  | typeof APPROVAL_ENSURE_AGENT_KEY
  | typeof APPROVAL_DECIDE_AGENT_KEY
  | typeof APPROVAL_OPERATOR_GRANT_AGENT_KEY;

function maxAttemptsForAgent(agentKey: ApprovalRateAgentKey): number {
  if (agentKey === APPROVAL_OPERATOR_GRANT_AGENT_KEY) {
    return APPROVAL_OPERATOR_GRANT_MAX_PER_WINDOW;
  }
  return APPROVAL_MAX_PER_WINDOW;
}

export async function checkApprovalRateLimit(params: {
  clientId: string;
  agentKey: ApprovalRateAgentKey;
}): Promise<ApprovalRateLimitCheckResult> {
  if (!isSupabaseConfigured()) {
    return { ok: true };
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();
  const windowCutoff = new Date(
    now.getTime() - APPROVAL_RATE_WINDOW_MS,
  ).toISOString();

  const { data: windowRows, error: windowError } = await supabase
    .from("neuramark_agent_rate_limits")
    .select("attempt_count, window_start")
    .eq("client_id", params.clientId)
    .eq("agent_key", params.agentKey)
    .gte("window_start", windowCutoff);

  if (windowError) {
    console.error("[approvals] rate window check failed", {
      code: windowError.code,
      clientId: params.clientId,
      agentKey: params.agentKey,
    });
    return { ok: true };
  }

  const totalAttempts = (windowRows ?? []).reduce(
    (sum, row) =>
      sum + Number((row as { attempt_count: number }).attempt_count),
    0,
  );

  if (totalAttempts >= maxAttemptsForAgent(params.agentKey)) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  return { ok: true };
}

function currentWindowStart(now: Date): string {
  const bucketMs =
    Math.floor(now.getTime() / APPROVAL_RATE_WINDOW_MS) *
    APPROVAL_RATE_WINDOW_MS;
  return new Date(bucketMs).toISOString();
}

export async function recordApprovalAttempt(params: {
  clientId: string;
  agentKey: ApprovalRateAgentKey;
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
    .eq("agent_key", params.agentKey)
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
    agent_key: params.agentKey,
    window_start: windowStart,
    attempt_count: 1,
    in_flight_key: null,
    in_flight_at: null,
  });
}
