import "server-only";

/**
 * US-15.1 Phase B — validated System auto-approval consumer.
 * Frozen in CONTRACT.md § "Frozen strategy decision — validated System
 * auto-approval": reload the exact persisted draft, validate it fully,
 * verify exact ownership + latest version + draft status, then CAS.
 * `generateReelScriptsForClient` must only ever consume the `strategyId`
 * this function returns — never an arbitrary draft.
 */
import { contentStrategyBriefSchema } from "@/lib/contracts/content-strategy";
import type { AutoApproveWeeklyCycleStrategyResult } from "@/lib/contracts/weekly-cycle-live";
import { loadLatestStrategyRow } from "@/lib/content-strategy/load-latest-strategy-row";
import { approveStrategyForSystemCycleCas } from "@/lib/content-strategy/approve-strategy-for-system-cycle-cas";

export type { AutoApproveWeeklyCycleStrategyResult };

export async function autoApproveWeeklyCycleStrategy(params: {
  runId: string;
  clientId: string;
  weekStart: string;
  strategyId: string;
}): Promise<AutoApproveWeeklyCycleStrategyResult> {
  const row = await loadLatestStrategyRow({
    clientId: params.clientId,
    weekStart: params.weekStart,
  });

  if (!row) {
    return { ok: false, code: "STRATEGY_INVALID" };
  }

  if (row.id !== params.strategyId) {
    // Either a newer draft was written after our generation (stale), or the
    // caller passed a strategyId that isn't this client/week's latest.
    return { ok: false, code: "STRATEGY_STALE" };
  }

  if (row.clientId !== params.clientId || row.weekStart !== params.weekStart) {
    return { ok: false, code: "STRATEGY_SCOPE_MISMATCH" };
  }

  const briefParsed = contentStrategyBriefSchema.safeParse(row.brief);
  if (!briefParsed.success) {
    return { ok: false, code: "STRATEGY_INVALID" };
  }

  if (row.status !== "draft") {
    // Already approved (e.g. by a concurrent winner or Operator) — only an
    // exact-run idempotent replay is acceptable; the CAS call resolves that.
  }

  const cas = await approveStrategyForSystemCycleCas({
    strategyId: row.id,
    clientId: params.clientId,
    weekStart: params.weekStart,
    expectedVersion: row.version,
    runId: params.runId,
  });

  if (!cas.ok) {
    return { ok: false, code: cas.code === "INTERNAL_ERROR" ? "STRATEGY_APPROVAL_CONFLICT" : cas.code };
  }

  return {
    ok: true,
    strategyId: row.id,
    version: row.version,
    outcome: cas.outcome,
  };
}
