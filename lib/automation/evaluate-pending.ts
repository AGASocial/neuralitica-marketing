import "server-only";

import { shouldAutoApproveCandidate } from "@/lib/automation/auto-approve-rules";
import {
  insertHoyNotification,
  recordAutomationEvent,
} from "@/lib/automation/events";
import { loadAutomationSettingsForClient } from "@/lib/automation/settings";
import type { AutomationSettings } from "@/lib/contracts/automation-settings";
import { sendOwnerNotificationEmail } from "@/lib/notifications/email/send-owner-email";

export { shouldAutoApproveCandidate };

/**
 * F0: live auto-approve writes are OFF. Even when rules match, we only log
 * `would_auto_approve`. Flip only via explicit future env — never set here.
 */
export function isAutomationAutoApproveLiveEnabled(): boolean {
  return process.env.AUTOMATION_AUTO_APPROVE_LIVE?.trim() === "true";
}

export type EvaluatePendingInput = {
  clientId: string;
  approvalId: string;
  /** Estimated item cost in cents when known; null = unknown. */
  itemCostCents?: number | null;
  /** Weekly spend so far in cents when known. */
  weeklySpendCents?: number | null;
  locale?: "en" | "es";
  ownerEmail?: string | null;
};

export type EvaluatePendingResult = {
  decision: "would_auto_approve" | "notify";
  dryRun: true;
  settingsPreset: AutomationSettings["preset"];
};

export async function evaluatePendingApprovalAutomation(
  input: EvaluatePendingInput,
): Promise<EvaluatePendingResult> {
  const settings = await loadAutomationSettingsForClient(input.clientId);
  const locale = input.locale === "en" ? "en" : "es";
  const eligible = shouldAutoApproveCandidate({
    settings,
    itemCostCents: input.itemCostCents,
    weeklySpendCents: input.weeklySpendCents,
  });

  // F0 hard constraint: never execute real auto-approve / publish.
  void isAutomationAutoApproveLiveEnabled;

  if (eligible) {
    await recordAutomationEvent({
      clientId: input.clientId,
      approvalId: input.approvalId,
      kind: "would_auto_approve",
      channel: "dry_run",
      payload: {
        dryRun: true,
        liveEnabled: false,
        itemCostCents: input.itemCostCents ?? null,
        weeklySpendCents: input.weeklySpendCents ?? null,
        maxAutoApproveCostCents: settings.maxAutoApproveCostCents,
        weeklySpendCapCents: settings.weeklySpendCapCents,
      },
      idempotencyKey: `would_auto_approve:${input.approvalId}`,
    });
    return {
      decision: "would_auto_approve",
      dryRun: true,
      settingsPreset: settings.preset,
    };
  }

  const title =
    locale === "en" ? "Video waiting for your OK" : "Video esperando tu OK";
  const body =
    locale === "en"
      ? "I have a video ready. Please review and Approve or Change."
      : "Tengo un video listo. Revísalo y elige Aprobar o Cambiar.";

  await insertHoyNotification({
    clientId: input.clientId,
    kind: "pending_approval",
    title,
    body,
    approvalIds: [input.approvalId],
  });

  await recordAutomationEvent({
    clientId: input.clientId,
    approvalId: input.approvalId,
    kind: "notify_pending",
    channel: "hoy_feed",
    payload: { title, body },
    idempotencyKey: `notify_pending:${input.approvalId}`,
  });

  if (input.ownerEmail) {
    const emailResult = await sendOwnerNotificationEmail({
      to: input.ownerEmail,
      subject: title,
      text: body,
      html: `<p>${body}</p><p><a href="/approvals/${input.approvalId}">Review</a></p>`,
      idempotencyKey: `email_pending:${input.approvalId}`,
      clientId: input.clientId,
      approvalId: input.approvalId,
    });
    void emailResult;
  }

  return {
    decision: "notify",
    dryRun: true,
    settingsPreset: settings.preset,
  };
}
