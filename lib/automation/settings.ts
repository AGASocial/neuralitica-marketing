import "server-only";

import {
  automationSettingsSchema,
  defaultAutomationSettings,
  type AutomationSettings,
  type UpsertAutomationSettingsInput,
} from "@/lib/contracts/automation-settings";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export const AUTOMATION_SETTINGS_TABLE =
  "neuramark_automation_settings" as const;

function mapRow(raw: Record<string, unknown>): AutomationSettings | null {
  const parsed = automationSettingsSchema.safeParse({
    clientId: raw.client_id,
    preset: raw.preset,
    weeklySpendCapCents:
      raw.weekly_spend_cap_cents === null ||
      typeof raw.weekly_spend_cap_cents === "number"
        ? raw.weekly_spend_cap_cents
        : null,
    maxAutoApproveCostCents:
      raw.max_auto_approve_cost_cents === null ||
      typeof raw.max_auto_approve_cost_cents === "number"
        ? raw.max_auto_approve_cost_cents
        : null,
    contentTypeRules:
      raw.content_type_rules &&
      typeof raw.content_type_rules === "object" &&
      !Array.isArray(raw.content_type_rules)
        ? raw.content_type_rules
        : {},
    remindAfter24h: raw.remind_after_24h === true,
    remindAfter48hChannelChange:
      raw.remind_after_48h_channel_change === true,
    remindAfter72hFallback: raw.remind_after_72h_fallback === true,
  });
  return parsed.success ? parsed.data : null;
}

export async function loadAutomationSettingsForClient(
  clientId: string,
): Promise<AutomationSettings> {
  if (!isSupabaseConfigured()) {
    return defaultAutomationSettings(clientId);
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(AUTOMATION_SETTINGS_TABLE)
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) {
    return defaultAutomationSettings(clientId);
  }
  return mapRow(data as Record<string, unknown>) ?? defaultAutomationSettings(clientId);
}

export async function upsertAutomationSettingsForClient(params: {
  clientId: string;
  input: UpsertAutomationSettingsInput;
}): Promise<{ ok: true; settings: AutomationSettings } | { ok: false }> {
  if (!isSupabaseConfigured()) {
    return { ok: false };
  }
  const current = await loadAutomationSettingsForClient(params.clientId);
  const next: AutomationSettings = {
    clientId: params.clientId,
    preset: params.input.preset,
    weeklySpendCapCents:
      params.input.weeklySpendCapCents === undefined
        ? current.weeklySpendCapCents
        : params.input.weeklySpendCapCents,
    maxAutoApproveCostCents:
      params.input.maxAutoApproveCostCents === undefined
        ? current.maxAutoApproveCostCents
        : params.input.maxAutoApproveCostCents,
    contentTypeRules:
      params.input.contentTypeRules === undefined
        ? current.contentTypeRules
        : params.input.contentTypeRules,
    remindAfter24h:
      params.input.remindAfter24h === undefined
        ? current.remindAfter24h
        : params.input.remindAfter24h,
    remindAfter48hChannelChange:
      params.input.remindAfter48hChannelChange === undefined
        ? current.remindAfter48hChannelChange
        : params.input.remindAfter48hChannelChange,
    remindAfter72hFallback:
      params.input.remindAfter72hFallback === undefined
        ? current.remindAfter72hFallback
        : params.input.remindAfter72hFallback,
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(AUTOMATION_SETTINGS_TABLE)
    .upsert(
      {
        client_id: next.clientId,
        preset: next.preset,
        weekly_spend_cap_cents: next.weeklySpendCapCents,
        max_auto_approve_cost_cents: next.maxAutoApproveCostCents,
        content_type_rules: next.contentTypeRules,
        remind_after_24h: next.remindAfter24h,
        remind_after_48h_channel_change: next.remindAfter48hChannelChange,
        remind_after_72h_fallback: next.remindAfter72hFallback,
      },
      { onConflict: "client_id" },
    )
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[automation] upsert settings failed");
    return { ok: false };
  }
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) {
    return { ok: false };
  }
  return { ok: true, settings: mapped };
}
