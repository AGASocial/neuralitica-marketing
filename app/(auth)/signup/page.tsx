import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

type SignupPageProps = {
  searchParams: Promise<{ locale?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  await searchParams;
  const locale = await resolveRequestLocale();
  const t = getTranslations(locale);

  return (
    <AuthShell locale={locale}>
      <SignupForm
        locale={locale}
        copy={t.auth.signup}
        errorsCopy={t.auth.errors}
        passwordPolicyCopy={t.auth.passwordPolicy}
      />
    </AuthShell>
  );
}
