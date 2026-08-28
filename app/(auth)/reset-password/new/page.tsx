import { AuthShell } from "@/components/auth/AuthShell";
import { SetNewPasswordForm } from "@/components/auth/SetNewPasswordForm";
import { isRecoverySessionReady } from "@/lib/auth/recovery-session";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type SetNewPasswordPageProps = {
  searchParams: Promise<{
    locale?: string;
    error?: string;
  }>;
};

async function readRecoveryReady(error: string | undefined): Promise<boolean> {
  if (error === "invalid") {
    return false;
  }

  return isRecoverySessionReady();
}

export default async function SetNewPasswordPage({
  searchParams,
}: SetNewPasswordPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
  const t = getTranslations(locale);
  const recoveryReady = await readRecoveryReady(params.error);

  return (
    <AuthShell locale={locale}>
      <SetNewPasswordForm
        locale={locale}
        recoveryReady={recoveryReady}
        copy={t.auth.reset}
        errorsCopy={t.auth.errors}
        passwordPolicyCopy={t.auth.passwordPolicy}
      />
    </AuthShell>
  );
}
