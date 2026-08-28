import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

type SignupPageProps = {
  searchParams: Promise<{ locale?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
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
