import "server-only";

import type {
  AutoApproveEngineDeps,
  AutoApproveItemFacts,
} from "@/lib/automation/auto-approve-engine";
import {
  insertHoyNotification,
  recordAutomationEvent,
} from "@/lib/automation/events";
import { loadAutomationSettingsForClient } from "@/lib/automation/settings";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import {
  loadApprovalByIdScoped,
  updateApprovalDecision,
} from "@/lib/approvals/persist-approval";
import { resolveApprovalListCardMeta } from "@/lib/approvals/resolve-approval-list-card-meta";
import { getQaGateStatusForAssembledReelScoped } from "@/lib/qa/get-qa-gate-status-for-assembled-reel";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function spendCents(row: Record<string, unknown>): number {
  const actual = row.actual_cost_cents;
  const estimated = row.estimated_cost_cents;
  if (typeof actual === "number" && Number.isFinite(actual)) return actual;
  if (typeof estimated === "number" && Number.isFinite(estimated)) {
    return estimated;
  }
  return 0;
}

/** Spend already incurred for this reel script (actual, else estimate). */
async function loadItemCostCents(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_spend_events")
    .select("actual_cost_cents, estimated_cost_cents")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId);
  if (error || !Array.isArray(data)) return null;
  return data.reduce(
    (sum, row) => sum + spendCents(row as Record<string, unknown>),
    0,
  );
}

/** Rolling 7-day spend for the client. */
async function loadWeeklySpendCents(clientId: string): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_spend_events")
    .select("actual_cost_cents, estimated_cost_cents")
    .eq("client_id", clientId)
    .gte("created_at", since);
  if (error || !Array.isArray(data)) return null;
  return data.reduce(
    (sum, row) => sum + spendCents(row as Record<string, unknown>),
    0,
  );
}

async function loadFacts(params: {
  approvalId: string;
  clientId: string;
}): Promise<AutoApproveItemFacts | null> {
  const approval = await loadApprovalByIdScoped(params);
  if (!approval) return null;
  const assembly = await loadAssemblyJobScoped({
    jobId: approval.assembledReelId,
    clientId: params.clientId,
  });
  const meta = await resolveApprovalListCardMeta({
    clientId: params.clientId,
    assembly,
    fallbackCreatedAt: approval.createdAt,
  });
  const renderComplete = Boolean(
    assembly &&
      assembly.status === "completed" &&
      assembly.outputMediaAssetId &&
      (assembly.brandingStatus == null ||
        assembly.brandingStatus === "completed"),
  );
  const gate = await getQaGateStatusForAssembledReelScoped({
    assembledReelId: approval.assembledReelId,
    clientId: params.clientId,
  });
  const [itemCostCents, weeklySpendCents] = await Promise.all([
    assembly
      ? loadItemCostCents({
          clientId: params.clientId,
          reelScriptId: assembly.reelScriptId,
        })
      : Promise.resolve(null),
    loadWeeklySpendCents(params.clientId),
  ]);
  return {
    approvalId: approval.id,
    clientId: params.clientId,
    status: approval.status,
    assembledReelId: approval.assembledReelId,
    contentType: meta.formatKey ?? null,
    title: meta.title?.trim() ? meta.title.trim() : null,
    renderComplete,
    qaGateReady: gate.ready === true,
    itemCostCents,
    weeklySpendCents,
  };
}

export const serverAutoApproveDeps: AutoApproveEngineDeps = {
  loadSettings: loadAutomationSettingsForClient,
  loadFacts,
  approve: async ({ approvalId, clientId }) => {
    // Same closed transition as a human "Aprobar" (decide-approval.ts) —
    // pending_client → approved. Approval never publishes nor renders.
    const updated = await updateApprovalDecision({
      approvalId,
      clientId,
      decision: "approved",
      decidedBy: clientId,
      clientFeedback: null,
    });
    if (!updated) return { ok: false };
    const decidedAt = updated.decidedAt ?? new Date().toISOString();
    console.log(
      JSON.stringify({
        event: "approval_ready_to_publish",
        approvalId: updated.id,
        assembledReelId: updated.assembledReelId,
        clientId,
        decidedAt,
        source: "automation",
      }),
    );
    return { ok: true, decidedAt };
  },
  recordEvent: async (p) => {
    await recordAutomationEvent({
      clientId: p.clientId,
      approvalId: p.approvalId,
      kind: p.kind,
      channel: "automation",
      payload: p.payload,
      idempotencyKey: p.idempotencyKey,
    });
  },
  notifyApproved: async ({ clientId, approvalId, title }) => {
    await insertHoyNotification({
      clientId,
      kind: "auto_approved",
      title: "Aprobé un video por ti",
      body: title
        ? `Piloto automático aprobó “${title}”. No publiqué nada.`
        : "Piloto automático aprobó un video. No publiqué nada.",
      approvalIds: [approvalId],
    });
  },
};
