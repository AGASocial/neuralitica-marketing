import "server-only";

/**
 * Global Playbook de formatos projection for trusted server agents.
 *
 * Content Strategy (US-4.1), Video Script (US-5.1), Media Assembly (US-9.x),
 * and Trend validation (US-16.2+) MUST import this helper only — never direct
 * neuramark_content_playbooks SELECT from agent modules.
 *
 * No session gate — callers are trusted server jobs only.
 * Active formatos only; ejemplo_referencia stripped.
 */

import {
  playbookPayloadCoreSchema,
  type PlaybookForAgentsResult,
} from "@/lib/contracts/playbook";
import {
  mapPlaybookPayloadToAgentDto,
  type PlaybookSelectRow,
} from "@/lib/playbook/map-playbook-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function getPlaybookForAgents(): Promise<PlaybookForAgentsResult> {
  if (!isSupabaseConfigured()) {
    console.error("[playbook] agents load unavailable: Supabase not configured");
    return { formats: [], loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_playbooks")
    .select("slug, payload")
    .eq("active", true)
    .is("archived_at", null)
    .order("slug", { ascending: true });

  if (error) {
    console.error("[playbook] agents load failed", { code: error.code });
    return { formats: [], loadFailed: true };
  }

  const formats = [];
  for (const row of (data ?? []) as Pick<PlaybookSelectRow, "slug" | "payload">[]) {
    const payloadParsed = playbookPayloadCoreSchema.safeParse(row.payload);
    if (!payloadParsed.success) {
      console.error("[playbook] agents row skipped", { slug: row.slug });
      continue;
    }

    const dto = mapPlaybookPayloadToAgentDto(row.slug, payloadParsed.data);
    if (!dto) {
      console.error("[playbook] agents dto invalid", { slug: row.slug });
      continue;
    }

    formats.push(dto);
  }

  if (formats.length === 0 && (data?.length ?? 0) > 0) {
    return { formats: [], loadFailed: true };
  }

  return { formats };
}
