import { StrategyLoading } from "@/components/strategy/StrategyLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

export default async function StrategyPageLoading() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <StrategyLoading label={t.strategy.loading.page} />;
}
