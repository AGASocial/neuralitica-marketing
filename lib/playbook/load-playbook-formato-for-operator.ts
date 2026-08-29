import "server-only";

import { requireOperator } from "@/lib/auth/require-user";
import {
  playbookSlugSchema,
  type PlaybookFormatoForOperatorResult,
} from "@/lib/contracts/playbook";
import {
  mapPlaybookFormatoForOperator,
  type PlaybookSelectRow,
} from "@/lib/playbook/map-playbook-row";
import { playbookFormatoNotFoundResult } from "@/lib/playbook/errors";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Operator Playbook detail/edit loader (US-16.1).
 * Frontend consumer: `/operator/playbook/[slug]` RSC.
 */
export async function loadPlaybookFormatoForOperator(
  slug: string,
): Promise<PlaybookFormatoForOperatorResult> {
  await requireOperator("page");

  const slugParsed = playbookSlugSchema.safeParse(slug);
  if (!slugParsed.success) {
    return playbookFormatoNotFoundResult();
  }

  if (!isSupabaseConfigured()) {
    console.error("[playbook] detail load unavailable: Supabase not configured");
    return playbookFormatoNotFoundResult();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_playbooks")
    .select("slug, version, payload, active, archived_at, updated_at")
    .eq("slug", slugParsed.data)
    .maybeSingle();

  if (error) {
    console.error("[playbook] detail load failed", {
      code: error.code,
      slug: slugParsed.data,
    });
    return playbookFormatoNotFoundResult();
  }

  if (!data) {
    return playbookFormatoNotFoundResult();
  }

  const formato = mapPlaybookFormatoForOperator(data as PlaybookSelectRow);
  if (!formato) {
    console.error("[playbook] detail row invalid", { slug: slugParsed.data });
    return playbookFormatoNotFoundResult();
  }

  return { ok: true, formato };
}
