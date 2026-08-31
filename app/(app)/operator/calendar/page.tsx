import { OperatorCalendarView } from "@/components/calendar/OperatorCalendarView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getOperatorCalendarForWeek } from "@/lib/calendar/actions/get-operator-calendar-for-week";
import type { GetOperatorCalendarForWeekSuccess } from "@/lib/contracts/calendar";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

export const dynamic = "force-dynamic";

type CalendarPageProps = {
  searchParams: Promise<{ weekStart?: string }>;
};

function isNextNavigationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_HTTP_ERROR"))
  );
}

function resolveWeekStart(query?: string): string {
  const parsed = query ? trendWeekStartSchema.safeParse(query) : null;
  if (parsed?.success) {
    return parsed.data;
  }
  return normalizeToIsoMonday(new Date());
}

const EMPTY_CALENDAR_DATA: Omit<GetOperatorCalendarForWeekSuccess, "ok" | "weekStart"> = {
  clients: [],
  slots: [],
  gapWarnings: [],
  clientsWithoutApprovedStrategyCount: 0,
};

/**
 * Operator content calendar (US-12.1).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function OperatorCalendarPage({ searchParams }: CalendarPageProps) {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const { weekStart: rawWeekStart } = await searchParams;
  const weekStart = resolveWeekStart(rawWeekStart);

  let calendarResult: Awaited<ReturnType<typeof getOperatorCalendarForWeek>>;
  let loadFailed = false;

  try {
    calendarResult = await getOperatorCalendarForWeek({ weekStart });
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    loadFailed = true;
    calendarResult = { ok: true, weekStart, ...EMPTY_CALENDAR_DATA };
  }

  if (!loadFailed && !calendarResult.ok) {
    loadFailed = calendarResult.error.code !== "FORBIDDEN";
  }

  const data: GetOperatorCalendarForWeekSuccess = calendarResult.ok
    ? calendarResult
    : { ok: true, weekStart, ...EMPTY_CALENDAR_DATA };

  return (
    <OperatorCalendarView
      weekStart={weekStart}
      sessionClientId={user?.id ?? ""}
      data={data}
      loadFailed={loadFailed}
      locale={locale}
      copy={{
        title: t.calendar.page.title,
        subtitle: t.calendar.page.subtitle,
        weekLabel: t.calendar.page.weekLabel,
        prevWeek: t.calendar.page.prevWeek,
        nextWeek: t.calendar.page.nextWeek,
        emptyWeek: t.calendar.page.emptyWeek,
        loadError: t.calendar.page.loadError,
        backDashboard: t.calendar.page.backDashboard,
        gapWarning: t.calendar.page.gapWarning,
        clientsWithoutStrategy: t.calendar.page.clientsWithoutStrategy,
        sidebar: t.calendar.sidebar,
        status: {
          draft: t.calendar.status.draft,
          generating: t.calendar.status.generating,
          qa: t.calendar.status.qa,
          pending: t.calendar.status.pending,
          approved: t.calendar.status.approved,
          published: t.calendar.status.published,
        },
        changesRequestedLabel: t.calendar.status.changesRequested,
        goals: t.strategy.page.goals,
        markPublished: {
          markCta: t.calendar.markPublished.markCta,
          updateCta: t.calendar.markPublished.updateCta,
          dialogTitle: t.calendar.markPublished.dialogTitle,
          dialogTitleUpdate: t.calendar.markPublished.dialogTitleUpdate,
          publishedDateLabel: t.calendar.markPublished.publishedDateLabel,
          publishedOnLabel: t.calendar.markPublished.publishedOnLabel,
          instagramUrlLabel: t.calendar.markPublished.instagramUrlLabel,
          instagramUrlHint: t.calendar.markPublished.instagramUrlHint,
          submit: t.calendar.markPublished.submit,
          submitPending: t.calendar.markPublished.submitPending,
          cancel: t.calendar.markPublished.cancel,
          viewOnInstagram: t.calendar.markPublished.viewOnInstagram,
          errors: t.calendar.markPublished.errors,
        },
        metrics: {
          title: t.calendar.metrics.title,
          views: t.calendar.metrics.views,
          likes: t.calendar.metrics.likes,
          comments: t.calendar.metrics.comments,
          saves: t.calendar.metrics.saves,
          dms: t.calendar.metrics.dms,
          recordedAtLabel: t.calendar.metrics.recordedAtLabel,
          save: t.calendar.metrics.save,
          savePending: t.calendar.metrics.savePending,
          success: t.calendar.metrics.success,
          editWindowExpired: t.calendar.metrics.editWindowExpired,
          errors: t.calendar.metrics.errors,
        },
      }}
    />
  );
}
