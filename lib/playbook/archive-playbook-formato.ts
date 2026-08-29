"use server";

import { revalidatePath } from "next/cache";

import {
  archivePlaybookFormatoInputSchema,
  playbookSlugSchema,
  type ArchivePlaybookFormatoInput,
  type ArchivePlaybookFormatoResult,
} from "@/lib/contracts/playbook";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  playbookForbiddenError,
  playbookForbiddenFieldsError,
  playbookInternalError,
  playbookNotFoundError,
  playbookUnauthenticatedError,
  playbookValidationError,
  playbookVersionConflictError,
} from "@/lib/playbook/errors";
import {
  findForbiddenArchivePlaybookKeys,
  parsePlaybookVersion,
} from "@/lib/playbook/map-playbook-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): ArchivePlaybookFormatoResult {
  if (error.status === 401) {
    return playbookUnauthenticatedError();
  }
  return playbookForbiddenError();
}

type ExistingRow = {
  version: unknown;
  active: boolean;
  archived_at: unknown;
};

async function selectPlaybookRow(slug: string): Promise<ExistingRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_playbooks")
    .select("version, active, archived_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[playbook] archive select failed", { code: error.code, slug });
    throw new Error("Playbook archive unavailable");
  }

  return (data as ExistingRow | null) ?? null;
}

async function archivePlaybookFormatoInner(
  routeSlug: string,
  rawInput: unknown,
): Promise<ArchivePlaybookFormatoResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  const slugParsed = playbookSlugSchema.safeParse(routeSlug);
  if (!slugParsed.success) {
    return playbookNotFoundError();
  }

  if (findForbiddenArchivePlaybookKeys(rawInput).length > 0) {
    return playbookForbiddenFieldsError();
  }

  const parsed = archivePlaybookFormatoInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return playbookValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("[playbook] archive unavailable: Supabase not configured");
    return playbookInternalError();
  }

  const slug = slugParsed.data;
  let existing: ExistingRow | null;
  try {
    existing = await selectPlaybookRow(slug);
  } catch {
    return playbookInternalError();
  }

  if (!existing) {
    return playbookNotFoundError();
  }

  if (!existing.active || existing.archived_at != null) {
    revalidatePath("/operator/playbook");
    revalidatePath(`/operator/playbook/${slug}`);
    return {
      ok: true,
      slug,
      alreadyArchived: true,
    };
  }

  const currentVersion = parsePlaybookVersion(existing.version);
  if (currentVersion == null) {
    return playbookInternalError();
  }

  if (currentVersion !== parsed.data.expectedVersion) {
    return playbookVersionConflictError();
  }

  const archivedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_playbooks")
    .update({
      active: false,
      archived_at: archivedAt,
    })
    .eq("slug", slug)
    .eq("version", parsed.data.expectedVersion)
    .eq("active", true)
    .is("archived_at", null)
    .select("slug")
    .maybeSingle();

  if (error) {
    console.error("[playbook] archive failed", { code: error.code, slug });
    return playbookInternalError();
  }

  if (!data) {
    return playbookVersionConflictError();
  }

  revalidatePath("/operator/playbook");
  revalidatePath(`/operator/playbook/${slug}`);

  return {
    ok: true,
    slug,
  };
}

/**
 * Archive a Formato de Reel (US-16.1).
 * Frontend consumer: `/operator/playbook/[slug]` — Archive confirm.
 */
export async function archivePlaybookFormato(
  slug: string,
  input: ArchivePlaybookFormatoInput,
): Promise<ArchivePlaybookFormatoResult> {
  try {
    return await archivePlaybookFormatoInner(slug, input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[playbook] archive unexpected error");
    return playbookInternalError();
  }
}
