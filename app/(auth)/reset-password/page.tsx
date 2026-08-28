import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

type ResetPasswordPageProps = {
  searchParams: Promise<{ locale?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
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
