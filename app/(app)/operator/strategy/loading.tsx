import { StrategyLoading } from "@/components/strategy/StrategyLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function StrategyPageLoading() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <StrategyLoading label={t.strategy.loading.page} />;
}
