import "server-only";

import {
  runAutoApproveEngine,
  type AutoApproveEngineDeps,
  type AutoApproveOutcome,
} from "@/lib/automation/auto-approve-engine";
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
 * KAN-108 F1: Piloto automático is live. `AUTOMATION_AUTO_APPROVE_DRY_RUN=true`
 * forces log-only (`would_auto_approve`) everywhere — used for verification.
 * Auto-approve NEVER publishes and NEVER starts paid generation.
 */
export function isAutomationAutoApproveDryRunForced(): boolean {
  return process.env.AUTOMATION_AUTO_APPROVE_DRY_RUN?.trim() === "true";
}

export type EvaluatePendingInput = {
  clientId: string;
  approvalId: string;
  locale?: "en" | "es";
  ownerEmail?: string | null;
  /** Log-only evaluation (no approval write, no notification). */
  dryRun?: boolean;
  /** Test seam. */
  deps?: AutoApproveEngineDeps;
};

export type EvaluatePendingResult = {
  decision: AutoApproveOutcome["decision"];
  reason?: string;
  dryRun: boolean;
  settingsPreset: AutomationSettings["preset"];
};

export async function evaluatePendingApprovalAutomation(
  input: EvaluatePendingInput,
): Promise<EvaluatePendingResult> {
  const settings = await loadAutomationSettingsForClient(input.clientId);
  const locale = input.locale === "en" ? "en" : "es";
  const dryRun = input.dryRun === true || isAutomationAutoApproveDryRunForced();
  const deps =
    input.deps ??
    (await import("@/lib/automation/auto-approve-deps")).serverAutoApproveDeps;

  const outcome = await runAutoApproveEngine({
    approvalId: input.approvalId,
    clientId: input.clientId,
    dryRun,
    deps: { ...deps, loadSettings: async () => settings },
  });

  if (outcome.decision !== "notify" || dryRun) {
    return {
      decision: outcome.decision,
      reason: outcome.decision === "notify" ? outcome.reason : undefined,
      dryRun,
      settingsPreset: settings.preset,
    };
  }
  if (outcome.reason === "not_pending") {
    return {
      decision: "notify",
      reason: outcome.reason,
      dryRun,
      settingsPreset: settings.preset,
    };
  }

  const title =
    locale === "en"
      ? "Video waiting for your approval"
      : "Video esperando tu visto bueno";
  const body =
    locale === "en"
      ? "I have a video ready for you. Please take a moment to review it and let me know if you'd like to Approve or Change anything."
      : "Tengo un video listo para ti. Tómate un momento para revisarlo y dime si quieres Aprobarlo o Cambiar algo.";
  const ctaText = locale === "en" ? "Review video" : "Revisar video";

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
    payload: { title, body, autoApproveReason: outcome.reason },
    idempotencyKey: `notify_pending:${input.approvalId}`,
  });

  if (input.ownerEmail) {
    const siteUrl = (process.env.SITE_URL ?? "https://marketing.neuraliti.ca")
      .trim()
      .replace(/\/$/, "");
    const ctaUrl = `${siteUrl}/approvals/${input.approvalId}`;

    const { renderOwnerNotificationEmail } = await import(
      "@/lib/notifications/email/templates"
    );
    const { html, text } = renderOwnerNotificationEmail({
      headline: title,
      body,
      ctaText,
      ctaUrl,
      siteUrl,
    });

    const emailResult = await sendOwnerNotificationEmail({
      to: input.ownerEmail,
      subject: title,
      text,
      html,
      idempotencyKey: `email_pending:${input.approvalId}`,
      clientId: input.clientId,
      approvalId: input.approvalId,
    });
    void emailResult;
  }

  return {
    decision: "notify",
    reason: outcome.reason,
    dryRun,
    settingsPreset: settings.preset,
  };
}
