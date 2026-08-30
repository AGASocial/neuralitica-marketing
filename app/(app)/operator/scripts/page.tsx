import { ScriptsPageView } from "@/components/scripts/ScriptsPageView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  REEL_SCRIPT_MAX_BEAT_LINES_TOTAL,
  REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE,
} from "@/lib/contracts/reel-script-readability";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { emptyWeekCostSummary } from "@/lib/cost-policy/empty-week-cost-summary";
import {
  getReelScriptsForWeek,
} from "@/lib/reel-scripts/actions/get-reel-scripts-for-week";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

export const dynamic = "force-dynamic";

type ScriptsPageProps = {
  searchParams: Promise<{ weekStart?: string }>;
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

/**
 * Operator Reel script workspace (US-5.1).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function ScriptsPage({ searchParams }: ScriptsPageProps) {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const { weekStart: rawWeekStart } = await searchParams;
  const weekStart = resolveWeekStart(rawWeekStart);
  const clientId = user?.id ?? "00000000-0000-4000-8000-000000000001";

  let scriptsResult: Awaited<ReturnType<typeof getReelScriptsForWeek>>;
  let loadFailed = false;

  try {
    scriptsResult = await getReelScriptsForWeek({ weekStart });
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    loadFailed = true;
    scriptsResult = {
      ok: true,
      weekStart,
      approvedStrategy: null,
      strategyVersionChanged: false,
      items: [],
      costSummary: emptyWeekCostSummary(weekStart, clientId),
      reelCostRollups: {},
      videoJobsByReelScriptId: {},
      voiceoverByReelScriptId: {},
      assemblyByReelScriptId: {},
    };
  }

  if (!loadFailed && !scriptsResult.ok) {
    loadFailed = scriptsResult.error.code !== "FORBIDDEN";
  }

  const data = scriptsResult.ok
    ? scriptsResult
    : {
        ok: true as const,
        weekStart,
        approvedStrategy: null,
        strategyVersionChanged: false,
        items: [],
        costSummary: emptyWeekCostSummary(weekStart, clientId),
        reelCostRollups: {},
        videoJobsByReelScriptId: {},
        voiceoverByReelScriptId: {},
        assemblyByReelScriptId: {},
      };

  return (
    <ScriptsPageView
      weekStart={weekStart}
      data={data}
      loadFailed={loadFailed}
      locale={locale}
      copy={{
        title: t.scripts.page.title,
        subtitle: t.scripts.page.subtitle,
        weekLabel: t.scripts.page.weekLabel,
        generate: t.scripts.page.generate,
        generating: t.scripts.page.generating,
        regenerate: t.scripts.page.regenerate,
        regenerating: t.scripts.page.regenerating,
        emptyNoStrategy: t.scripts.page.emptyNoStrategy,
        emptyNoStrategyCta: t.scripts.page.emptyNoStrategyCta,
        emptyNoScripts: t.scripts.page.emptyNoScripts,
        loadError: t.scripts.page.loadError,
        backDashboard: t.scripts.page.backDashboard,
        toastGenerateSuccess: t.scripts.page.toastGenerateSuccess,
        toastRegenerateSuccess: t.scripts.page.toastRegenerateSuccess,
        toastCopySuccess: t.scripts.page.toastCopySuccess,
        strategyVersionWarning: t.scripts.page.strategyVersionWarning,
        versionLabel: t.scripts.page.versionLabel,
        columns: t.scripts.page.columns,
        status: t.scripts.page.status,
        fields: t.scripts.page.fields,
        copyField: t.scripts.page.copyField,
        durationSeconds: t.scripts.page.durationSeconds,
        goals: t.strategy.page.goals,
        days: t.strategy.page.days,
        modalities: t.playbook.enums.modalities,
        readability: {
          beatCharsExceeded: t.scripts.readability.beatCharsExceeded,
          beatLinesExceeded: t.scripts.readability.beatLinesExceeded,
          tooManyBeats: t.scripts.readability.tooManyBeats,
          voiceoverOver: t.scripts.readability.voiceoverOver,
          voiceoverUnder: t.scripts.readability.voiceoverUnder,
          voiceoverOk: t.scripts.readability.voiceoverOk,
          rowBadge: t.scripts.readability.rowBadge,
          maxCharsPerBeatLine: REEL_SCRIPT_MAX_CHARS_PER_BEAT_LINE,
          maxBeatLinesTotal: REEL_SCRIPT_MAX_BEAT_LINES_TOTAL,
        },
        errors: {
          validation: t.scripts.errors.validation,
          forbiddenFields: t.scripts.errors.forbiddenFields,
          notFound: t.scripts.errors.notFound,
          rateLimited: t.scripts.errors.rateLimited,
          inFlight: t.scripts.errors.inFlight,
          profileIncomplete: t.scripts.errors.profileIncomplete,
          scriptOutputInvalid: t.scripts.errors.scriptOutputInvalid,
          providerUnavailable: t.scripts.errors.providerUnavailable,
          strategyNotApproved: t.scripts.errors.strategyNotApproved,
          slotNotFound: t.scripts.errors.slotNotFound,
          strategyVersionChanged: t.scripts.errors.strategyVersionChanged,
          unauthenticated: t.auth.errors.unauthenticated,
          forbidden: t.auth.errors.forbidden,
          internal: t.scripts.errors.internal,
          budgetExceeded: t.scripts.budget.errors.exceeded,
          costPolicyUnavailable: t.scripts.budget.errors.policyUnavailable,
        },
        budget: {
          ...t.scripts.budget.confirm,
          errors: t.scripts.budget.errors,
        },
        providerRecommendation: t.scripts.providerRecommendation,
        videoJob: {
          ...t.scripts.videoJob,
          manualUpload: t.scripts.videoJob.manualUpload,
          retryConfirm: t.scripts.videoJob.retryConfirm,
          retryOverride: t.scripts.videoJob.retryOverride,
          toastRetrySuccess: t.scripts.videoJob.toastRetrySuccess,
          toastOverrideSuccess: t.scripts.videoJob.toastOverrideSuccess,
        },
        voiceover: t.scripts.voiceover,
        assembly: {
          ...t.scripts.assembly,
          reassembleConfirm: t.scripts.assembly.reassembleConfirm,
        },
        cost: {
          actual: t.scripts.cost.actual,
          rollup: {
            ...t.scripts.cost.rollup,
            actualPending: t.scripts.cost.actual.pending,
            unavailable: t.scripts.cost.actual.unavailable,
          },
        },
        caption: {
          tabs: t.scripts.caption.tabs,
          generate: t.scripts.caption.generate,
          generating: t.scripts.caption.generating,
          regenerate: t.scripts.caption.regenerate,
          regenerating: t.scripts.caption.regenerating,
          emptyPending: t.scripts.caption.emptyPending,
          emptyNoScript: t.scripts.caption.emptyNoScript,
          charCount: t.scripts.caption.charCount,
          hashtagCount: t.scripts.caption.hashtagCount,
          hashtagsOverMax: t.scripts.caption.hashtagsOverMax,
          hashtagsLabel: t.scripts.caption.hashtagsLabel,
          keywordsLabel: t.scripts.caption.keywordsLabel,
          ctaVariantsLabel: t.scripts.caption.ctaVariantsLabel,
          ctaVariantLine: t.scripts.caption.ctaVariantLine,
          staleBadge: t.scripts.caption.staleBadge,
          copyCaption: t.scripts.caption.copyCaption,
          copyHashtags: t.scripts.caption.copyHashtags,
          toastGenerateSuccess: t.scripts.caption.toastGenerateSuccess,
          toastRegenerateSuccess: t.scripts.caption.toastRegenerateSuccess,
          status: t.scripts.caption.status,
          errors: t.scripts.caption.errors,
          ctaSelect: t.scripts.caption.ctaSelect,
        },
      }}
    />
  );
}
