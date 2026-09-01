import { OperatorCycleLoading } from "@/components/cycle/OperatorCycleLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function OperatorCyclePageLoading() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <OperatorCycleLoading label={t.operator.cycle.loading.page} />;
}
