import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

export const dynamic = "force-dynamic";

/**
 * General settings hub — links to Preferencias and other account settings.
 */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-dim no-underline hover:text-fog"
        >
          ← {t.accountSettings.backDashboard}
        </Link>
        <h1 className="font-display mt-3 text-3xl text-fog">
          {t.accountSettings.title}
        </h1>
        <p className="mt-2 text-dim">{t.accountSettings.subtitle}</p>
      </div>

      <ul className="space-y-3">
        <li>
          <Link
            href="/settings/preferences"
            className="block rounded-lg border border-edge bg-panel px-4 py-3 no-underline transition-colors hover:border-butter/40"
          >
            <span className="font-medium text-fog">
              {t.accountSettings.preferencesLink}
            </span>
            <span className="mt-1 block text-sm text-dim">
              {t.accountSettings.preferencesHint}
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
