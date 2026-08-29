import "server-only";

import { getPlaybookForAgents } from "@/lib/playbook/get-playbook-for-agents";

/**
 * Validates formatos_playbook_compatibles[] against active Playbook slugs.
 * MUST call getPlaybookForAgents() — never direct neuramark_content_playbooks SELECT.
 */
export async function validateFormatosPlaybookCompatibles(
  slugs: string[],
): Promise<{ ok: true } | { ok: false; invalidSlugs: string[]; loadFailed?: boolean }> {
  const playbook = await getPlaybookForAgents();

  if ("loadFailed" in playbook && playbook.loadFailed) {
    return { ok: false, invalidSlugs: [], loadFailed: true };
  }

  const allowlist = new Set(
    ("formats" in playbook ? playbook.formats : []).map((formato) => formato.slug),
  );
  const invalidSlugs = slugs.filter((slug) => !allowlist.has(slug));

  if (invalidSlugs.length > 0) {
    return { ok: false, invalidSlugs };
  }

  return { ok: true };
}
