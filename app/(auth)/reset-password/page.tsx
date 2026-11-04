import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

type ResetPasswordPageProps = {
  searchParams: Promise<{ locale?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  await searchParams;
  const locale = await resolveRequestLocale();
  const t = getTranslations(locale);

  return (
    <AuthShell locale={locale}>
      <ResetPasswordForm
        locale={locale}
        copy={t.auth.reset}
        errorsCopy={t.auth.errors}
      />
    </AuthShell>
  );
}
