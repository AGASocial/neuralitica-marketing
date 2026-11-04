"use server";

import { revalidatePath } from "next/cache";

import { upsertAutomationSettingsForClient } from "@/lib/automation/settings";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  upsertAutomationSettingsInputSchema,
  type AutomationSettings,
} from "@/lib/contracts/automation-settings";

export type UpsertAutomationSettingsResult =
  | { ok: true; settings: AutomationSettings }
  | { ok: false; error: string };

export async function upsertAutomationSettings(
  rawInput: unknown,
): Promise<UpsertAutomationSettingsResult> {
  try {
    const user = await requireActive("handler");
    const parsed = upsertAutomationSettingsInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION" };
    }
    const result = await upsertAutomationSettingsForClient({
      clientId: user.id,
      input: parsed.data,
    });
    if (!result.ok) {
      return { ok: false, error: "INTERNAL" };
    }
    revalidatePath("/settings/automation");
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return { ok: true, settings: result.settings };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return { ok: false, error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" };
    }
    console.error("[automation] upsertAutomationSettings failed");
    return { ok: false, error: "INTERNAL" };
  }
}
