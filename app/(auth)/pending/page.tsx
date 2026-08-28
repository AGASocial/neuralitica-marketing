import { AuthShell } from "@/components/auth/AuthShell";
import { PendingActivationClient } from "@/components/auth/PendingActivationClient";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

type PendingPageProps = {
  searchParams: Promise<{ locale?: string }>;
};

export default async function PendingActivationPage({
  searchParams,
}: PendingPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
  const t = getTranslations(locale);

  return (
    <AuthShell locale={locale}>
      <PendingActivationClient
        title={t.auth.pending.title}
        body={t.auth.pending.body}
        emailLabel={t.auth.pending.emailLabel}
        logoutLabel={t.auth.pending.logoutHint}
      />
    </AuthShell>
  );
}
