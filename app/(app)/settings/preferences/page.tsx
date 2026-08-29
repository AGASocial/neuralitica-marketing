import { PreferencesView } from "@/components/preferences/PreferencesView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { VisualPreferencesForClientResult } from "@/lib/contracts/visual-preferences";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getVisualPreferencesForClient } from "@/lib/visual-preferences/get-visual-preferences-for-client";

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
 * Preferencias de producción visual (US-3.1).
 * Auth via `(app)` layout `requireActive("page")`. Cache: no-store in next.config.
 * Identity: getVisualPreferencesForClient() arity 0 only — no client/prefs id params.
 * Mutation: upsertVisualPreferences(body) Server Action (no tenant args).
 * Not on `/profile` edit chrome.
 */
export default async function PreferencesPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result: VisualPreferencesForClientResult = {
    exists: false,
    loadFailed: true,
  };

  try {
    result = await getVisualPreferencesForClient();
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = { exists: false, loadFailed: true };
  }

  return (
    <PreferencesView
      result={result}
      locale={locale}
      copy={{
        title: t.preferences.title,
        subtitle: t.preferences.subtitle,
        updatedAt: t.preferences.updatedAt,
        save: t.preferences.save,
        cancel: t.preferences.cancel,
        saving: t.preferences.saving,
        toastSuccess: t.preferences.toastSuccess,
        emptyHint: t.preferences.emptyHint,
        disclosureNote: t.preferences.disclosureNote,
        ownAvatarDisabledConsent: t.preferences.ownAvatarDisabledConsent,
        ownAvatarAssetsNote: t.preferences.ownAvatarAssetsNote,
        modes: t.preferences.modes,
        facelessStyle: t.preferences.facelessStyle,
        errors: {
          ...t.preferences.errors,
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
        },
        error: t.preferences.error,
      }}
    />
  );
}
