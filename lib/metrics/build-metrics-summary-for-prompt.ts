import "server-only";

import {
  metricsSummaryForPromptSchema,
  type MetricsSummaryForPrompt,
  type StrategyPerformanceInsightsDto,
} from "@/lib/contracts/strategy-insights";
import { sanitizeTemaForMetricsPrompt } from "@/lib/metrics/sanitize-tema-for-metrics-prompt";

export function buildMetricsSummaryForPrompt(
  insights: StrategyPerformanceInsightsDto | null,
): MetricsSummaryForPrompt | null {
  if (insights === null) {
    return null;
  }

  const rows = insights.topThemes.map((row) => {
    const sanitizedTema = sanitizeTemaForMetricsPrompt(row.tema);
    const promptRow = {
      rank: row.rank,
      reelCount: row.reelCount,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      saves: row.saves,
      dms: row.dms,
      engagementScore: row.engagementScore,
      ...(sanitizedTema !== null ? { tema: sanitizedTema } : {}),
    };
    return promptRow;
  });

  return metricsSummaryForPromptSchema.parse(rows);
}
