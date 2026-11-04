/**
 * KAN-108 F1 — Piloto automático engine (pure orchestration, injected I/O).
 *
 * Hard guarantees:
 * - Never publishes (no Instagram / Graph calls; approval only marks the reel
 *   `approved`, exactly like a human Aprobar).
 * - Never starts paid generation: if approving would need any further render
 *   (assembly not completed / no final output), the item is skipped and the
 *   owner is notified instead.
 * - Honors the same QA gate a human approval requires.
 * - Every automatic decision is logged as an automation event (feeds "Lo que hice").
 */

import {
  resolveAutoApproveRule,
  type AutoApproveRuleReason,
} from "@/lib/automation/auto-approve-rules";
import type {
  AutomationContentType,
  AutomationSettings,
} from "@/lib/contracts/automation-settings";

export type AutoApproveSkipReason =
  | Exclude<AutoApproveRuleReason, "eligible">
  | "would_start_paid_render"
  | "qa_gate_not_ready"
  | "not_pending"
  | "approve_write_failed"
  | "disabled_by_env";

export type AutoApproveItemFacts = {
  approvalId: string;
  clientId: string;
  status: string;
  assembledReelId: string;
  contentType: AutomationContentType | null;
  title: string | null;
  /** True only when the final video is rendered (no more paid work needed). */
  renderComplete: boolean;
  qaGateReady: boolean;
  itemCostCents: number | null;
  weeklySpendCents: number | null;
};

export type AutoApproveEngineDeps = {
  loadSettings: (clientId: string) => Promise<AutomationSettings>;
  loadFacts: (params: {
    approvalId: string;
    clientId: string;
  }) => Promise<AutoApproveItemFacts | null>;
  /** Same DB transition a human approval uses (pending_client → approved). */
  approve: (params: {
    approvalId: string;
    clientId: string;
  }) => Promise<{ ok: boolean; decidedAt?: string }>;
  recordEvent: (params: {
    clientId: string;
    approvalId: string;
    kind: "auto_approved" | "auto_approve_skipped" | "would_auto_approve";
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }) => Promise<void>;
  notifyApproved: (params: {
    clientId: string;
    approvalId: string;
    title: string | null;
  }) => Promise<void>;
};

export type AutoApproveOutcome =
  | { decision: "auto_approved"; dryRun: false }
  | { decision: "would_auto_approve"; dryRun: true }
  | { decision: "notify"; reason: AutoApproveSkipReason; dryRun: boolean };

export function isAutoApproveKillSwitchOn(
  raw: string | undefined = process.env.AUTOMATION_AUTO_APPROVE_DISABLED,
): boolean {
  return raw?.trim() === "true";
}

export async function runAutoApproveEngine(params: {
  approvalId: string;
  clientId: string;
  dryRun: boolean;
  deps: AutoApproveEngineDeps;
  killSwitch?: boolean;
}): Promise<AutoApproveOutcome> {
  const { deps, approvalId, clientId, dryRun } = params;
  const settings = await deps.loadSettings(clientId);

  // Fast path: review_all never needs the facts lookup.
  if (settings.preset === "review_all") {
    return { decision: "notify", reason: "preset_review_all", dryRun };
  }

  const facts = await deps.loadFacts({ approvalId, clientId });
  if (!facts || facts.status !== "pending_client") {
    return { decision: "notify", reason: "not_pending", dryRun };
  }

  const rule = resolveAutoApproveRule({
    settings,
    contentType: facts.contentType,
    itemCostCents: facts.itemCostCents,
    weeklySpendCents: facts.weeklySpendCents,
  });

  const basePayload = {
    preset: settings.preset,
    contentType: facts.contentType,
    itemCostCents: facts.itemCostCents,
    weeklySpendCents: facts.weeklySpendCents,
    maxAutoApproveCostCents: settings.maxAutoApproveCostCents,
    weeklySpendCapCents: settings.weeklySpendCapCents,
    title: facts.title,
    dryRun,
  };

  const skip = async (
    reason: AutoApproveSkipReason,
  ): Promise<AutoApproveOutcome> => {
    // custom "review" is the owner's explicit choice — not an automatic decision to log.
    if (reason !== "custom_rule_review") {
      await deps.recordEvent({
        clientId,
        approvalId,
        kind: "auto_approve_skipped",
        payload: { ...basePayload, reason },
        idempotencyKey: `auto_approve_skipped${dryRun ? "_dry" : ""}:${approvalId}`,
      });
    }
    return { decision: "notify", reason, dryRun };
  };

  if (!rule.eligible) {
    return skip(rule.reason as AutoApproveSkipReason);
  }
  if (!facts.renderComplete) {
    return skip("would_start_paid_render");
  }
  if (!facts.qaGateReady) {
    return skip("qa_gate_not_ready");
  }
  if (params.killSwitch ?? isAutoApproveKillSwitchOn()) {
    return skip("disabled_by_env");
  }

  if (dryRun) {
    await deps.recordEvent({
      clientId,
      approvalId,
      kind: "would_auto_approve",
      payload: basePayload,
      idempotencyKey: `would_auto_approve:${approvalId}`,
    });
    return { decision: "would_auto_approve", dryRun: true };
  }

  const approved = await deps.approve({ approvalId, clientId });
  if (!approved.ok) {
    return skip("approve_write_failed");
  }
  await deps.recordEvent({
    clientId,
    approvalId,
    kind: "auto_approved",
    payload: { ...basePayload, decidedAt: approved.decidedAt ?? null },
    idempotencyKey: `auto_approved:${approvalId}`,
  });
  await deps.notifyApproved({ clientId, approvalId, title: facts.title });
  return { decision: "auto_approved", dryRun: false };
}
