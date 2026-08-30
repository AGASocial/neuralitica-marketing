import { ScriptsLoading } from "@/components/scripts/ScriptsLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function ScriptsPageLoading() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <ScriptsLoading label={t.scripts.loading.page} />;
}
