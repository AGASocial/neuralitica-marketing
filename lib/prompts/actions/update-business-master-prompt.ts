"use server";

import { revalidatePath } from "next/cache";

import type { PromptUpdateResult } from "@/lib/contracts/master-prompts";
import { updateBusinessMasterPromptInputSchema } from "@/lib/contracts/master-prompts";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function updateBusinessMasterPrompt(
  input: unknown,
): Promise<PromptUpdateResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return {
        ok: false,
        error: {
          code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        },
      };
    }
    throw error;
  }

  const parsed = updateBusinessMasterPromptInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    };
  }

  const trimmed = parsed.data.businessMasterPrompt.trim();
  const promptValue = trimmed.length > 0 ? trimmed : null;

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  const supabase = createServerSupabaseClient();

  // Upsert per-business prompt row.
  const { error: upsertError } = await supabase
    .from("neuramark_business_prompts")
    .upsert(
      {
        client_id: parsed.data.clientId,
        business_master_prompt: promptValue,
      },
      {
        onConflict: "client_id",
        ignoreDuplicates: false,
      },
    );

  if (upsertError) {
    console.error("[master-prompts] Failed to update business prompt", {
      clientId: parsed.data.clientId,
      code: upsertError.code,
      message: upsertError.message,
    });
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  revalidatePath("/operator/settings/master-prompts");

  return { ok: true };
}
