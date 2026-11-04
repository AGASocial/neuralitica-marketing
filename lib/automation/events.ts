import "server-only";

import type { AutomationEventKind } from "@/lib/contracts/automation-settings";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const AUTOMATION_EVENTS_TABLE = "neuramark_automation_events" as const;
export const HOY_NOTIFICATIONS_TABLE = "neuramark_hoy_notifications" as const;

export async function recordAutomationEvent(params: {
  clientId: string;
  approvalId?: string | null;
  kind: AutomationEventKind;
  channel?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ok: true; inserted: boolean } | { ok: false }> {
  if (!isSupabaseConfigured()) {
    return { ok: false };
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from(AUTOMATION_EVENTS_TABLE).insert({
    client_id: params.clientId,
    approval_id: params.approvalId ?? null,
    kind: params.kind,
    channel: params.channel ?? null,
    payload: params.payload ?? {},
    idempotency_key: params.idempotencyKey,
  });
  if (error) {
    // Unique violation → already recorded (idempotent success)
    if (error.code === "23505") {
      return { ok: true, inserted: false };
    }
    console.error("[automation] record event failed", error.code);
    return { ok: false };
  }
  return { ok: true, inserted: true };
}

export async function hasAutomationEvent(idempotencyKey: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from(AUTOMATION_EVENTS_TABLE)
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return Boolean(data);
}

export async function insertHoyNotification(params: {
  clientId: string;
  kind: string;
  title: string;
  body: string;
  approvalIds: string[];
}): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!isSupabaseConfigured()) {
    return { ok: false };
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(HOY_NOTIFICATIONS_TABLE)
    .insert({
      client_id: params.clientId,
      kind: params.kind,
      title: params.title,
      body: params.body,
      approval_ids: params.approvalIds,
    })
    .select("id")
    .maybeSingle();
  if (error || !data || typeof data.id !== "string") {
    console.error("[automation] hoy notification insert failed");
    return { ok: false };
  }
  return { ok: true, id: data.id };
}

export type HoyNotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  approvalIds: string[];
  createdAt: string;
  readAt: string | null;
};

export async function listUnreadHoyNotifications(params: {
  clientId: string;
  limit?: number;
}): Promise<HoyNotificationRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(HOY_NOTIFICATIONS_TABLE)
    .select("id, kind, title, body, approval_ids, created_at, read_at")
    .eq("client_id", params.clientId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 10);
  if (error || !Array.isArray(data)) {
    return [];
  }
  return data.flatMap((row) => {
    if (
      typeof row.id !== "string" ||
      typeof row.kind !== "string" ||
      typeof row.title !== "string" ||
      typeof row.body !== "string" ||
      typeof row.created_at !== "string"
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        approvalIds: Array.isArray(row.approval_ids)
          ? row.approval_ids.filter((id): id is string => typeof id === "string")
          : [],
        createdAt: row.created_at,
        readAt: typeof row.read_at === "string" ? row.read_at : null,
      },
    ];
  });
}
