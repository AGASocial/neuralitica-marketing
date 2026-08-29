import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";

import { TrendWeekEditorView } from "@/components/trend/TrendWeekEditorView";
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
      <div style={{ maxWidth: "820px", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 1rem", fontSize: "2rem" }}>
          {t.trend.week.title}
        </h1>
        <Message
          severity="error"
          text={t.trend.errors.weekNotFound}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
        <Link href="/operator/trends" style={{ textDecoration: "none" }}>
          <Button type="button" label={t.trend.week.backList} />
        </Link>
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
