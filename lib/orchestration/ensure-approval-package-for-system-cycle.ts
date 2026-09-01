import "server-only";

/**
 * US-15.1 Phase B — new server-only trusted approval ensure.
 * Named in CONTRACT.md § "Exact live step wiring and gates":
 * `ensureApprovalPackageForSystemCycle({ clientId, assembledReelId, invokedBy: "system" })`,
 * "reusing US-11.1 scoped ensure internals". The existing
 * `ensureApprovalPackageForAssembledReelForClient` (lib/approvals/ensure-approval-package.ts)
 * requires a session-bound `CurrentUser` and is Operator/Cliente-facing —
 * this wrapper reuses the same table helpers directly with a server-resolved
 * `clientId`, with no session dependency.
 *
 * Deliberately stricter than the Operator gate: the System path only ever
 * proceeds on a clean QA pass (`status === "passed"`). It never consumes an
 * Operator override — overrides on overridable QA checks remain an explicit
 * Operator judgment call, never an autonomous one.
 */
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import {
  checkApprovalRateLimit,
} from "@/lib/approvals/check-approval-rate-limit";
import {
  insertPendingApproval,
  loadApprovalByAssembledReelScoped,
} from "@/lib/approvals/persist-approval";
import { APPROVAL_ENSURE_AGENT_KEY } from "@/lib/contracts/approval";
import { resolveSelectedCtaVariant } from "@/lib/contracts/reel-caption";
import { loadQaReportForAssembledReel } from "@/lib/qa/persist-qa-report";
import { getReelCaptionByScriptId } from "@/lib/reel-captions/persist-reel-caption";
import type { WeeklyCycleErrorCode } from "@/lib/orchestration/weekly-cycle-live-types";

export type EnsureApprovalPackageForSystemCycleResult =
  | { ok: true; approvalId: string; idempotent: boolean }
  | { ok: false; errorCode: WeeklyCycleErrorCode };

export async function ensureApprovalPackageForSystemCycle(params: {
  clientId: string;
  assembledReelId: string;
}): Promise<EnsureApprovalPackageForSystemCycleResult> {
  const { clientId, assembledReelId } = params;

  const rateCheck = await checkApprovalRateLimit({
    clientId,
    agentKey: APPROVAL_ENSURE_AGENT_KEY,
  });
  if (!rateCheck.ok) {
    return { ok: false, errorCode: "PROVIDER_TRANSIENT" };
  }

  const assembly = await loadAssemblyJobScoped({ jobId: assembledReelId, clientId });
  if (!assembly) {
    return { ok: false, errorCode: "DEPENDENCY_FAILED" };
  }
  if (assembly.status !== "completed") {
    return { ok: false, errorCode: "DEPENDENCY_FAILED" };
  }
  if (assembly.brandingStatus !== "completed" || !assembly.outputMediaAssetId) {
    return { ok: false, errorCode: "DEPENDENCY_FAILED" };
  }

  const qaReport = await loadQaReportForAssembledReel({ assembledReelId, clientId });
  if (!qaReport || qaReport.status !== "passed") {
    return { ok: false, errorCode: "QA_FAILED" };
  }

  const caption = await getReelCaptionByScriptId({
    clientId,
    reelScriptId: assembly.reelScriptId,
  });
  if (!caption) {
    return { ok: false, errorCode: "DEPENDENCY_FAILED" };
  }
  if (caption.selectedCtaIndex === null) {
    return { ok: false, errorCode: "DEPENDENCY_FAILED" };
  }
  const selectedCtaText = resolveSelectedCtaVariant(
    caption.record,
    caption.selectedCtaIndex,
  );
  if (!selectedCtaText) {
    return { ok: false, errorCode: "DEPENDENCY_FAILED" };
  }

  const existing = await loadApprovalByAssembledReelScoped({ assembledReelId, clientId });
  if (existing) {
    return { ok: true, approvalId: existing.id, idempotent: true };
  }

  const inserted = await insertPendingApproval({ clientId, assembledReelId });
  if (!inserted) {
    return { ok: false, errorCode: "INTERNAL_ERROR" };
  }

  return { ok: true, approvalId: inserted.id, idempotent: false };
}
