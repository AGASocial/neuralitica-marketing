"use server";

/**
 * US-15.1 Phase B — Operator manual live trigger.
 * Frozen input/result shape in CONTRACT.md § "Manual trigger and loader".
 * `requireOperator("handler")` is the first await. No `invokedBy`, live
 * flag, provider/tier, budget/consent, retry, attempt, job id, `fromStep`,
 * skip, state or step-log input exists on this action's surface.
 */
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  triggerWeeklyCycleInputSchema,
  type TriggerWeeklyCycleResult,
} from "@/lib/contracts/weekly-cycle-live";
import { resolveWeekStartForCycle } from "@/lib/orchestration/resolve-week-start-for-cycle";
import { isWeeklyCycleLiveAllowedForClient, isWeeklyCycleLiveEnabled } from "@/lib/orchestration/weekly-cycle-live-env";
import { runWeeklyCycleLive } from "@/lib/orchestration/run-weekly-cycle-live";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export { triggerWeeklyCycleInputSchema };
export type { TriggerWeeklyCycleResult };

async function loadActiveAllowlistedClientId(clientId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("id, active")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; active: boolean };
  if (!row.active) return null;
  if (!isWeeklyCycleLiveAllowedForClient(row.id)) return null;
  return row.id;
}

export async function triggerWeeklyCycleForClient(
  rawInput: unknown,
): Promise<TriggerWeeklyCycleResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return { ok: false, error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } };
    }
    throw error;
  }

  const parsed = triggerWeeklyCycleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR" } };
  }

  const clientId = await loadActiveAllowlistedClientId(parsed.data.clientId);
  if (!clientId) {
    // Non-enumerating: nonexistent, inactive, and not-allowlisted all look identical.
    return { ok: false, error: { code: "NOT_FOUND" } };
  }

  const weekStart = parsed.data.weekStart ?? resolveWeekStartForCycle();

  if (!isWeeklyCycleLiveEnabled()) {
    return { ok: false, error: { code: "LIVE_DISABLED" } };
  }

  const result = await runWeeklyCycleLive({
    clientId,
    weekStart,
    invokedBy: "system",
    mode: "operator",
  });

  if (!result.ok) {
    if (result.error.code === "CLIENT_INACTIVE") {
      return { ok: false, error: { code: "NOT_FOUND" } };
    }
    return { ok: false, error: { code: result.error.code } };
  }

  return { ok: true, runId: result.runId, clientId, weekStart, outcome: result.outcome };
}
