import { PlaybookLoading } from "@/components/playbook/PlaybookLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

export default async function PlaybookEditLoading() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <PlaybookLoading label={t.playbook.loading.form} />;
}
