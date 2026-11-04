import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { PendingActivationView } from "@/components/auth/PendingActivationView";
import { loadPendingIdentity } from "@/lib/auth/require-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

export const dynamic = "force-dynamic";

const UNTRUSTED_IDENTITY_KEYS = [
  "email",
  "displayName",
  "display_name",
  "client_id",
  "clientId",
  "auth_user_id",
  "authUserId",
  "role",
  "active",
] as const;

type PendingSearchParams = Record<string, string | string[] | undefined>;

type PendingPageProps = {
  searchParams: Promise<PendingSearchParams>;
};

function pendingHref(locale: string): string {
  if (locale === "en") {
    return "/pending";
  }
  return `/pending?locale=${encodeURIComponent(locale)}`;
}

function hasUntrustedIdentityQuery(params: PendingSearchParams): boolean {
  return UNTRUSTED_IDENTITY_KEYS.some((key) => {
    const value = params[key];
    if (value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some((entry) => entry.trim().length > 0);
    }
    return value.trim().length > 0;
  });
}

export default async function PendingActivationPage({
  searchParams,
}: PendingPageProps) {
  const identity = await loadPendingIdentity();
  const params = await searchParams;
  const locale = await resolveRequestLocale();
  const t = getTranslations(locale);

  if (hasUntrustedIdentityQuery(params)) {
    redirect(pendingHref(locale));
  }

  return (
    <AuthShell locale={locale}>
      <PendingActivationView
        title={t.auth.pending.title}
        body={t.auth.pending.body}
        emailLabel={t.auth.pending.emailLabel}
        email={identity.email}
        displayName={identity.displayName}
        logoutHint={t.auth.pending.logoutHint}
        logoutCopy={{
          label: t.auth.pending.logout,
          pendingLabel: t.auth.pending.logoutPending,
          confirmHeader: t.header.confirmHeader,
          confirmMessage: t.header.confirmMessage,
          confirmAccept: t.header.confirmAccept,
          confirmReject: t.header.confirmReject,
          stayError: t.auth.errors.forbiddenFields,
        }}
      />
    </AuthShell>
  );
}
