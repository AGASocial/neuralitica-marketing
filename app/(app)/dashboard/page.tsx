import { DashboardView, type DashboardCard } from "@/components/dashboard/DashboardView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type {
  InterviewDashboardSummary,
  InterviewStepKey,
} from "@/lib/contracts/interview";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { getInterviewDashboardSummary } from "@/lib/interview/get-interview-dashboard-summary";
import { getBusinessProfileForClient } from "@/lib/profile/get-business-profile-for-client";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type enMessages from "@/messages/en.json";

export const dynamic = "force-dynamic";

type InterviewCardCopy = (typeof enMessages)["dashboard"]["interviewCard"];
type InterviewStepsCopy = (typeof enMessages)["interview"]["steps"];

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

function buildInterviewCard(
  cardCopy: InterviewCardCopy,
  stepsCopy: InterviewStepsCopy,
  summary: InterviewDashboardSummary | undefined,
  loadFailed: boolean,
): DashboardCard {
  if (loadFailed) {
    return {
      title: cardCopy.title,
      body: cardCopy.loadError,
      cta: cardCopy.cta,
      error: true,
    };
  }

  if (summary == null || (summary.status === "draft" && !summary.hasProgress)) {
    return {
      title: cardCopy.title,
      body: cardCopy.body,
      cta: cardCopy.cta,
      href: "/interview",
    };
  }

  if (summary.status === "completed") {
    return {
      title: cardCopy.title,
      body: cardCopy.completedBody,
      cta: cardCopy.completedCta,
      href: "/profile",
    };
  }

  const stepKey = summary.currentStep as InterviewStepKey;
  const stepLabel = stepsCopy[stepKey]?.label ?? stepKey;

  return {
    title: cardCopy.title,
    body: cardCopy.resumeBody.replace("{step}", stepLabel),
    cta: cardCopy.resumeCta,
    href: "/interview",
  };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const supabaseReady = isSupabaseConfigured();

  let interviewSummary: InterviewDashboardSummary | undefined;
  let interviewLoadFailed = false;
  let profileExists = false;

  try {
    interviewSummary = await getInterviewDashboardSummary();
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    interviewLoadFailed = true;
  }

  try {
    const profile = await getBusinessProfileForClient();
    profileExists = profile.exists === true;
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    profileExists = false;
  }

  const interviewCard = buildInterviewCard(
    t.dashboard.interviewCard,
    t.interview.steps,
    interviewSummary,
    interviewLoadFailed,
  );

  const profileCard: DashboardCard = {
    ...t.dashboard.profileCard,
    href: "/profile",
  };

  const preferencesCard: DashboardCard = {
    ...t.dashboard.preferencesCard,
    href: "/settings/preferences",
  };

  const approvalsCard: DashboardCard = {
    ...t.dashboard.approvalsCard,
    href: "/approvals",
  };

  // When Ficha viva exists: elevate as primary/first card — no hard redirect.
  const cards: DashboardCard[] = profileExists
    ? [
        profileCard,
        interviewCard,
        preferencesCard,
        approvalsCard,
        t.dashboard.productionCard,
      ]
    : [
        interviewCard,
        profileCard,
        preferencesCard,
        approvalsCard,
        t.dashboard.productionCard,
      ];

  return (
    <DashboardView
      title={t.dashboard.title}
      subtitle={t.dashboard.subtitle}
      setupBanner={supabaseReady ? undefined : t.dashboard.setupBanner}
      cards={cards}
    />
  );
}
