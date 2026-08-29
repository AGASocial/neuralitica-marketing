"use server";

import { revalidatePath } from "next/cache";

import {
  createPlaybookFormatoInputSchema,
  type CreatePlaybookFormatoInput,
  type CreatePlaybookFormatoResult,
} from "@/lib/contracts/playbook";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  playbookDuplicateSlugError,
  playbookForbiddenError,
  playbookForbiddenFieldsError,
  playbookInternalError,
  playbookUnauthenticatedError,
  playbookValidationError,
} from "@/lib/playbook/errors";
import { findForbiddenCreatePlaybookKeys } from "@/lib/playbook/map-playbook-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): CreatePlaybookFormatoResult {
  if (error.status === 401) {
    return playbookUnauthenticatedError();
  }
  return playbookForbiddenError();
}

async function createPlaybookFormatoInner(
  rawInput: unknown,
): Promise<CreatePlaybookFormatoResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenCreatePlaybookKeys(rawInput).length > 0) {
    return playbookForbiddenFieldsError();
  }

  const parsed = createPlaybookFormatoInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return playbookValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("[playbook] create unavailable: Supabase not configured");
    return playbookInternalError();
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("neuramark_content_playbooks").insert({
    slug: parsed.data.slug,
    version: 1,
    payload: parsed.data.payload,
    active: true,
    archived_at: null,
  });

  if (error) {
    if (error.code === "23505") {
      return playbookDuplicateSlugError();
    }
    console.error("[playbook] create failed", {
      code: error.code,
      slug: parsed.data.slug,
    });
    return playbookInternalError();
  }

  revalidatePath("/operator/playbook");

  return {
    ok: true,
    slug: parsed.data.slug,
    version: 1,
  };
}

/**
 * Create a new global Formato de Reel (US-16.1).
 * Frontend consumer: `/operator/playbook/new` — Create form.
 */
export async function createPlaybookFormato(
  input: CreatePlaybookFormatoInput,
): Promise<CreatePlaybookFormatoResult> {
  try {
    return await createPlaybookFormatoInner(input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[playbook] create unexpected error");
    return playbookInternalError();
  }
}
