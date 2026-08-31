import { StrategyPageView } from "@/components/strategy/StrategyPageView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ContentStrategyView } from "@/lib/contracts/content-strategy";
import { agentClientIdSchema } from "@/lib/contracts/profile";
import { getLatestContentStrategy } from "@/lib/content-strategy/actions/get-latest-content-strategy";
import { loadOperatorClientsForStrategy } from "@/lib/content-strategy/load-operator-clients-for-strategy";
import type { OperatorClientOption } from "@/lib/content-strategy/load-operator-clients-for-strategy";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { aggregateReelMetricsByTema } from "@/lib/metrics/aggregate-reel-metrics-by-tema";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

export const dynamic = "force-dynamic";

type StrategyPageProps = {
  searchParams: Promise<{ weekStart?: string; clientId?: string }>;
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

function resolveSelectedClientId(
  queryClientId: string | undefined,
  sessionClientId: string,
  clients: OperatorClientOption[],
): string {
  const activeIds = new Set(clients.map((client) => client.id));
  const parsedClientId = queryClientId
    ? agentClientIdSchema.safeParse(queryClientId)
    : null;

  if (parsedClientId?.success && activeIds.has(parsedClientId.data)) {
    return parsedClientId.data;
  }
  if (activeIds.has(sessionClientId)) {
    return sessionClientId;
  }
  if (clients.length > 0) {
    return clients[0].id;
  }
  return sessionClientId;
}

/**
 * Operator weekly content strategy hub (US-4.1).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function StrategyPage({ searchParams }: StrategyPageProps) {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const { weekStart: rawWeekStart, clientId: rawClientId } = await searchParams;
  const weekStart = resolveWeekStart(rawWeekStart);

  let strategyResult:
    | Awaited<ReturnType<typeof getLatestContentStrategy>>
    | { loadFailed: true };
  let clients: Awaited<ReturnType<typeof loadOperatorClientsForStrategy>> = [];

  try {
    [strategyResult, clients] = await Promise.all([
      getLatestContentStrategy({ weekStart }),
      loadOperatorClientsForStrategy(),
    ]);
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    strategyResult = { loadFailed: true };
  }

  let strategy: ContentStrategyView | null = null;
  let playbookLabels: Record<string, string> | undefined;
  let loadFailed = false;

  if ("loadFailed" in strategyResult) {
    loadFailed = true;
  } else if (!strategyResult.ok) {
    loadFailed = strategyResult.error.code !== "FORBIDDEN";
  } else if (strategyResult.strategy) {
    strategy = strategyResult.strategy;
    playbookLabels = strategyResult.playbookLabels;
  }

  const selectedClientId = resolveSelectedClientId(
    rawClientId,
    user?.id ?? "",
    clients,
  );

  let initialInsights: Awaited<ReturnType<typeof aggregateReelMetricsByTema>> =
    null;

  try {
    initialInsights = await aggregateReelMetricsByTema({
      clientId: selectedClientId,
      weekStart,
    });
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    initialInsights = null;
  }

  return (
    <StrategyPageView
      weekStart={weekStart}
      sessionClientId={user?.id ?? ""}
      selectedClientId={selectedClientId}
      clients={clients}
      initialInsights={initialInsights}
      strategy={strategy}
      playbookLabels={playbookLabels}
      loadFailed={loadFailed}
      locale={locale}
      copy={{
        title: t.strategy.page.title,
        subtitle: t.strategy.page.subtitle,
        generate: t.strategy.page.generate,
        regenerate: t.strategy.page.regenerate,
        generating: t.strategy.page.generating,
        save: t.strategy.page.save,
        saving: t.strategy.page.saving,
        approve: t.strategy.page.approve,
        approving: t.strategy.page.approving,
        clientLabel: t.strategy.page.clientLabel,
        clientSessionHint: t.strategy.page.clientSessionHint,
        weekLabel: t.strategy.page.weekLabel,
        empty: t.strategy.page.empty,
        loadError: t.strategy.page.loadError,
        backDashboard: t.strategy.page.backDashboard,
        versionLabel: t.strategy.page.versionLabel,
        versionLabelApproved: t.strategy.page.versionLabelApproved,
        toastGenerateSuccess: t.strategy.page.toastGenerateSuccess,
        toastSaveSuccess: t.strategy.page.toastSaveSuccess,
        toastApproveSuccess: t.strategy.page.toastApproveSuccess,
        approvedLockedHint: t.strategy.page.approvedLockedHint,
        approvalCaption: t.strategy.page.approvalCaption,
        viewScripts: t.scripts.page.viewScripts,
        status: t.strategy.page.status,
        sections: t.strategy.page.sections,
        slot: t.strategy.page.slot,
        themes: t.strategy.page.themes,
        goals: t.strategy.page.goals,
        days: t.strategy.page.days,
        modalities: t.playbook.enums.modalities,
        errors: {
          validation: t.strategy.errors.validation,
          forbiddenFields: t.strategy.errors.forbiddenFields,
          notFound: t.strategy.errors.notFound,
          rateLimited: t.strategy.errors.rateLimited,
          inFlight: t.strategy.errors.inFlight,
          profileIncomplete: t.strategy.errors.profileIncomplete,
          agentOutputInvalid: t.strategy.errors.agentOutputInvalid,
          providerUnavailable: t.strategy.errors.providerUnavailable,
          notMonday: t.strategy.errors.notMonday,
          notDraft: t.strategy.errors.notDraft,
          invalidTransition: t.strategy.errors.invalidTransition,
          locked: t.strategy.errors.locked,
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
          internal: t.strategy.errors.internal,
        },
        insights: {
          title: t.strategy.insights.title,
          empty: t.strategy.insights.empty,
          lookbackLabel: t.strategy.insights.lookbackLabel,
          calendarHint: t.strategy.insights.calendarHint,
          columns: t.strategy.insights.columns,
          errors: {
            validation: t.strategy.insights.errors.validation,
            notFound: t.strategy.insights.errors.notFound,
            forbiddenFields: t.strategy.errors.forbiddenFields,
            forbidden: t.auth.errors.forbidden,
            unauthenticated: t.auth.errors.unauthenticated,
            internal: t.strategy.errors.internal,
          },
        },
      }}
    />
  );
}
