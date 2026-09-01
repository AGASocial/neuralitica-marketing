import "server-only";

/**
 * US-15.1 Phase B — server loader for the minimal Operator DTO.
 * Frozen shape in CONTRACT.md § "Minimal Operator DTO":
 * `operatorWeeklyCycleRunDtoSchema`. V1 scoped to active clients, at most
 * 50 newest rows, no cross-tenant Cliente surface, no raw `step_log`.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  WEEKLY_CYCLE_RUNS_TABLE,
  MAX_WEEKLY_CYCLE_ATTEMPTS,
} from "@/lib/orchestration/weekly-cycle-live-types";
import { listStepRunsForRun, type WeeklyCycleStepRunRow } from "@/lib/orchestration/weekly-cycle-step-runs";
import type { WeeklyCycleRunMode } from "@/lib/orchestration/acquire-weekly-cycle-run";
import type { OperatorWeeklyCycleRunDto } from "@/lib/contracts/weekly-cycle-live";

export type { OperatorWeeklyCycleRunDto };
export type OperatorWeeklyCycleRunSlotDto = OperatorWeeklyCycleRunDto["slots"][number];

function deriveSlotDto(
  slotIndex: number,
  rows: WeeklyCycleStepRunRow[],
): OperatorWeeklyCycleRunSlotDto {
  const slotRows = rows.filter((r) => r.slotIndex === slotIndex);
  if (slotRows.length === 0) {
    return { slotIndex, status: "pending", currentStep: null };
  }

  const approval = slotRows.find((r) => r.step === "approval" && r.status === "completed");
  if (approval) {
    return { slotIndex, status: "ready_for_approval", currentStep: "approval" };
  }

  // Latest touched row by created order (list is already created_at asc).
  const latest = slotRows[slotRows.length - 1]!;
  const anyPending = slotRows.some((r) =>
    ["ready", "dispatch_pending", "pending_provider", "pending_worker"].includes(r.status),
  );
  const anyFailed = slotRows.some((r) => r.status === "failed");

  if (!anyPending && anyFailed) {
    const failedRow = [...slotRows].reverse().find((r) => r.status === "failed")!;
    return {
      slotIndex,
      status: "failed",
      currentStep: failedRow.step,
      ...(failedRow.errorCode ? { errorCode: failedRow.errorCode } : {}),
    };
  }

  return { slotIndex, status: "processing", currentStep: latest.step };
}

export async function loadOperatorWeeklyCycleRuns(): Promise<OperatorWeeklyCycleRunDto[]> {
  const supabase = createServerSupabaseClient();

  const { data: runs, error } = await supabase
    .from(WEEKLY_CYCLE_RUNS_TABLE)
    .select(
      "id, client_id, week_start, mode, status, started_at, finished_at, neuramark_clients!inner(display_name, active)",
    )
    .eq("neuramark_clients.active", true)
    .in("status", ["running", "paused", "completed", "partial_failed", "failed"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !runs) {
    return [];
  }

  const dtos: OperatorWeeklyCycleRunDto[] = [];
  for (const raw of runs as Record<string, unknown>[]) {
    const runId = raw.id as string;
    const clientId = raw.client_id as string;
    const status = raw.status as OperatorWeeklyCycleRunDto["status"];
    const clientRel = raw.neuramark_clients as { display_name?: string } | { display_name?: string }[] | null;
    const clientDisplayName = Array.isArray(clientRel)
      ? (clientRel[0]?.display_name ?? "")
      : (clientRel?.display_name ?? "");

    const stepRuns = await listStepRunsForRun(runId);
    const slots = [0, 1, 2].map((slotIndex) => deriveSlotDto(slotIndex, stepRuns)) as [
      OperatorWeeklyCycleRunSlotDto,
      OperatorWeeklyCycleRunSlotDto,
      OperatorWeeklyCycleRunSlotDto,
    ];

    const canResume =
      status === "paused" ||
      (status === "partial_failed" &&
        stepRuns.some((r) => r.status === "failed" && r.attempt < MAX_WEEKLY_CYCLE_ATTEMPTS && r.slotIndex !== null));

    dtos.push({
      runId,
      clientId,
      clientDisplayName,
      weekStart: raw.week_start as string,
      mode: raw.mode as WeeklyCycleRunMode,
      status,
      startedAt: (raw.started_at as string | null) ?? null,
      finishedAt: (raw.finished_at as string | null) ?? null,
      slots,
      canResume,
    });
  }

  return dtos;
}
