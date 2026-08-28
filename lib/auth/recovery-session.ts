import "server-only";

import {
  createReadOnlyUserScopedAuthClient,
  isUserScopedAuthConfigured,
} from "@/lib/auth/supabase-cookie";

/**
 * Server-only: whether an httpOnly recovery session cookie is present and
 * valid. Returns a boolean only — never email, user id, tokens, `active`, or
 * `role`. Not a product identity API (`getCurrentUser()` stays unchanged).
 *
 * Frontend: Server Component on `/reset-password/new` passes
 * `recoveryReady` into the Client form.
 */
export async function isRecoverySessionReady(): Promise<boolean> {
  try {
    if (!isUserScopedAuthConfigured()) {
      return false;
    }

    const auth = await createReadOnlyUserScopedAuthClient();
    const { data, error } = await auth.auth.getUser();

    return Boolean(!error && data.user?.id);
  } catch {
    return false;
  }
}
