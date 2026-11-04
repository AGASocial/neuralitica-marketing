import "server-only";

import { recordAutomationEvent } from "@/lib/automation/events";
import {
  isOwnerEmailNotificationsEnabled,
  isRecipientAllowed,
  resolveNotificationsFromEmail,
} from "@/lib/notifications/email/email-flags";

export type SendOwnerEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
  clientId: string;
  approvalId?: string | null;
};

export type SendOwnerEmailResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; id: string }
  | { ok: false; error: string };

export {
  isOwnerEmailNotificationsEnabled,
  isRecipientAllowed,
  parseNotificationsAllowlist,
  resolveNotificationsFromEmail,
} from "@/lib/notifications/email/email-flags";

/**
 * Send owner notification via Resend when flags allow.
 * Never throws secrets; skips when disabled or not allowlisted.
 */
export async function sendOwnerNotificationEmail(
  input: SendOwnerEmailInput,
): Promise<SendOwnerEmailResult> {
  if (!isOwnerEmailNotificationsEnabled()) {
    await recordAutomationEvent({
      clientId: input.clientId,
      approvalId: input.approvalId,
      kind: "email_skipped",
      channel: "email",
      payload: { reason: "flag_off" },
      idempotencyKey: `${input.idempotencyKey}:skipped_flag`,
    });
    return { ok: true, skipped: true, reason: "flag_off" };
  }

  if (!isRecipientAllowed(input.to)) {
    await recordAutomationEvent({
      clientId: input.clientId,
      approvalId: input.approvalId,
      kind: "email_skipped",
      channel: "email",
      payload: { reason: "not_allowlisted" },
      idempotencyKey: `${input.idempotencyKey}:skipped_allowlist`,
    });
    return { ok: true, skipped: true, reason: "not_allowlisted" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    await recordAutomationEvent({
      clientId: input.clientId,
      approvalId: input.approvalId,
      kind: "email_skipped",
      channel: "email",
      payload: { reason: "missing_api_key" },
      idempotencyKey: `${input.idempotencyKey}:skipped_key`,
    });
    return { ok: true, skipped: true, reason: "missing_api_key" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const from = resolveNotificationsFromEmail();
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<p>${input.text}</p>`,
    });
    if (result.error) {
      console.error("[notifications/email] Resend error");
      return { ok: false, error: "RESEND_ERROR" };
    }
    const id =
      result.data && typeof result.data.id === "string"
        ? result.data.id
        : "unknown";
    await recordAutomationEvent({
      clientId: input.clientId,
      approvalId: input.approvalId,
      kind: "email_attempt",
      channel: "email",
      payload: { resendId: id, to: input.to },
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true, skipped: false, id };
  } catch (error) {
    console.error("[notifications/email] send failed");
    void error;
    return { ok: false, error: "SEND_FAILED" };
  }
}
