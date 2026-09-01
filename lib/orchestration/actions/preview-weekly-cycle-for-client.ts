"use server";

/**
 * US-15.1 Phase B — Operator manual dry-run preview.
 * Same first-await Operator auth and strict input schema as the live
 * trigger, but always calls the Phase A dry-run runner — never evaluates a
 * caller live flag and never imports live spend seams. An existing live row
 * returns `RUN_NOT_REPLANNABLE` (via the shared acquire's `replan: BLOCKED`
 * semantics) — it is not converted or mutated.
 */
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { resolveWeekStartForCycle } from "@/lib/orchestration/resolve-week-start-for-cycle";
import { runWeeklyCycleForClient } from "@/lib/orchestration/run-weekly-cycle-for-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WeeklyCycleStepPlan } from "@/lib/orchestration/plan-weekly-cycle-steps";
import { triggerWeeklyCycleInputSchema } from "@/lib/orchestration/actions/trigger-weekly-cycle-for-client";

export type PreviewWeeklyCycleResult =
  | { ok: true; runId: string; clientId: string; weekStart: string; plan: WeeklyCycleStepPlan }
  | {
      ok: false;
      error: {
        code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "RUN_NOT_REPLANNABLE" | "INTERNAL_ERROR";
      };
    };

async function loadActiveClientId(clientId: string): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("id, active")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; active: boolean };
  return row.active ? row.id : null;
}

export async function previewWeeklyCycleForClient(
  rawInput: unknown,
): Promise<PreviewWeeklyCycleResult> {
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

  const clientId = await loadActiveClientId(parsed.data.clientId);
  if (!clientId) {
    return { ok: false, error: { code: "NOT_FOUND" } };
  }

  const weekStart = parsed.data.weekStart ?? resolveWeekStartForCycle();

  const result = await runWeeklyCycleForClient({
    clientId,
    weekStart,
    invokedBy: "system",
    mode: "operator",
    dryRun: true,
  });

  if (!result.ok) {
    return { ok: false, error: { code: result.error.code } };
  }

  return { ok: true, runId: result.runId, clientId, weekStart, plan: result.plan };
}
