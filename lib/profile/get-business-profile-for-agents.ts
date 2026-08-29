import "server-only";

/**
 * Minimal Ficha viva projection for trusted server agents / orchestration.
 *
 * Content Strategy, Video Script, Caption, QA (and future orchestration) MUST
 * import this helper only — never raw neuramark_interview_sessions SELECT,
 * never getBusinessProfileForClient / Cliente DTO for prompts.
 *
 * clientId: UUID from trusted server/job context only — never browser
 * body/query/headers as authority. Does NOT call requireActive / session.
 *
 * US-3.4: when Preferencias row exists, visualModeSummary =
 * { allowedModes, mustDiscloseNotOwner } derived server-side via
 * resolveVisualPreferencesRules (allowlist-level proxy until US-4.x per-slot
 * Modalidad). If absent or soft-fail, keep null. Omit consent internals.
 *
 * US-5.1 / US-10.1 MUST read mustDiscloseNotOwner from this helper only —
 * never from request body, job client JSON, or LLM output.
 */

import {
  agentClientIdSchema,
  type BusinessProfileForAgentsResult,
} from "@/lib/contracts/profile";
import {
  visualModalitySchema,
  visualPreferencesRulesSchema,
  type VisualModeSummary,
} from "@/lib/contracts/visual-preferences";
import {
  mapBusinessProfileRowForAgents,
  type ProfileSelectRow,
} from "@/lib/profile/map-business-profile-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { resolveVisualPreferencesRules } from "@/lib/visual-preferences/helpers";

async function loadVisualModeSummaryForAgents(
  clientId: string,
): Promise<VisualModeSummary | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_visual_preferences")
      .select("allowed_modes, rules")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const row = data as { allowed_modes: unknown; rules: unknown };
    const rawModes = row.allowed_modes;
    if (!Array.isArray(rawModes)) {
      return null;
    }

    const allowedModes: VisualModeSummary["allowedModes"] = [];
    for (const item of rawModes) {
      const parsed = visualModalitySchema.safeParse(item);
      if (!parsed.success) {
        return null;
      }
      allowedModes.push(parsed.data);
    }

    if (allowedModes.length > 3) {
      return null;
    }

    const rulesParsed = visualPreferencesRulesSchema.safeParse(row.rules);
    const storedRules = rulesParsed.success ? rulesParsed.data : null;

    const resolved = resolveVisualPreferencesRules({
      allowedModes,
      storedRules,
    });

    return {
      allowedModes,
      mustDiscloseNotOwner: resolved.must_disclose_not_owner,
    };
  } catch {
    return null;
  }
}

export async function getBusinessProfileForAgents(
  clientId: string,
): Promise<BusinessProfileForAgentsResult> {
  const idParsed = agentClientIdSchema.safeParse(clientId);
  if (!idParsed.success) {
    console.error("[profile] agents clientId invalid", { code: "invalid_uuid" });
    return { exists: false };
  }

  if (!isSupabaseConfigured()) {
    console.error("[profile] agents load unavailable: Supabase not configured");
    return { exists: false, loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("fields, version, updated_at")
    .eq("client_id", idParsed.data)
    .maybeSingle();

  const visualModeSummary = await loadVisualModeSummaryForAgents(idParsed.data);

  return mapBusinessProfileRowForAgents({
    clientId: idParsed.data,
    data: (data as ProfileSelectRow | null) ?? null,
    error,
    visualModeSummary,
  });
}
