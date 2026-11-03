import "server-only";

import type { AvatarForClientResult } from "@/lib/contracts/avatar";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { mapAvatarRow, type AvatarSelectRow } from "@/lib/avatars/map-avatar-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const TABLE = "neuramark_avatars";

/**
 * Load avatar presenter config for the current user (arity-0).
 * Identity only via getCurrentUser().
 */
export async function getAvatarForClient(): Promise<AvatarForClientResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { exists: false, loadFailed: true };
  }
  return getAvatarForClientId(user.id);
}

/** Trusted server helper — caller must already have resolved clientId. */
export async function getAvatarForClientId(
  clientId: string,
): Promise<AvatarForClientResult> {
  if (!isSupabaseConfigured()) {
    return { exists: false, loadFailed: true };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, client_id, gender, language, elevenlabs_voice_id, updated_at")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) {
      console.error("[avatar] load failed", { code: error.code });
      return { exists: false, loadFailed: true };
    }
    if (!data) {
      return { exists: false };
    }

    const mapped = mapAvatarRow(data as AvatarSelectRow);
    if (!mapped) {
      return { exists: false, loadFailed: true };
    }
    return { exists: true, avatar: mapped };
  } catch {
    return { exists: false, loadFailed: true };
  }
}
