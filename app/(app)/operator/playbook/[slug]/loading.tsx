import { PlaybookLoading } from "@/components/playbook/PlaybookLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function PlaybookEditLoading() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <PlaybookLoading label={t.playbook.loading.form} />;
}
