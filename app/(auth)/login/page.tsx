import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

type LoginPageProps = {
  searchParams: Promise<{
    locale?: string;
    next?: string;
    redirectTo?: string;
    confirmed?: string;
    error?: string;
    reset?: string;
  }>;
};

function pickNextCandidate(params: {
  next?: string;
  redirectTo?: string;
}): string | undefined {
  const fromNext = params.next?.trim();
  if (fromNext) {
    return fromNext;
  }

  const fromRedirectTo = params.redirectTo?.trim();
  if (fromRedirectTo) {
    return fromRedirectTo;
  }

  return undefined;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const locale = resolveLocale(params.locale);
  const t = getTranslations(locale);
  const next = pickNextCandidate(params);
  const banner =
    params.reset === "1"
      ? "resetSuccess"
      : params.confirmed === "1"
        ? "confirmed"
        : params.error === "confirmation"
          ? "confirmationFailed"
          : undefined;

  return (
    <AuthShell locale={locale}>
      <LoginForm
        locale={locale}
        copy={t.auth.login}
        errorsCopy={t.auth.errors}
        next={next}
        banner={banner}
      />
    </AuthShell>
  );
}
