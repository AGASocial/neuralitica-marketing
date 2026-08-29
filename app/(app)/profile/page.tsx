import { LivingProfileView } from "@/components/profile/LivingProfileView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { BusinessProfileForClientResult } from "@/lib/contracts/profile";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getBusinessProfileForClient } from "@/lib/profile/get-business-profile-for-client";

export const dynamic = "force-dynamic";

function isNextNavigationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_HTTP_ERROR"))
  );
}

/**
 * Living profile / Ficha viva — read-only (US-2.1).
 * Auth via `(app)` layout `requireActive("page")`. Cache: no-store in next.config.
 * Identity: getBusinessProfileForClient() arity 0 only — no client/profile id params.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result: BusinessProfileForClientResult = {
    exists: false,
    loadFailed: true,
  };

  try {
    result = await getBusinessProfileForClient();
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = { exists: false, loadFailed: true };
  }

  return (
    <LivingProfileView
      result={result}
      locale={locale}
      copy={{
        title: t.profile.title,
        updatedAt: t.profile.updatedAt,
        emptySection: t.profile.emptySection,
        sections: t.profile.sections,
        empty: t.profile.empty,
        error: t.profile.error,
      }}
    />
  );
}
