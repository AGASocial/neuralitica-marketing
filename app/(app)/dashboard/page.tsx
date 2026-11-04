import { DashboardView } from "@/components/dashboard/DashboardView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type {
  OwnerHomeDashboardDto,
  OwnerHomeNextStepKey,
} from "@/lib/contracts/owner-home-dashboard";
import { loadOwnerHomeDashboard } from "@/lib/dashboard/load-owner-home-dashboard";
import { buildOwnerHomeNextAction } from "@/lib/dashboard/compute-owner-home-snapshot";
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

function trafficStatusLabel(
  t: ReturnType<typeof getTranslations>["dashboard"]["thisWeek"],
  light: "green" | "yellow" | "red" | "neutral",
): string {
  switch (light) {
    case "green":
      return t.statusGreen;
    case "yellow":
      return t.statusYellow;
    case "red":
      return t.statusRed;
    default:
      return t.statusNeutral;
  }
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

function formatLastUpdated(
  template: string,
  iso: string,
  locale: string,
): string {
  const date = new Date(iso);
  const time = Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
  return template.replace("{time}", time);
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const supabaseReady = isSupabaseConfigured();

  let loadError: string | undefined;
  let data: OwnerHomeDashboardDto = {
    weekStart: "1970-01-05",
    lastUpdatedAt: new Date().toISOString(),
    nextAction: buildOwnerHomeNextAction("interview"),
    weekCounts: {
      scheduled: 0,
      published: 0,
      waitingForOk: 0,
      inProduction: 0,
    },
    trafficLight: "neutral",
    campaignProgress: { completed: 0, total: 0, hasPlan: false },
    results: { insightsAvailable: false },
    recentVideos: [],
    atajos: [
      { id: "interview", href: "/interview" },
      { id: "profile", href: "/profile" },
      { id: "preferences", href: "/settings/preferences" },
      { id: "approvals", href: "/approvals" },
      { id: "readyToPublish", href: "/ready-to-publish" },
    ],
  };

  if (user) {
    try {
      data = await loadOwnerHomeDashboard({ user });
    } catch (error) {
      if (isNextNavigationError(error)) {
        throw error;
      }
      loadError = t.dashboard.loadError;
    }
  }

  const ofVideos = t.dashboard.campaignProgress.ofVideos
    .replace("{completed}", String(data.campaignProgress.completed))
    .replace("{total}", String(data.campaignProgress.total));

  return (
    <DashboardView
      title={t.dashboard.title}
      subtitle={t.dashboard.subtitle}
      lastUpdatedLabel={formatLastUpdated(
        t.dashboard.lastUpdated,
        data.lastUpdatedAt,
        locale,
      )}
      setupBanner={supabaseReady ? undefined : t.dashboard.setupBanner}
      loadError={loadError}
      nextAction={data.nextAction}
      nextActionCopy={nextActionCopyFor(
        t.dashboard.nextAction,
        data.nextAction.stepKey,
      )}
      weekCounts={data.weekCounts}
      trafficLight={data.trafficLight}
      thisWeekCopy={{
        title: t.dashboard.thisWeek.title,
        scheduled: t.dashboard.thisWeek.scheduled,
        published: t.dashboard.thisWeek.published,
        waitingForOk: t.dashboard.thisWeek.waitingForOk,
        inProduction: t.dashboard.thisWeek.inProduction,
        statusLabel: trafficStatusLabel(
          t.dashboard.thisWeek,
          data.trafficLight,
        ),
      }}
      campaignProgress={data.campaignProgress}
      campaignCopy={{
        title: t.dashboard.campaignProgress.title,
        ofVideos,
        empty: t.dashboard.campaignProgress.empty,
      }}
      resultsCopy={{
        title: t.dashboard.results.title,
        empty: t.dashboard.results.empty,
        emptyHint: t.dashboard.results.emptyHint,
      }}
      recentVideos={data.recentVideos}
      recentCopy={{
        title: t.dashboard.recentVideos.title,
        empty: t.dashboard.recentVideos.empty,
        openAll: t.dashboard.recentVideos.openAll,
        untitled: t.dashboard.recentVideos.untitled,
      }}
      atajos={data.atajos}
      atajosCopy={{
        title: t.dashboard.atajos.title,
        labels: {
          interview: t.dashboard.atajos.interview,
          profile: t.dashboard.atajos.profile,
          preferences: t.dashboard.atajos.preferences,
          approvals: t.dashboard.atajos.approvals,
          readyToPublish: t.dashboard.atajos.readyToPublish,
        },
      }}
    />
  );
}
