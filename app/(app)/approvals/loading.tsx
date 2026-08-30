import { ApprovalsLoading } from "@/components/approvals/ApprovalsLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function ApprovalsLoadingPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <ApprovalsLoading label={t.approvals.list.loading} />;
}
