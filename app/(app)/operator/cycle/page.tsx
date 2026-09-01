import { OperatorCycleView } from "@/components/cycle/OperatorCycleView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { loadOperatorClientsForStrategy } from "@/lib/content-strategy/load-operator-clients-for-strategy";
// Owned by the integrations-engineer agent building in parallel on this branch
// (CONTRACT.md "Manual trigger and loader"). Returns `OperatorWeeklyCycleRunDto[]`
// only (<= 50 newest active-client rows, per CONTRACT) — no client list. The
// active-client selector reuses the same `loadOperatorClientsForStrategy()`
// loader as the Strategy page (Server Actions re-validate live-allowlist /
// active status regardless of what is shown here).
import { loadOperatorWeeklyCycleRuns } from "@/lib/orchestration/load-operator-weekly-cycle-runs";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

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
 * Operator weekly cycle control (US-15.1 Phase B).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 * Server-loaded active client set + last-run rows; mutations run through
 * `triggerWeeklyCycleForClient` / `previewWeeklyCycleForClient` /
 * `resumeWeeklyCycleRun` Server Actions from the Client Component below.
 */
export default async function OperatorCyclePage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const currentWeekStart = normalizeToIsoMonday(new Date());

  let clients: Awaited<ReturnType<typeof loadOperatorClientsForStrategy>> = [];
  let runs: Awaited<ReturnType<typeof loadOperatorWeeklyCycleRuns>> = [];
  let loadFailed = false;

  try {
    [clients, runs] = await Promise.all([
      loadOperatorClientsForStrategy(),
      loadOperatorWeeklyCycleRuns(),
    ]);
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    loadFailed = true;
    clients = [];
    runs = [];
  }

  return (
    <OperatorCycleView
      clients={clients}
      runs={runs}
      loadFailed={loadFailed}
      locale={locale}
      currentWeekStart={currentWeekStart}
      copy={{
        title: t.operator.cycle.page.title,
        subtitle: t.operator.cycle.page.subtitle,
        backDashboard: t.operator.cycle.page.backDashboard,
        clientLabel: t.operator.cycle.page.clientLabel,
        clientPlaceholder: t.operator.cycle.page.clientPlaceholder,
        weekLabel: t.operator.cycle.page.weekLabel,
        dryRunCta: t.operator.cycle.page.dryRunCta,
        dryRunPending: t.operator.cycle.page.dryRunPending,
        runCta: t.operator.cycle.page.runCta,
        runPending: t.operator.cycle.page.runPending,
        resumeCta: t.operator.cycle.page.resumeCta,
        resumePending: t.operator.cycle.page.resumePending,
        emptyClients: t.operator.cycle.page.emptyClients,
        emptyRuns: t.operator.cycle.page.emptyRuns,
        loadError: t.operator.cycle.page.loadError,
        selectClientFirst: t.operator.cycle.page.selectClientFirst,
        toastDryRunSuccess: t.operator.cycle.page.toastDryRunSuccess,
        toastRunStarted: t.operator.cycle.page.toastRunStarted,
        toastAlreadyRunning: t.operator.cycle.page.toastAlreadyRunning,
        toastAlreadyCompleted: t.operator.cycle.page.toastAlreadyCompleted,
        toastResumeSuccess: t.operator.cycle.page.toastResumeSuccess,
        columns: t.operator.cycle.page.columns,
        mode: t.operator.cycle.page.mode,
        status: t.operator.cycle.page.status,
        slotStatus: t.operator.cycle.page.slotStatus,
        steps: t.operator.cycle.page.steps,
        slotLabel: t.operator.cycle.page.slotLabel,
        notStarted: t.operator.cycle.page.notStarted,
        weekOptionCurrent: t.operator.cycle.page.weekOptionCurrent,
        weekOptionNext: t.operator.cycle.page.weekOptionNext,
        weekOptionNextTwo: t.operator.cycle.page.weekOptionNextTwo,
        errors: t.operator.cycle.errors,
      }}
    />
  );
}
