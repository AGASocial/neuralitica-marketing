import { InterviewLoading } from "@/components/interview/InterviewLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function InterviewRouteLoading() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <InterviewLoading label={t.interview.loading} />;
}
