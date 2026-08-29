"use server";

import { revalidatePath } from "next/cache";

import {
  playbookSlugSchema,
  updatePlaybookFormatoInputSchema,
  type UpdatePlaybookFormatoInput,
  type UpdatePlaybookFormatoResult,
} from "@/lib/contracts/playbook";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  playbookAlreadyArchivedError,
  playbookForbiddenError,
  playbookForbiddenFieldsError,
  playbookInternalError,
  playbookNotFoundError,
  playbookUnauthenticatedError,
  playbookValidationError,
  playbookVersionConflictError,
} from "@/lib/playbook/errors";
import {
  findForbiddenUpdatePlaybookKeys,
  parsePlaybookVersion,
  type PlaybookSelectRow,
} from "@/lib/playbook/map-playbook-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdatePlaybookFormatoResult {
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
    console.error("[playbook] update select failed", { code: error.code, slug });
    throw new Error("Playbook update unavailable");
  }

  return (data as ExistingRow | null) ?? null;
}

async function updatePlaybookFormatoInner(
  routeSlug: string,
  rawInput: unknown,
): Promise<UpdatePlaybookFormatoResult> {
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

  if (findForbiddenUpdatePlaybookKeys(rawInput).length > 0) {
    return playbookForbiddenFieldsError();
  }

  const parsed = updatePlaybookFormatoInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return playbookValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("[playbook] update unavailable: Supabase not configured");
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
    return playbookAlreadyArchivedError();
  }

  const currentVersion = parsePlaybookVersion(existing.version);
  if (currentVersion == null) {
    return playbookInternalError();
  }

  if (currentVersion !== parsed.data.expectedVersion) {
    return playbookVersionConflictError();
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_playbooks")
    .update({
      payload: parsed.data.payload,
      version: currentVersion + 1,
    })
    .eq("slug", slug)
    .eq("version", parsed.data.expectedVersion)
    .eq("active", true)
    .is("archived_at", null)
    .select("version")
    .maybeSingle();

  if (error) {
    console.error("[playbook] update failed", { code: error.code, slug });
    return playbookInternalError();
  }

  if (!data) {
    return playbookVersionConflictError();
  }

  const newVersion = parsePlaybookVersion((data as PlaybookSelectRow).version);
  if (newVersion == null) {
    return playbookInternalError();
  }

  revalidatePath("/operator/playbook");
  revalidatePath(`/operator/playbook/${slug}`);

  return {
    ok: true,
    slug,
    version: newVersion,
  };
}

/**
 * Update an active Formato de Reel (US-16.1).
 * Frontend consumer: `/operator/playbook/[slug]` — Save control.
 */
export async function updatePlaybookFormato(
  slug: string,
  input: UpdatePlaybookFormatoInput,
): Promise<UpdatePlaybookFormatoResult> {
  try {
    return await updatePlaybookFormatoInner(slug, input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[playbook] update unexpected error");
    return playbookInternalError();
  }
}
