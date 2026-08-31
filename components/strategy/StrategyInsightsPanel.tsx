"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Message } from "primereact/message";
import { Panel } from "primereact/panel";
import { Skeleton } from "primereact/skeleton";

import type {
  StrategyInsightsErrorCode,
  StrategyPerformanceInsightsDto,
  StrategyPerformanceThemeRow,
} from "@/lib/contracts/strategy-insights";
import { getStrategyPerformanceInsights } from "@/lib/metrics/actions/get-strategy-performance-insights";

type StrategyInsightsCopy = {
  title: string;
  empty: string;
  lookbackLabel: string;
  calendarHint: string;
  columns: {
    tema: string;
    reelCount: string;
    views: string;
    likes: string;
    comments: string;
    saves: string;
    dms: string;
    engagementScore: string;
  };
  errors: {
    validation: string;
    notFound: string;
    forbiddenFields: string;
    forbidden: string;
    unauthenticated: string;
    internal: string;
  };
};

type StrategyInsightsPanelProps = {
  initialInsights: StrategyPerformanceInsightsDto | null;
  clientId: string;
  weekStart: string;
  locale: string;
  copy: StrategyInsightsCopy;
};

function formatIsoDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(`${iso}T12:00:00.000Z`),
    );
  } catch {
    return iso;
  }
}

function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function messageForInsightsError(
  code: StrategyInsightsErrorCode,
  messageKey: string | undefined,
  copy: StrategyInsightsCopy,
): string {
  if (messageKey === "strategy.insights.errors.validation") {
    return copy.errors.validation;
  }
  if (messageKey === "strategy.insights.errors.notFound") {
    return copy.errors.notFound;
  }
  if (messageKey === "strategy.errors.forbiddenFields") {
    return copy.errors.forbiddenFields;
  }
  if (messageKey === "auth.errors.unauthenticated") {
    return copy.errors.unauthenticated;
  }
  if (messageKey === "auth.errors.forbidden") {
    return copy.errors.forbidden;
  }

  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

function InsightsLoadingSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton height="1.25rem" width="60%" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="8rem" />
    </div>
  );
}

function InsightsEmptyState({ copy }: { copy: StrategyInsightsCopy }) {
  return (
    <div>
      <Message severity="info" text={copy.empty} style={{ width: "100%" }} />
      <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem" }}>
        <Link href="/operator/calendar">{copy.calendarHint}</Link>
      </p>
    </div>
  );
}

function InsightsDataTable({
  insights,
  locale,
  copy,
}: {
  insights: StrategyPerformanceInsightsDto;
  locale: string;
  copy: StrategyInsightsCopy;
}) {
  const lookback = copy.lookbackLabel
    .replace("{windowStart}", formatIsoDate(insights.windowStart, locale))
    .replace("{windowEnd}", formatIsoDate(insights.windowEnd, locale));

  return (
    <div>
      <p style={{ margin: "0 0 1rem", color: "#6b7280", fontSize: "0.875rem" }}>
        {lookback}
      </p>
      <DataTable
        value={insights.topThemes}
        stripedRows
        size="small"
        emptyMessage={copy.empty}
      >
        <Column field="rank" header="#" style={{ width: "3rem" }} />
        <Column field="tema" header={copy.columns.tema} />
        <Column
          field="reelCount"
          header={copy.columns.reelCount}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.reelCount, locale)
          }
        />
        <Column
          field="views"
          header={copy.columns.views}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.views, locale)
          }
        />
        <Column
          field="likes"
          header={copy.columns.likes}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.likes, locale)
          }
        />
        <Column
          field="comments"
          header={copy.columns.comments}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.comments, locale)
          }
        />
        <Column
          field="saves"
          header={copy.columns.saves}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.saves, locale)
          }
        />
        <Column
          field="dms"
          header={copy.columns.dms}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.dms, locale)
          }
        />
        <Column
          field="engagementScore"
          header={copy.columns.engagementScore}
          body={(row: StrategyPerformanceThemeRow) =>
            formatInteger(row.engagementScore, locale)
          }
        />
      </DataTable>
    </div>
  );
}

export function StrategyInsightsPanel({
  initialInsights,
  clientId,
  weekStart,
  locale,
  copy,
}: StrategyInsightsPanelProps) {
  const [insights, setInsights] = useState(initialInsights);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipClientFetchRef = useRef(true);

  useEffect(() => {
    setInsights(initialInsights);
    setError(null);
  }, [initialInsights]);

  useEffect(() => {
    if (skipClientFetchRef.current) {
      skipClientFetchRef.current = false;
      return;
    }

    let cancelled = false;

    async function refetchInsights() {
      setLoading(true);
      setError(null);

      try {
        const result = await getStrategyPerformanceInsights({ clientId, weekStart });

        if (cancelled) {
          return;
        }

        if (result.ok) {
          setInsights(result.insights);
          return;
        }

        setError(
          messageForInsightsError(
            result.error.code,
            result.error.messageKey,
            copy,
          ),
        );
      } catch {
        if (!cancelled) {
          setError(copy.errors.internal);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void refetchInsights();

    return () => {
      cancelled = true;
    };
  }, [clientId, copy]);

  return (
    <Panel header={copy.title} style={{ marginBottom: "1.5rem" }}>
      {error ? (
        <Message
          severity="error"
          text={error}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {loading ? (
        <InsightsLoadingSkeleton />
      ) : insights ? (
        <InsightsDataTable insights={insights} locale={locale} copy={copy} />
      ) : (
        <InsightsEmptyState copy={copy} />
      )}
    </Panel>
  );
}
