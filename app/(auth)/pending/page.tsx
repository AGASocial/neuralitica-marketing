import { PendingActivationView } from "@/components/auth/PendingActivationView";
import { AuthShell } from "@/components/auth/AuthShell";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

type PendingPageProps = {
  searchParams: Promise<{ locale?: string; email?: string }>;
};

export default async function PendingActivationPage({
  searchParams,
}: PendingPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
  const t = getTranslations(locale);
  const email = params.email?.trim() || undefined;

  return (
    <AuthShell locale={locale}>
      <PendingActivationView
        title={t.auth.pending.title}
        body={t.auth.pending.body}
        emailLabel={t.auth.pending.emailLabel}
        email={email}
        logoutLabel={t.auth.pending.logoutHint}
      />
    </AuthShell>
  );
}
