"use server";

import { revalidatePath } from "next/cache";

import type { PromptUpdateResult } from "@/lib/contracts/master-prompts";
import { updateGlobalMasterPromptInputSchema } from "@/lib/contracts/master-prompts";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
    10|} from "@/lib/supabase/server";

export async function updateGlobalMasterPrompt(
  input: unknown,
): Promise<PromptUpdateResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return {
    20|        ok: false,
        error: {
          code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        },
      };
    }
    throw error;
  }

  const parsed = updateGlobalMasterPromptInputSchema.safeParse(input);
    30|  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    };
  }

  const trimmed = parsed.data.globalMasterPrompt.trim();
  const promptValue = trimmed.length > 0 ? trimmed : null;

    40|  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  const supabase = createServerSupabaseClient();

    50|  // Upsert singleton global prompt row.
  const { error: upsertError } = await supabase
    .from("neuramark_operator_prompts")
    .upsert(
      { global_master_prompt: promptValue },
      {
        onConflict: "id",
        // Singleton: if no row exists, insert with default UUID.
        // If row exists, update it. Since we use unique index on ((1)),
        // there will only ever be one row.
    60|        ignoreDuplicates: false,
      },
    );

  if (upsertError) {
    console.error("[master-prompts] Failed to update global prompt", {
      code: upsertError.code,
      message: upsertError.message,
    });
    return {
    70|      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  revalidatePath("/operator/settings/master-prompts");

  return { ok: true };
}
