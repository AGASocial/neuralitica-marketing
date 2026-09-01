import "server-only";

/**
 * US-15.1 Phase B — CAS helpers over `neuramark_weekly_cycle_outbox`.
 * Durable claim/dispatch queue: crash between DB write and provider enqueue
 * is recoverable without duplicate spend (CONTRACT § "Per-slot step state
 * and durable dispatch").
 */
import { randomUUID } from "node:crypto";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  WEEKLY_CYCLE_OUTBOX_TABLE,
  type WeeklyCycleErrorCode,
} from "@/lib/orchestration/weekly-cycle-live-types";

export type WeeklyCycleOutboxEventKind =
  | "dispatch_provider"
  | "dispatch_worker"
  | "resume_successor";

export type WeeklyCycleOutboxRow = {
  id: string;
  runId: string;
  stepRunId: string;
  eventKind: WeeklyCycleOutboxEventKind;
  payload: { stepRunId: string; idempotencyKey: string };
  status: "pending" | "claimed" | "dispatched" | "failed";
  dispatchAttempt: number;
  availableAt: string;
  claimToken: string | null;
  claimedAt: string | null;
};

function mapRow(row: Record<string, unknown>): WeeklyCycleOutboxRow {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stepRunId: row.step_run_id as string,
    eventKind: row.event_kind as WeeklyCycleOutboxEventKind,
    payload: row.payload as { stepRunId: string; idempotencyKey: string },
    status: row.status as WeeklyCycleOutboxRow["status"],
    dispatchAttempt: row.dispatch_attempt as number,
    availableAt: row.available_at as string,
    claimToken: (row.claim_token as string | null) ?? null,
    claimedAt: (row.claimed_at as string | null) ?? null,
  };
}

const STALE_CLAIM_MS = 5 * 60 * 1000;

/** Insert-or-return-existing outbox row for a step run (unique on step_run_id). */
export async function enqueueOutboxForStepRun(params: {
  runId: string;
  stepRunId: string;
  eventKind: WeeklyCycleOutboxEventKind;
  idempotencyKey: string;
}): Promise<WeeklyCycleOutboxRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .insert({
      run_id: params.runId,
      step_run_id: params.stepRunId,
      event_kind: params.eventKind,
      payload: { stepRunId: params.stepRunId, idempotencyKey: params.idempotencyKey },
      status: "pending",
      dispatch_attempt: 0,
    })
    .select("*")
    .maybeSingle();

  if (data) {
    return mapRow(data as Record<string, unknown>);
  }

  if (error && error.code !== "23505") {
    console.error("[weekly-cycle] outbox enqueue failed", {
      code: error.code,
      stepRunId: params.stepRunId,
    });
    return null;
  }

  const { data: existing, error: loadError } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .select("*")
    .eq("step_run_id", params.stepRunId)
    .maybeSingle();
  if (loadError || !existing) return null;
  return mapRow(existing as Record<string, unknown>);
}

/** Loads claimable rows: `pending`/stale-`claimed` and `available_at <= now`. */
export async function listClaimableOutboxRows(
  limit: number,
): Promise<WeeklyCycleOutboxRow[]> {
  const supabase = createServerSupabaseClient();
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();

  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .select("*")
    .in("status", ["pending", "claimed"])
    .lte("available_at", now.toISOString())
    .order("available_at", { ascending: true })
    .limit(limit * 3);

  if (error || !data) return [];

  const rows = (data as Record<string, unknown>[]).map(mapRow);
  return rows
    .filter((row) => {
      if (row.status === "pending") return true;
      // Stale claimed row — reclaimable. Staleness is measured against
      // `claimed_at` (when the claim was taken), matching the real atomic
      // claim in `claimOutboxRow`. `available_at` is unrelated to claim
      // staleness — it is set at enqueue/retry-scheduling time and never
      // updated on claim, so using it here would misclassify a
      // freshly-claimed row as stale whenever it sat `pending` for a while
      // before being picked up (QA M2).
      return (
        row.claimToken !== null &&
        row.claimedAt !== null &&
        row.claimedAt <= staleCutoff
      );
    })
    .slice(0, limit);
}

/** CAS claim with a random token — reclaims stale `claimed` rows too. */
export async function claimOutboxRow(
  outboxId: string,
): Promise<{ row: WeeklyCycleOutboxRow; claimToken: string } | null> {
  const supabase = createServerSupabaseClient();
  const claimToken = randomUUID();
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();

  const { data, error } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .update({ status: "claimed", claim_token: claimToken, claimed_at: now.toISOString() })
    .eq("id", outboxId)
    .lte("available_at", now.toISOString())
    .or(`status.eq.pending,and(status.eq.claimed,claimed_at.lte.${staleCutoff})`)
    .select("*")
    .maybeSingle();

  if (error || !data) return null;
  return { row: mapRow(data as Record<string, unknown>), claimToken };
}

export async function markOutboxDispatched(outboxId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .update({ status: "dispatched", dispatched_at: new Date().toISOString() })
    .eq("id", outboxId);
  return !error;
}

export async function markOutboxRetry(params: {
  outboxId: string;
  dispatchAttempt: number;
  availableAt: string;
  errorCode: WeeklyCycleErrorCode;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .update({
      status: "pending",
      dispatch_attempt: params.dispatchAttempt,
      available_at: params.availableAt,
      claim_token: null,
      last_error_code: params.errorCode,
    })
    .eq("id", params.outboxId);
  return !error;
}

export async function markOutboxFailed(params: {
  outboxId: string;
  errorCode: WeeklyCycleErrorCode;
}): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from(WEEKLY_CYCLE_OUTBOX_TABLE)
    .update({ status: "failed", last_error_code: params.errorCode })
    .eq("id", params.outboxId);
  return !error;
}
