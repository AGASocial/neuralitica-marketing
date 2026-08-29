import { TrendWeekListView } from "@/components/trend/TrendWeekListView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { loadTrendWeekListForOperator } from "@/lib/trend/load-trend-week-list-for-operator";

export const dynamic = "force-dynamic";

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

/**
 * Operator Snapshot de tendencias week list (US-16.2).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function TrendWeekListPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  const result = await loadTrendWeekListForOperator().catch((error: unknown) => {
    if (isNextNavigationError(error)) {
      throw error;
    }
    return { ok: false as const, loadFailed: true as const };
  });

  return (
    <TrendWeekListView
      result={result}
      locale={locale}
      copy={{
        title: t.trend.list.title,
        subtitle: t.trend.list.subtitle,
        publish: t.trend.list.publish,
        publishDialogTitle: t.trend.list.publishDialogTitle,
        publishDialogHint: t.trend.list.publishDialogHint,
        publishDialogWeekLabel: t.trend.list.publishDialogWeekLabel,
        publishDialogSubmit: t.trend.list.publishDialogSubmit,
        publishDialogCancel: t.trend.list.publishDialogCancel,
        publishing: t.trend.list.publishing,
        empty: t.trend.list.empty,
        loadError: t.trend.list.loadError,
        backDashboard: t.trend.list.backDashboard,
        toastPublishSuccess: t.trend.list.toastPublishSuccess,
        columns: t.trend.list.columns,
        manage: t.trend.list.manage,
        errors: {
          ...t.trend.errors,
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
        },
      }}
    />
  );
}
