import "server-only";

/**
 * Disclosure text version bound to EN/ES i18n keys for Consentimiento de avatar.
 * Bumping this constant after legal copy change forces re-consent (probe treats
 * prior non-revoked rows with old version as inactive).
 */
export const AVATAR_CONSENT_DISCLOSURE_V1 = "AVATAR_CONSENT_DISCLOSURE_V1" as const;

export type AvatarConsentDisclosureVersion =
  typeof AVATAR_CONSENT_DISCLOSURE_V1;

/** Current version used by probe, grant, and loader. */
export const CURRENT_AVATAR_CONSENT_VERSION = AVATAR_CONSENT_DISCLOSURE_V1;
