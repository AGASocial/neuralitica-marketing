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
 */

import {
  agentClientIdSchema,
  type BusinessProfileForAgentsResult,
} from "@/lib/contracts/profile";
import {
  mapBusinessProfileRowForAgents,
  type ProfileSelectRow,
} from "@/lib/profile/map-business-profile-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

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

  return mapBusinessProfileRowForAgents({
    clientId: idParsed.data,
    data: (data as ProfileSelectRow | null) ?? null,
    error,
  });
}
