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

import type { PlaybookForAgentsResult } from "@/lib/contracts/playbook";
import { mapPlaybookRowsForAgents } from "@/lib/playbook/map-playbook-rows-for-agents";
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

  return mapPlaybookRowsForAgents({
    rows: data,
    error,
  });
}
