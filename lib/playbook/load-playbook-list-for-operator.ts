import "server-only";

import { requireOperator } from "@/lib/auth/require-user";
import type { PlaybookListForOperatorResult } from "@/lib/contracts/playbook";
import {
  mapPlaybookListItem,
  type PlaybookSelectRow,
} from "@/lib/playbook/map-playbook-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Operator Playbook list loader (US-16.1).
 * Frontend consumer: `/operator/playbook` RSC.
 */
export async function loadPlaybookListForOperator(): Promise<PlaybookListForOperatorResult> {
  await requireOperator("page");

  if (!isSupabaseConfigured()) {
    console.error("[playbook] list load unavailable: Supabase not configured");
    return { ok: false, loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_playbooks")
    .select("slug, version, payload, active, archived_at, updated_at")
    .order("active", { ascending: false })
    .order("slug", { ascending: true });

  if (error) {
    console.error("[playbook] list load failed", { code: error.code });
    return { ok: false, loadFailed: true };
  }

  const formatos = [];
  for (const row of (data ?? []) as PlaybookSelectRow[]) {
    const item = mapPlaybookListItem(row);
    if (item) {
      formatos.push(item);
    } else {
      console.error("[playbook] list row skipped", { slug: row.slug });
    }
  }

  return { ok: true, formatos };
}
