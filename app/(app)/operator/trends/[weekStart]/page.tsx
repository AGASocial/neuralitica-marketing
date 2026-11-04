import Link from "next/link";

import { TrendWeekEditorView } from "@/components/trend/TrendWeekEditorView";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { TrendSnapshotForOperatorResult } from "@/lib/contracts/trend";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { loadTrendSnapshotForOperator } from "@/lib/trend/load-trend-snapshot-for-operator";

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

type TrendWeekEditorPageProps = {
  params: Promise<{ weekStart: string }>;
};

/**
 * Operator week snapshot editor — entry list (US-16.2).
 */
export default async function TrendWeekEditorPage({ params }: TrendWeekEditorPageProps) {
  const { weekStart } = await params;
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result: TrendSnapshotForOperatorResult;

  try {
    result = await loadTrendSnapshotForOperator(weekStart);
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = {
      ok: false,
      error: {
        code: "NOT_FOUND",
        messageKey: "trend.errors.weekNotFound",
      },
    };
  }

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-[820px]">
        <h1 className="mb-4 font-display text-4xl text-fog">
          {t.trend.week.title}
        </h1>
        <StatusAlert
          severity="error"
          text={t.trend.errors.weekNotFound}
          className="mb-4 w-full"
        />
        <Button asChild>
          <Link href="/operator/trends">{t.trend.week.backList}</Link>
        </Button>
      </div>
    );
  }

  return (
    <TrendWeekEditorView
      snapshot={result.snapshot}
      locale={locale}
      copy={{
        title: t.trend.week.title,
        subtitle: t.trend.week.subtitle,
        addEntry: t.trend.week.addEntry,
        backList: t.trend.week.backList,
        empty: t.trend.week.empty,
        publishedLabel: t.trend.week.publishedLabel,
        updatedLabel: t.trend.week.updatedLabel,
        columns: t.trend.week.columns,
        status: t.trend.week.status,
        edit: t.trend.week.edit,
      }}
    />
  );
}
