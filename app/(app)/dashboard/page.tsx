import { redirect } from "next/navigation";

import { HoyFeedView } from "@/components/dashboard/HoyFeedView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { OwnerHomeNextStepKey } from "@/lib/contracts/owner-home-dashboard";
import type { HoyFeedDto } from "@/lib/contracts/hoy-feed";
import { buildOwnerHomeNextAction } from "@/lib/dashboard/compute-owner-home-snapshot";
import { shouldShowSetupCompletionOnHome } from "@/lib/dashboard/compute-setup-completion";
import { loadHoyFeed } from "@/lib/dashboard/load-hoy-feed";
import { loadShouldEnterOptionAOnboarding } from "@/lib/dashboard/load-option-a-onboarding-gate";
import { loadSetupCompletion } from "@/lib/dashboard/load-setup-completion";
import type { SetupCompletionDto } from "@/lib/contracts/setup-completion";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";
import { isSupabaseConfigured } from "@/lib/supabase/server";

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

function nextActionCopyFor(
  t: ReturnType<typeof getTranslations>["dashboard"]["nextAction"],
  stepKey: OwnerHomeNextStepKey,
) {
  const step = t[stepKey];
  return {
    sectionTitle: t.sectionTitle,
    title: step.title,
    body: step.body,
    cta: step.cta,
  };
}

type DashboardPageProps = {
  searchParams: Promise<{ skipOnboarding?: string }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const supabaseReady = isSupabaseConfigured();
  const params = await searchParams;
  const skipOnboarding = params.skipOnboarding === "1";

  if (user && !skipOnboarding) {
    try {
      const enterOnboarding = await loadShouldEnterOptionAOnboarding({ user });
      if (enterOnboarding) {
        redirect("/conversation?mode=onboarding");
      }
    } catch (error) {
      if (isNextNavigationError(error)) {
        throw error;
      }
      // Gate load failure must not block Hoy for existing accounts.
    }
  }

  let loadError: string | undefined;
  let setupCompletion: SetupCompletionDto | undefined;
  let data: HoyFeedDto = {
    weekStart: "1970-01-05",
    lastUpdatedAt: new Date().toISOString(),
    pendingApprovals: [],
    selectedPendingIds: [],
    pendingOverflowCount: 0,
    timeline: [],
    nextSlots: [],
    nextAction: buildOwnerHomeNextAction("interview"),
    showNextActionCard: true,
    results: { insightsAvailable: false },
    notifications: [],
  };

  if (user) {
    try {
      data = await loadHoyFeed({ user, locale });
    } catch (error) {
      if (isNextNavigationError(error)) {
        throw error;
      }
      loadError = t.dashboard.loadError;
    }
    try {
      const completion = await loadSetupCompletion({ user });
      if (shouldShowSetupCompletionOnHome(completion)) {
        setupCompletion = completion;
      }
    } catch (error) {
      if (isNextNavigationError(error)) {
        throw error;
      }
    }
  }

  const hoy = t.dashboard.hoy;

  return (
    <HoyFeedView
      locale={locale}
      copy={{
        title: t.dashboard.title,
        subtitle: t.dashboard.subtitle,
        needsOk: hoy.needsOk,
        whatIDid: hoy.whatIDid,
        next: hoy.next,
        results: hoy.results,
        resultsEmpty: t.dashboard.results.empty,
        resultsEmptyHint: t.dashboard.results.emptyHint,
        approve: hoy.approve,
        change: hoy.change,
        seeAllPending: hoy.seeAllPending,
        pendingStatus: hoy.pendingStatus,
        timelineEmpty: hoy.timelineEmpty,
        nextActionCtaOpenChat: hoy.nextActionCtaOpenChat,
        slotDone: hoy.slotDone,
        slotNeedsOk: hoy.slotNeedsOk,
        slotPreparing: hoy.slotPreparing,
        slotScheduled: hoy.slotScheduled,
        loadError,
        approvalErrors: t.approvals.errors,
        setupBanner: supabaseReady ? undefined : t.dashboard.setupBanner,
        timelineMessages: hoy.timeline,
      }}
      pendingApprovals={data.pendingApprovals}
      selectedPendingIds={data.selectedPendingIds}
      pendingOverflowCount={data.pendingOverflowCount}
      notifications={data.notifications}
      timeline={data.timeline}
      nextSlots={data.nextSlots}
      nextAction={data.nextAction}
      showNextActionCard={data.showNextActionCard}
      nextActionCopy={nextActionCopyFor(
        t.dashboard.nextAction,
        data.nextAction.stepKey,
      )}
      setupCompletion={setupCompletion}
      setupCompletionCopy={
        setupCompletion
          ? {
              title: t.dashboard.setupCompletion.title,
              progress: t.dashboard.setupCompletion.progress.replace(
                "{percent}",
                String(setupCompletion.percentComplete),
              ),
              doIt: t.dashboard.setupCompletion.doIt,
              optional: t.dashboard.setupCompletion.optional,
              done: t.dashboard.setupCompletion.done,
              steps: t.dashboard.setupCompletion.steps,
            }
          : undefined
      }
    />
  );
}
