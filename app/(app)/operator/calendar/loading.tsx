import { CalendarLoading } from "@/components/calendar/CalendarLoading";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";

export default async function OperatorCalendarPageLoading() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  return <CalendarLoading label={t.calendar.loading.page} />;
}
