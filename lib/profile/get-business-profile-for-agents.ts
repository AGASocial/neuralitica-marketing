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
 * US-3.1 soft: when Preferencias row exists, visualModeSummary = { allowedModes };
 * if absent or soft-fail, keep null. Omit consent internals.
 */

import {
  agentClientIdSchema,
  type BusinessProfileForAgentsResult,
} from "@/lib/contracts/profile";
import {
  visualModalitySchema,
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

async function loadVisualModeSummaryForAgents(
  clientId: string,
): Promise<VisualModeSummary | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_visual_preferences")
      .select("allowed_modes")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const rawModes = (data as { allowed_modes: unknown }).allowed_modes;
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

    return { allowedModes };
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
