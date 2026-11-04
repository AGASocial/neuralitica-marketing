import "server-only";

import {
  hasAutomationEvent,
  insertHoyNotification,
  recordAutomationEvent,
} from "@/lib/automation/events";
import { loadAutomationSettingsForClient } from "@/lib/automation/settings";
import { sendOwnerNotificationEmail } from "@/lib/notifications/email/send-owner-email";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const HOURS = {
  h24: 24,
  h48: 48,
  h72: 72,
} as const;

function hoursSince(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 0;
  return (now.getTime() - then) / (1000 * 60 * 60);
}

export type ReminderRunSummary = {
  scanned: number;
  reminded24: number;
  reminded48: number;
  reminded72: number;
  skipped: number;
};

async function loadOwnerEmail(clientId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("neuramark_clients")
    .select("email")
    .eq("id", clientId)
    .maybeSingle();
  return data && typeof data.email === "string" ? data.email : null;
}

async function maybeRemind(params: {
  clientId: string;
  approvalId: string;
  kind: "reminder_24h" | "reminder_48h" | "reminder_72h";
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
  ownerEmail: string | null;
}): Promise<boolean> {
  const key = `${params.kind}:${params.approvalId}`;
  if (await hasAutomationEvent(key)) {
    return false;
  }
  const title = params.titleEs;
  const body = params.bodyEs;
  await insertHoyNotification({
    clientId: params.clientId,
    kind: params.kind,
    title,
    body,
    approvalIds: [params.approvalId],
  });
  await recordAutomationEvent({
    clientId: params.clientId,
    approvalId: params.approvalId,
    kind: params.kind,
    channel: "hoy_feed",
    payload: { title, body },
    idempotencyKey: key,
  });
  if (params.ownerEmail) {
    await sendOwnerNotificationEmail({
      to: params.ownerEmail,
      subject: title,
      text: body,
      idempotencyKey: `email_${params.kind}:${params.approvalId}`,
      clientId: params.clientId,
      approvalId: params.approvalId,
    });
  }
  return true;
}

/**
 * Idempotent hourly reminder pass over pending_client approvals.
 * Does not approve, spend, or publish.
 */
export async function runAutomationReminders(params?: {
  now?: Date;
}): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = {
    scanned: 0,
    reminded24: 0,
    reminded48: 0,
    reminded72: 0,
    skipped: 0,
  };
  if (!isSupabaseConfigured()) {
    return summary;
  }
  const now = params?.now ?? new Date();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_approvals")
    .select("id, client_id, created_at, status")
    .eq("status", "pending_client")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error || !Array.isArray(data)) {
    return summary;
  }

  for (const row of data) {
    if (
      typeof row.id !== "string" ||
      typeof row.client_id !== "string" ||
      typeof row.created_at !== "string"
    ) {
      summary.skipped += 1;
      continue;
    }
    summary.scanned += 1;
    const age = hoursSince(row.created_at, now);
    const settings = await loadAutomationSettingsForClient(row.client_id);
    const ownerEmail = await loadOwnerEmail(row.client_id);

    if (age >= HOURS.h72 && settings.remindAfter72hFallback) {
      const ok = await maybeRemind({
        clientId: row.client_id,
        approvalId: row.id,
        kind: "reminder_72h",
        titleEs: "Aún necesito tu OK (72 h)",
        titleEn: "Still need your OK (72h)",
        bodyEs:
          "Llevo 72 horas esperando. Si no respondes, seguiré esperando (F0 no auto-publica).",
        bodyEn:
          "I have waited 72 hours. I will keep waiting (F0 does not auto-publish).",
        ownerEmail,
      });
      if (ok) summary.reminded72 += 1;
      continue;
    }
    if (age >= HOURS.h48 && settings.remindAfter48hChannelChange) {
      const ok = await maybeRemind({
        clientId: row.client_id,
        approvalId: row.id,
        kind: "reminder_48h",
        titleEs: "Recordatorio (48 h) — revisa tu correo",
        titleEn: "Reminder (48h) — check email",
        bodyEs:
          "Han pasado 48 horas. Te aviso también por correo si las notificaciones están activas.",
        bodyEn:
          "It has been 48 hours. I am also emailing if notifications are enabled.",
        ownerEmail,
      });
      if (ok) summary.reminded48 += 1;
      continue;
    }
    if (age >= HOURS.h24 && settings.remindAfter24h) {
      const ok = await maybeRemind({
        clientId: row.client_id,
        approvalId: row.id,
        kind: "reminder_24h",
        titleEs: "Recordatorio: video pendiente de OK",
        titleEn: "Reminder: video still needs your OK",
        bodyEs: "Llevo 24 horas con un video esperando tu aprobación.",
        bodyEn: "A video has been waiting for your OK for 24 hours.",
        ownerEmail,
      });
      if (ok) summary.reminded24 += 1;
    }
  }

  return summary;
}
