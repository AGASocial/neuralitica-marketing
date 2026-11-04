"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <div aria-busy="true" aria-live="polite" className="space-y-3">
      <Skeleton className="h-5 w-3/5 bg-edge" />
      <Skeleton className="h-32 w-full bg-edge" />
    </div>
  );
}

function InsightsEmptyState({ copy }: { copy: StrategyInsightsCopy }) {
  return (
    <div className="space-y-3">
      <StatusAlert severity="info" text={copy.empty} />
      <p className="text-sm">
        <Link
          href="/operator/calendar"
          className="text-butter underline-offset-4 hover:underline"
        >
          {copy.calendarHint}
        </Link>
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

  const numericColumns: Array<{
    key: keyof Pick<
      StrategyPerformanceThemeRow,
      | "reelCount"
      | "views"
      | "likes"
      | "comments"
      | "saves"
      | "dms"
      | "engagementScore"
    >;
    header: string;
  }> = [
    { key: "reelCount", header: copy.columns.reelCount },
    { key: "views", header: copy.columns.views },
    { key: "likes", header: copy.columns.likes },
    { key: "comments", header: copy.columns.comments },
    { key: "saves", header: copy.columns.saves },
    { key: "dms", header: copy.columns.dms },
    { key: "engagementScore", header: copy.columns.engagementScore },
  ];

  return (
    <div>
      <p className="mb-4 text-sm text-dim">{lookback}</p>
      {insights.topThemes.length === 0 ? (
        <p className="text-sm text-dim">{copy.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-edge hover:bg-transparent">
              <TableHead className="w-12 text-dim">#</TableHead>
              <TableHead className="text-dim">{copy.columns.tema}</TableHead>
              {numericColumns.map((column) => (
                <TableHead key={column.key} className="text-right text-dim">
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {insights.topThemes.map((row) => (
              <TableRow
                key={`${row.rank}-${row.tema}`}
                className="border-edge even:bg-deep/40 hover:bg-deep/70"
              >
                <TableCell className="text-dim">{row.rank}</TableCell>
                <TableCell className="whitespace-normal font-medium text-fog">
                  {row.tema}
                </TableCell>
                {numericColumns.map((column) => (
                  <TableCell key={column.key} className="text-right tabular-nums">
                    {formatInteger(row[column.key], locale)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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
    <Card className="border-edge bg-panel/60 py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-display text-2xl font-normal text-fog">
          {copy.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        {error ? <StatusAlert severity="error" text={error} /> : null}

        {loading ? (
          <InsightsLoadingSkeleton />
        ) : insights ? (
          <InsightsDataTable insights={insights} locale={locale} copy={copy} />
        ) : (
          <InsightsEmptyState copy={copy} />
        )}
      </CardContent>
    </Card>
  );
}
