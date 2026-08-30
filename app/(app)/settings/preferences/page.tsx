import { PreferencesView } from "@/components/preferences/PreferencesView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { AvatarConsentForClientResult } from "@/lib/contracts/avatar-consent";
import { AVATAR_CONSENT_DISCLOSURE_V1 } from "@/lib/contracts/avatar-consent";
import type { AvatarReferenceAssetsPageResult } from "@/lib/contracts/media-assets";
import { AVATAR_REFERENCE_MAX_ASSETS } from "@/lib/contracts/media-assets";
import type { VisualPreferencesForClientResult } from "@/lib/contracts/visual-preferences";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getAvatarReferenceAssetsForClient } from "@/lib/media/get-avatar-reference-assets-for-client";
import { getAvatarConsentForClient } from "@/lib/visual-preferences/get-avatar-consent-for-client";
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
 * Preferencias de producción visual (US-3.1 / US-3.2 / US-3.3).
 * Auth via `(app)` layout `requireActive("page")`. Cache: no-store in next.config.
 * Identity: arity-0 loaders only — no client/prefs/asset id params.
 * Mutations: upsertVisualPreferences · grant/revoke consent · upload/delete references.
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

  let consent: AvatarConsentForClientResult = {
    active: false,
    consentedAt: null,
    consentVersion: null,
    currentConsentVersion: AVATAR_CONSENT_DISCLOSURE_V1,
    reason: "load_failed",
  };

  let references: AvatarReferenceAssetsPageResult = {
    assets: [],
    maxAssets: AVATAR_REFERENCE_MAX_ASSETS,
    canUpload: false,
    ownAvatarConsentActive: false,
    loadFailed: true,
  };

  try {
    const [prefsResult, consentResult] = await Promise.all([
      getVisualPreferencesForClient(),
      getAvatarConsentForClient(),
    ]);
    result = prefsResult;
    consent = consentResult;
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = { exists: false, loadFailed: true };
  }

  try {
    references = await getAvatarReferenceAssetsForClient();
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    references = {
      assets: [],
      maxAssets: AVATAR_REFERENCE_MAX_ASSETS,
      canUpload: false,
      ownAvatarConsentActive: consent.active,
      loadFailed: true,
    };
  }

  return (
    <PreferencesView
      result={result}
      consent={consent}
      references={references}
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
        disclosureLine: t.legal.genericAvatarDisclosure,
        disclosurePreviewNote: t.preferences.disclosurePreview.note,
        ownAvatarDisabledConsent: t.preferences.ownAvatarDisabledConsent,
        ownAvatarAssetsNote: t.preferences.ownAvatarAssetsNote,
        modes: t.preferences.modes,
        facelessStyle: t.preferences.facelessStyle,
        voice: t.preferences.voice,
        errors: {
          ...t.preferences.errors,
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
        },
        error: t.preferences.error,
      }}
      consentCopy={t.preferences.consent}
      referencesCopy={t.preferences.references}
    />
  );
}
