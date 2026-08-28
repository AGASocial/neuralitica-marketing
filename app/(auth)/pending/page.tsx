import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { PendingActivationView } from "@/components/auth/PendingActivationView";
import { loadPendingIdentity } from "@/lib/auth/require-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

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

function firstString(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

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
  const locale = resolveLocale(firstString(params.locale));
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
        logoutLabel={t.auth.pending.logoutHint}
      />
    </AuthShell>
  );
}
