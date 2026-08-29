import "server-only";

import type { AssertActiveAvatarConsentForJobsResult } from "@/lib/contracts/avatar-consent";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";

/**
 * Fail-closed gate for own-avatar video/job creation (US-8 / US-10).
 * Call before enqueue/submit when modality is own_avatar.
 * Never defaults true. Never invents consent. Preferencias allowlist is not authority.
 *
 * Mandatory call site for US-8.x / US-10.x job create — do not skip.
 */
export async function assertActiveAvatarConsentForJobs(
  clientId: string,
): Promise<AssertActiveAvatarConsentForJobsResult> {
  if (!clientId || typeof clientId !== "string") {
    return {
      ok: false,
      error: {
        code: "OWN_AVATAR_CONSENT_REQUIRED",
        messageKey: "preferences.errors.ownAvatarConsentRequired",
      },
    };
  }

  try {
    const active = await hasActiveAvatarConsent(clientId);
    if (!active) {
      return {
        ok: false,
        error: {
          code: "OWN_AVATAR_CONSENT_REQUIRED",
          messageKey: "preferences.errors.ownAvatarConsentRequired",
        },
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        messageKey: "preferences.consent.errors.internal",
      },
    };
  }
}
