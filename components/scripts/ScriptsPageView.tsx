"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ReelBudgetConfirmDialog,
  type ReelBudgetConfirmCopy,
} from "@/components/cost-policy/ReelBudgetConfirmDialog";
import {
  ProviderRecommendationPanel,
  type ProviderRecommendationCopy,
} from "@/components/scripts/ProviderRecommendationPanel";
import {
  AssemblyReassembleConfirmDialog,
  type AssemblyReassembleConfirmCopy,
} from "@/components/scripts/AssemblyReassembleConfirmDialog";
import {
  BrandingRebrandConfirmDialog,
  type BrandingRebrandConfirmCopy,
} from "@/components/scripts/BrandingRebrandConfirmDialog";
import {
  OperatorAssemblyPanel,
  type OperatorAssemblyCopy,
} from "@/components/scripts/OperatorAssemblyPanel";
import {
  OperatorQaPanel,
  type OperatorQaCopy,
} from "@/components/scripts/OperatorQaPanel";
import {
  ManualVideoUploadControl,
  type ManualVideoUploadCopy,
} from "@/components/scripts/ManualVideoUploadDialog";
import {
  BrollGenerateControl,
  formatBrollGenerateTemplate,
  type BrollGenerateConfirmCopy,
  type BrollGenerateOutcome,
} from "@/components/scripts/BrollGenerateConfirmDialog";
import {
  OperatorBrollJobsPanel,
  type OperatorBrollJobsCopy,
} from "@/components/scripts/OperatorBrollJobsPanel";
import {
  HeygenGenerateControl,
  type HeygenGenerateConfirmCopy,
} from "@/components/scripts/HeygenGenerateConfirmDialog";
import {
  OperatorVideoJobSummaryPanel,
  VideoJobStatusTag,
  type OperatorVideoJobCopy,
} from "@/components/scripts/OperatorVideoJobSummaryPanel";
import {
  ReelCostRollupPanel,
  type ReelCostRollupCopy,
} from "@/components/scripts/ReelCostRollupPanel";
import {
  VideoJobRetryConfirmDialog,
  type VideoJobRetryConfirmCopy,
} from "@/components/scripts/VideoJobRetryConfirmDialog";
import {
  VideoJobRetryLimitOverrideDialog,
  type VideoJobRetryLimitOverrideCopy,
} from "@/components/scripts/VideoJobRetryLimitOverrideDialog";
import {
  CalendarIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type {
  ActualCostUnavailableReason,
  ReelCostRollupsMap,
  ReelSlotCostSummary,
  ReelWeekCostSummary,
} from "@/lib/contracts/actual-cost";
import type {
  ContentStrategyDayOfWeek,
  ContentStrategySlotGoal,
} from "@/lib/contracts/content-strategy";
import {
  buildEffectiveInstagramCaption,
  IG_CAPTION_MAX_CHARS,
  IG_HASHTAG_WARN_MAX,
  type ReelCaptionErrorCode,
} from "@/lib/contracts/reel-caption";
import {
  OperatorVoiceoverPanel,
  type OperatorVoiceoverCopy,
} from "@/components/scripts/OperatorVoiceoverPanel";
import type {
  AssembleReelForScriptSuccess,
  OperatorAssemblyJobDto,
  OperatorAssemblyJobsByReelMap,
} from "@/lib/contracts/assembly-job";
import { ASSEMBLY_TEMPLATE_REEL_V1_BASIC } from "@/lib/contracts/assembly-job";
import type { ApplyBrandingForAssemblySuccess } from "@/lib/contracts/branding-job";
import type { OverrideQaCheckSuccess } from "@/lib/contracts/qa-override";
import type {
  OperatorQaReportDetailDto,
  OperatorQaReportsByAssembledReelMap,
  RunQaForAssembledReelSuccess,
} from "@/lib/contracts/qa-report";
import type {
  SynthesizeVoiceoverForReelScriptSuccess,
  VoiceoverSummaryByReelMap,
  VoiceoverSummaryDto,
} from "@/lib/contracts/tts-voiceover";
import type {
  GetReelScriptsForWeekSuccess,
  ReelScriptErrorCode,
  ReelScriptListItem,
} from "@/lib/contracts/reel-script";
import type {
  OperatorBrollJobsByReelMap,
  OperatorVideoJobSummaryDto,
  OperatorVideoJobsByReelMap,
} from "@/lib/contracts/video-job";
import { getReelBudgetPreview } from "@/lib/cost-policy/actions/get-reel-budget-preview";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";
import { generateReelCaptions } from "@/lib/reel-captions/actions/generate-reel-captions";
import { regenerateReelCaption } from "@/lib/reel-captions/actions/regenerate-reel-caption";
import { selectReelCaptionCta } from "@/lib/reel-captions/actions/select-reel-caption-cta";
import type {
  ReelScriptReadability,
  ReelScriptReadabilityBeatLine,
  ReelScriptReadabilityVoiceover,
} from "@/lib/contracts/reel-script-readability";
import type {
  ReelBudgetBatchPreview,
  ReelBudgetPreview,
} from "@/lib/contracts/cost-policy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { generateReelScripts } from "@/lib/reel-scripts/actions/generate-reel-scripts";
import { regenerateReelScriptSlot } from "@/lib/reel-scripts/actions/regenerate-reel-script-slot";
import { formatWeekRange, normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

type ScriptsPageCopy = {
  title: string;
  subtitle: string;
  weekLabel: string;
  generate: string;
  generating: string;
  regenerate: string;
  regenerating: string;
  emptyNoStrategy: string;
  emptyNoStrategyCta: string;
  emptyNoScripts: string;
  loadError: string;
  backDashboard: string;
  toastGenerateSuccess: string;
  toastRegenerateSuccess: string;
  toastCopySuccess: string;
  strategyVersionWarning: string;
  versionLabel: string;
  columns: {
    tema: string;
    day: string;
    duration: string;
    status: string;
    actions: string;
  };
  status: {
    pending: string;
    generated: string;
  };
  fields: {
    hook: string;
    body: string;
    cta: string;
    onScreenText: string;
    voiceoverText: string;
    brollBeats: string;
    coldOpenNotes: string;
    editingNotes: string;
  };
  copyField: string;
  durationSeconds: string;
  goals: Record<ContentStrategySlotGoal, string>;
  days: Record<ContentStrategyDayOfWeek, string>;
  modalities: Record<VisualModality, string>;
  errors: {
    validation: string;
    forbiddenFields: string;
    notFound: string;
    rateLimited: string;
    inFlight: string;
    profileIncomplete: string;
    scriptOutputInvalid: string;
    scriptSlotsFailed: string;
    providerUnavailable: string;
    strategyNotApproved: string;
    slotNotFound: string;
    strategyVersionChanged: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
    budgetExceeded: string;
    costPolicyUnavailable: string;
  };
  readability: {
    beatCharsExceeded: string;
    beatLinesExceeded: string;
    tooManyBeats: string;
    voiceoverOver: string;
    voiceoverUnder: string;
    voiceoverOk: string;
    rowBadge: string;
    maxCharsPerBeatLine: number;
    maxBeatLinesTotal: number;
  };
  budget: ReelBudgetConfirmCopy;
  providerRecommendation: ProviderRecommendationCopy;
  cost: {
    actual: {
      columnHeader: string;
      estimated: string;
      actual: string;
      pending: string;
      weeklyTotal: string;
      weeklyEstimated: string;
      weeklyActual: string;
      partialActualHint: string;
      unavailable: Record<ActualCostUnavailableReason, string>;
    };
    rollup: ReelCostRollupCopy;
  };
  videoJob: OperatorVideoJobCopy & {
    manualUpload: ManualVideoUploadCopy;
    retryConfirm: VideoJobRetryConfirmCopy;
    retryOverride: VideoJobRetryLimitOverrideCopy;
    toastRetrySuccess: string;
    toastOverrideSuccess: string;
  };
  heygen: HeygenGenerateConfirmCopy;
  broll: BrollGenerateConfirmCopy;
  brollStatus: OperatorBrollJobsCopy;
  voiceover: OperatorVoiceoverCopy;
  assembly: OperatorAssemblyCopy & {
    reassembleConfirm: AssemblyReassembleConfirmCopy;
    rebrandConfirm: BrandingRebrandConfirmCopy;
  };
  qa: OperatorQaCopy;
  caption: {
    tabs: {
      script: string;
      caption: string;
    };
    generate: string;
    generating: string;
    regenerate: string;
    regenerating: string;
    emptyPending: string;
    emptyNoScript: string;
    charCount: string;
    hashtagCount: string;
    hashtagsOverMax: string;
    hashtagsLabel: string;
    keywordsLabel: string;
    ctaVariantsLabel: string;
    ctaVariantLine: string;
    staleBadge: string;
    copyCaption: string;
    copyHashtags: string;
    toastGenerateSuccess: string;
    toastRegenerateSuccess: string;
    status: {
      pending: string;
      generated: string;
    };
    errors: {
      validation: string;
      forbiddenFields: string;
      notFound: string;
      rateLimited: string;
      inFlight: string;
      profileIncomplete: string;
      captionOutputInvalid: string;
      providerUnavailable: string;
      strategyNotApproved: string;
      slotNotFound: string;
      scriptNotFound: string;
      scriptPending: string;
      internal: string;
    };
    ctaSelect: {
      selectLabel: string;
      previewHeading: string;
      unselectedHint: string;
      selectionSaved: string;
      clearedOnRegen: string;
      effectiveLengthWarn: string;
      errors: {
        indexOutOfBounds: string;
        captionNotFound: string;
      };
    };
  };
};

type ScriptsPageViewProps = {
  weekStart: string;
  highlightSlot?: number;
  data: GetReelScriptsForWeekSuccess;
  loadFailed: boolean;
  locale: string;
  copy: ScriptsPageCopy;
};

function weekStartToDate(weekStart: string): Date {
  return new Date(`${weekStart}T12:00:00.000Z`);
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function messageForCode(
  code: ReelScriptErrorCode,
  messageKey: string | undefined,
  copy: ScriptsPageCopy,
): string {
  if (messageKey === "scripts.errors.strategyVersionChanged") {
    return copy.errors.strategyVersionChanged;
  }
  if (messageKey === "scripts.budget.errors.exceeded") {
    return copy.errors.budgetExceeded;
  }
  if (messageKey === "scripts.budget.errors.policyUnavailable") {
    return copy.errors.costPolicyUnavailable;
  }

  switch (code) {
    case "VALIDATION_ERROR":
      return copy.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.errors.forbiddenFields;
    case "NOT_FOUND":
      return copy.errors.notFound;
    case "RATE_LIMITED":
      return copy.errors.rateLimited;
    case "GENERATION_IN_FLIGHT":
      return copy.errors.inFlight;
    case "PROFILE_INCOMPLETE":
      return copy.errors.profileIncomplete;
    case "SCRIPT_OUTPUT_INVALID":
      return copy.errors.scriptOutputInvalid;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "STRATEGY_NOT_APPROVED":
      return copy.errors.strategyNotApproved;
    case "SLOT_NOT_FOUND":
      return copy.errors.slotNotFound;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

function messageForCaptionCode(
  code: ReelCaptionErrorCode,
  messageKey: string | undefined,
  copy: ScriptsPageCopy,
): string {
  if (messageKey === "scripts.caption.ctaSelect.errors.indexOutOfBounds") {
    return copy.caption.ctaSelect.errors.indexOutOfBounds;
  }
  if (messageKey === "scripts.caption.ctaSelect.errors.captionNotFound") {
    return copy.caption.ctaSelect.errors.captionNotFound;
  }
  if (messageKey === "scripts.budget.errors.exceeded") {
    return copy.errors.budgetExceeded;
  }
  if (messageKey === "scripts.budget.errors.policyUnavailable") {
    return copy.errors.costPolicyUnavailable;
  }
  if (messageKey === "scripts.budget.errors.providerUnavailable") {
    return copy.budget.errors.providerUnavailable;
  }

  switch (code) {
    case "VALIDATION_ERROR":
      return copy.caption.errors.validation;
    case "FORBIDDEN_FIELDS":
      return copy.caption.errors.forbiddenFields;
    case "NOT_FOUND":
    case "CAPTION_NOT_FOUND":
      return copy.caption.ctaSelect.errors.captionNotFound;
    case "CTA_INDEX_OUT_OF_BOUNDS":
      return copy.caption.ctaSelect.errors.indexOutOfBounds;
    case "RATE_LIMITED":
      return copy.caption.errors.rateLimited;
    case "GENERATION_IN_FLIGHT":
      return copy.caption.errors.inFlight;
    case "PROFILE_INCOMPLETE":
      return copy.caption.errors.profileIncomplete;
    case "CAPTION_OUTPUT_INVALID":
      return copy.caption.errors.captionOutputInvalid;
    case "PROVIDER_UNAVAILABLE":
      return copy.caption.errors.providerUnavailable;
    case "STRATEGY_NOT_APPROVED":
      return copy.caption.errors.strategyNotApproved;
    case "SLOT_NOT_FOUND":
      return copy.caption.errors.slotNotFound;
    case "SCRIPT_NOT_FOUND":
      return copy.caption.errors.scriptNotFound;
    case "SCRIPT_PENDING":
      return copy.caption.errors.scriptPending;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.caption.errors.internal;
  }
}

function formatDuration(
  seconds: number | null,
  template: string,
): string {
  if (seconds === null) {
    return "—";
  }
  return template.replace("{seconds}", String(seconds));
}

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function findSlotCostSummary(
  costSummary: ReelWeekCostSummary | undefined,
  slotIndex: number,
): ReelSlotCostSummary | undefined {
  return costSummary?.slots.find((slot) => slot.slotIndex === slotIndex);
}

type ActualCostCopy = ScriptsPageCopy["cost"]["actual"];

function formatUnavailableReasons(
  reasons: ActualCostUnavailableReason[],
  copy: ActualCostCopy,
): string {
  return reasons.map((reason) => copy.unavailable[reason]).join(", ");
}

function renderActualCostValue(
  slotCost: ReelSlotCostSummary | undefined,
  locale: string,
  copy: ActualCostCopy,
): { text: string; subdued: boolean } {
  if (!slotCost) {
    return { text: "—", subdued: false };
  }

  if (slotCost.actualCostCents !== null) {
    return {
      text: formatCentsForDisplay(slotCost.actualCostCents, locale),
      subdued: false,
    };
  }

  if (slotCost.hasPendingActual) {
    return { text: copy.pending, subdued: true };
  }

  if (slotCost.unavailableReasonKeys.length > 0) {
    return {
      text: formatUnavailableReasons(slotCost.unavailableReasonKeys, copy),
      subdued: true,
    };
  }

  return { text: "—", subdued: false };
}

function renderEstimatedCostValue(
  slotCost: ReelSlotCostSummary | undefined,
  locale: string,
): string {
  if (!slotCost || slotCost.estimatedCostCents <= 0) {
    return "—";
  }

  return formatCentsForDisplay(slotCost.estimatedCostCents, locale);
}

type BudgetPendingAction =
  | { kind: "script_batch" }
  | { kind: "script_regenerate"; slotIndex: number }
  | { kind: "caption_batch" }
  | { kind: "caption_regenerate"; slotIndex: number };

type BudgetOverridePayload = {
  budgetOverride: true;
  overrideReason: string;
};

export function ScriptsPageView({
  weekStart,
  highlightSlot,
  data,
  loadFailed,
  locale,
  copy,
}: ScriptsPageViewProps) {
  const router = useRouter();
  const [batchPending, setBatchPending] = useState(false);
  const [captionBatchPending, setCaptionBatchPending] = useState(false);
  const [regeneratingSlot, setRegeneratingSlot] = useState<number | null>(null);
  const [captionRegeneratingSlot, setCaptionRegeneratingSlot] = useState<number | null>(
    null,
  );
  const [captionSelectingSlot, setCaptionSelectingSlot] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<ReelScriptListItem[]>([]);

  useEffect(() => {
    if (highlightSlot === undefined || data.items.length === 0) {
      return;
    }
    const match = data.items.find((item) => item.slotIndex === highlightSlot);
    if (match) {
      setExpandedRows([match]);
    }
  }, [highlightSlot, data.items]);
  const [budgetDialogVisible, setBudgetDialogVisible] = useState(false);
  const [budgetPreviewLoading, setBudgetPreviewLoading] = useState(false);
  const [budgetPreviewError, setBudgetPreviewError] = useState<string | null>(null);
  const [budgetPreview, setBudgetPreview] = useState<
    ReelBudgetPreview | ReelBudgetBatchPreview | null
  >(null);
  const [budgetPreviewIsBatch, setBudgetPreviewIsBatch] = useState(false);
  const [budgetPendingAction, setBudgetPendingAction] = useState<BudgetPendingAction | null>(
    null,
  );
  const [budgetOverrideReason, setBudgetOverrideReason] = useState("");
  const [budgetConfirmPending, setBudgetConfirmPending] = useState(false);
  const [retryDialogVisible, setRetryDialogVisible] = useState(false);
  const [retryFailedJobId, setRetryFailedJobId] = useState<string | null>(null);
  const [overrideDialogVisible, setOverrideDialogVisible] = useState(false);
  const [overrideFailedJobId, setOverrideFailedJobId] = useState<string | null>(null);
  const [videoJobMutationPending, setVideoJobMutationPending] = useState(false);
  const [videoJobOverrides, setVideoJobOverrides] = useState<OperatorVideoJobsByReelMap>(
    {},
  );
  const [voiceoverOverrides, setVoiceoverOverrides] =
    useState<VoiceoverSummaryByReelMap>({});
  const [reassembleDialogVisible, setReassembleDialogVisible] = useState(false);
  const [reassembleReelScriptId, setReassembleReelScriptId] = useState<string | null>(
    null,
  );
  const [assemblyMutationPending, setAssemblyMutationPending] = useState(false);
  const [assemblyOverrides, setAssemblyOverrides] = useState<OperatorAssemblyJobsByReelMap>(
    {},
  );
  const [rebrandDialogVisible, setRebrandDialogVisible] = useState(false);
  const [rebrandAssemblyJobId, setRebrandAssemblyJobId] = useState<string | null>(null);
  const [rebrandSubtitlesEnabled, setRebrandSubtitlesEnabled] = useState(true);
  const [rebrandLogoEnabled, setRebrandLogoEnabled] = useState(true);
  const [rebrandCoverFrameSec, setRebrandCoverFrameSec] = useState(1.0);
  const [qaOverrides, setQaOverrides] = useState<OperatorQaReportsByAssembledReelMap>(
    {},
  );

  useEffect(() => {
    setVideoJobOverrides({});
  }, [data.videoJobsByReelScriptId]);

  useEffect(() => {
    setVoiceoverOverrides({});
  }, [data.voiceoverByReelScriptId]);

  useEffect(() => {
    setAssemblyOverrides({});
  }, [data.assemblyByReelScriptId]);

  useEffect(() => {
    setQaOverrides({});
  }, [data.qaByAssembledReelId]);

  const videoJobsByReelScriptId = useMemo(
    () => ({
      ...data.videoJobsByReelScriptId,
      ...videoJobOverrides,
    }),
    [data.videoJobsByReelScriptId, videoJobOverrides],
  );

  const voiceoverByReelScriptId = useMemo(
    () => ({
      ...data.voiceoverByReelScriptId,
      ...voiceoverOverrides,
    }),
    [data.voiceoverByReelScriptId, voiceoverOverrides],
  );

  const assemblyByReelScriptId = useMemo(
    () => ({
      ...data.assemblyByReelScriptId,
      ...assemblyOverrides,
    }),
    [data.assemblyByReelScriptId, assemblyOverrides],
  );

  const qaByAssembledReelId = useMemo(
    () => ({
      ...data.qaByAssembledReelId,
      ...qaOverrides,
    }),
    [data.qaByAssembledReelId, qaOverrides],
  );

  const weekDate = weekStartToDate(weekStart);
  const weekRangeLabel = formatWeekRange(weekStart, locale);
  const clientId = data.costSummary.clientId;
  const isBusy =
    batchPending ||
    captionBatchPending ||
    regeneratingSlot !== null ||
    captionRegeneratingSlot !== null ||
    captionSelectingSlot !== null ||
    budgetPreviewLoading ||
    budgetConfirmPending ||
    videoJobMutationPending ||
    assemblyMutationPending;
  const hasApprovedStrategy = data.approvedStrategy !== null;
  const hasAnyGenerated = data.items.some((item) => item.status === "generated");
  const hasAnyCaptionGenerated = data.items.some(
    (item) => item.caption.status === "generated",
  );
  const allPending =
    hasApprovedStrategy && data.items.length > 0 && !hasAnyGenerated;
  const allCaptionsPending =
    hasApprovedStrategy && hasAnyGenerated && !hasAnyCaptionGenerated;
  const costSummary = data.costSummary;
  const reelCostRollups = data.reelCostRollups;
  const showCostSummary = costSummary !== undefined;

  function navigateWeek(nextWeekStart: string) {
    const params = new URLSearchParams();
    params.set("weekStart", nextWeekStart);
    router.push(`/operator/scripts?${params.toString()}`);
    router.refresh();
  }

  function closeBudgetDialog() {
    if (budgetConfirmPending) {
      return;
    }
    setBudgetDialogVisible(false);
    setBudgetPendingAction(null);
    setBudgetPreview(null);
    setBudgetPreviewError(null);
    setBudgetOverrideReason("");
  }

  function budgetPreviewErrorMessage(code: string, messageKey?: string): string {
    if (messageKey === "scripts.budget.errors.policyUnavailable") {
      return copy.budget.errors.policyUnavailable;
    }
    if (messageKey === "scripts.budget.errors.providerUnavailable") {
      return copy.budget.errors.providerUnavailable;
    }
    return copy.budget.loadError;
  }

  function buildPreviewInput(action: BudgetPendingAction) {
    switch (action.kind) {
      case "script_batch":
        return {
          weekStart,
          jobKind: "script_generate" as const,
          mode: "batch" as const,
        };
      case "script_regenerate":
        return {
          weekStart,
          jobKind: "script_generate" as const,
          mode: "slot" as const,
          slotIndex: action.slotIndex,
        };
      case "caption_batch":
        return {
          weekStart,
          jobKind: "caption_generate" as const,
          mode: "batch" as const,
        };
      case "caption_regenerate":
        return {
          weekStart,
          jobKind: "caption_generate" as const,
          mode: "slot" as const,
          slotIndex: action.slotIndex,
        };
    }
  }

  async function openBudgetDialog(action: BudgetPendingAction) {
    if (isBusy) {
      return;
    }

    setBudgetPendingAction(action);
    setBudgetDialogVisible(true);
    setBudgetPreviewLoading(true);
    setBudgetPreviewError(null);
    setBudgetPreview(null);
    setBudgetOverrideReason("");

    try {
      const result = await getReelBudgetPreview(buildPreviewInput(action));
      if (result.ok) {
        setBudgetPreview(result.preview);
        setBudgetPreviewIsBatch("isBatch" in result && result.isBatch === true);
        return;
      }
      setBudgetPreviewError(
        budgetPreviewErrorMessage(result.error.code, result.error.messageKey),
      );
    } catch {
      setBudgetPreviewError(copy.budget.loadError);
    } finally {
      setBudgetPreviewLoading(false);
    }
  }

  async function executeGenerateScripts(override?: BudgetOverridePayload) {
    setBatchPending(true);
    setBanner(null);

    try {
      const result = await generateReelScripts({ weekStart, ...override });

      if (result.ok) {
        toast.success(copy.toastGenerateSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      const failedSlots = result.error.fields?.failedSlotIndexes ?? [];
      if (result.error.code === "SCRIPT_OUTPUT_INVALID" && failedSlots.length > 0) {
        setBanner(copy.errors.scriptSlotsFailed.replace("{slots}", failedSlots.join(", ")));
        if ((result.error.fields?.savedSlotIndexes?.length ?? 0) > 0) {
          router.refresh();
        }
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setBatchPending(false);
    }
  }

  async function executeRegenerateScript(
    slotIndex: number,
    override?: BudgetOverridePayload,
  ) {
    setRegeneratingSlot(slotIndex);
    setBanner(null);

    try {
      const result = await regenerateReelScriptSlot({ weekStart, slotIndex, ...override });

      if (result.ok) {
        toast.success(copy.toastRegenerateSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForCode(result.error.code, result.error.messageKey, copy));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setRegeneratingSlot(null);
    }
  }

  async function executeGenerateCaptions(override?: BudgetOverridePayload) {
    setCaptionBatchPending(true);
    setBanner(null);

    try {
      const result = await generateReelCaptions({ weekStart, ...override });

      if (result.ok) {
        toast.success(copy.caption.toastGenerateSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForCaptionCode(result.error.code, result.error.messageKey, copy));
    } catch {
      setBanner(copy.caption.errors.internal);
    } finally {
      setCaptionBatchPending(false);
    }
  }

  async function executeRegenerateCaption(
    slotIndex: number,
    override?: BudgetOverridePayload,
  ) {
    setCaptionRegeneratingSlot(slotIndex);
    setBanner(null);

    try {
      const result = await regenerateReelCaption({ weekStart, slotIndex, ...override });

      if (result.ok) {
        toast.success(copy.caption.toastRegenerateSuccess, { description: copy.caption.ctaSelect.clearedOnRegen, duration: 5000 });
        router.refresh();
        return;
      }

      setBanner(messageForCaptionCode(result.error.code, result.error.messageKey, copy));
    } catch {
      setBanner(copy.caption.errors.internal);
    } finally {
      setCaptionRegeneratingSlot(null);
    }
  }

  async function confirmBudgetAction(override?: BudgetOverridePayload) {
    if (!budgetPendingAction) {
      return;
    }

    setBudgetConfirmPending(true);

    try {
      switch (budgetPendingAction.kind) {
        case "script_batch":
          await executeGenerateScripts(override);
          break;
        case "script_regenerate":
          await executeRegenerateScript(budgetPendingAction.slotIndex, override);
          break;
        case "caption_batch":
          await executeGenerateCaptions(override);
          break;
        case "caption_regenerate":
          await executeRegenerateCaption(budgetPendingAction.slotIndex, override);
          break;
      }
      closeBudgetDialog();
    } finally {
      setBudgetConfirmPending(false);
    }
  }

  function requestGenerateScripts() {
    void openBudgetDialog({ kind: "script_batch" });
  }

  function requestRegenerateScript(slotIndex: number) {
    void openBudgetDialog({ kind: "script_regenerate", slotIndex });
  }

  function requestGenerateCaptions() {
    void openBudgetDialog({ kind: "caption_batch" });
  }

  function requestRegenerateCaption(slotIndex: number) {
    void openBudgetDialog({ kind: "caption_regenerate", slotIndex });
  }

  async function handleGenerate() {
    requestGenerateScripts();
  }

  async function handleRegenerate(slotIndex: number) {
    requestRegenerateScript(slotIndex);
  }

  async function handleGenerateCaptions() {
    requestGenerateCaptions();
  }

  async function handleRegenerateCaption(slotIndex: number) {
    requestRegenerateCaption(slotIndex);
  }

  async function handleSelectCaptionCta(slotIndex: number, selectedCtaIndex: number) {
    if (isBusy) {
      return;
    }

    setCaptionSelectingSlot(slotIndex);
    setBanner(null);

    try {
      const result = await selectReelCaptionCta({
        weekStart,
        slotIndex,
        selectedCtaIndex,
      });

      if (result.ok) {
        toast.success(copy.caption.ctaSelect.selectionSaved, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(
        messageForCaptionCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.caption.errors.internal);
    } finally {
      setCaptionSelectingSlot(null);
    }
  }

  function openRetryDialog(failedJobId: string) {
    if (isBusy) {
      return;
    }
    setRetryFailedJobId(failedJobId);
    setRetryDialogVisible(true);
  }

  function closeRetryDialog() {
    if (videoJobMutationPending) {
      return;
    }
    setRetryDialogVisible(false);
    setRetryFailedJobId(null);
  }

  function openOverrideDialog(failedJobId: string) {
    if (isBusy) {
      return;
    }
    setOverrideFailedJobId(failedJobId);
    setOverrideDialogVisible(true);
  }

  function closeOverrideDialog() {
    if (videoJobMutationPending) {
      return;
    }
    setOverrideDialogVisible(false);
    setOverrideFailedJobId(null);
  }

  function handleVideoJobRetrySuccess() {
    toast.success(copy.videoJob.toastRetrySuccess, { duration: 4000 });
    router.refresh();
  }

  function handleHeygenGenerateSuccess() {
    toast.success(copy.heygen.toastSuccess, { duration: 4000 });
    router.refresh();
  }

  function handleBrollGenerateSuccess(outcome: BrollGenerateOutcome) {
    if (outcome.kind === "full") {
      toast.success(formatBrollGenerateTemplate(copy.broll.toastSuccess, { count: outcome.createdCount }), { duration: 4000 });
    } else {
      toast.success(formatBrollGenerateTemplate(copy.broll.toastPartial, { created: outcome.createdCount, skipped: outcome.skippedCount }), { duration: 5000 });
      if (outcome.skipMessages.length > 0) {
        toast.warning(outcome.skipMessages.join(" "), { duration: 6000 });
      }
    }
    router.refresh();
  }

  function handleVideoJobOverrideSuccess() {
    toast.success(copy.videoJob.toastOverrideSuccess, { duration: 4000 });
    router.refresh();
  }

  function handleManualUploadSuccess(
    reelScriptId: string,
    job: OperatorVideoJobSummaryDto,
  ) {
    setVideoJobOverrides((prev) => ({
      ...prev,
      [reelScriptId]: job,
    }));
    toast.success(copy.videoJob.manualUpload.success, { duration: 4000 });
    router.refresh();
  }

  function handleVoiceoverSuccess(
    reelScriptId: string,
    result: SynthesizeVoiceoverForReelScriptSuccess,
  ) {
    const nextSummary: VoiceoverSummaryDto = {
      voiceoverAssetId: result.voiceoverAssetId,
      voiceId: result.voiceId,
      createdAt: new Date().toISOString(),
      canSynthesize: true,
      canRegenerate: true,
    };
    setVoiceoverOverrides((prev) => ({
      ...prev,
      [reelScriptId]: nextSummary,
    }));
    router.refresh();
  }

  function handleVoiceoverToastSuccess(summary: string) {
    toast.success(summary, { duration: 4000 });
  }

  function handleVoiceoverError(message: string) {
    toast.error(message, { duration: 6000 });
  }

  function openReassembleDialog(reelScriptId: string) {
    if (isBusy) {
      return;
    }
    setReassembleReelScriptId(reelScriptId);
    setReassembleDialogVisible(true);
  }

  function closeReassembleDialog() {
    if (assemblyMutationPending) {
      return;
    }
    setReassembleDialogVisible(false);
    setReassembleReelScriptId(null);
  }

  function openRebrandDialog(
    assemblyJobId: string,
    subtitlesEnabled: boolean,
    logoEnabled: boolean,
    coverFrameSec: number,
  ) {
    setRebrandAssemblyJobId(assemblyJobId);
    setRebrandSubtitlesEnabled(subtitlesEnabled);
    setRebrandLogoEnabled(logoEnabled);
    setRebrandCoverFrameSec(coverFrameSec);
    setRebrandDialogVisible(true);
  }

  function closeRebrandDialog() {
    if (assemblyMutationPending) {
      return;
    }
    setRebrandDialogVisible(false);
    setRebrandAssemblyJobId(null);
  }

  function findReelScriptIdForAssemblyJob(jobId: string): string | null {
    for (const [reelScriptId, job] of Object.entries(assemblyByReelScriptId)) {
      if (job?.jobId === jobId) {
        return reelScriptId;
      }
    }
    return null;
  }

  function buildAssemblyOverrideFromSuccess(
    reelScriptId: string,
    result: AssembleReelForScriptSuccess,
    targetDurationSec: number | null,
  ): OperatorAssemblyJobDto {
    const existing = assemblyByReelScriptId[reelScriptId];
    return {
      jobId: result.jobId,
      reelScriptId,
      status: result.status,
      templateId: ASSEMBLY_TEMPLATE_REEL_V1_BASIC,
      targetDurationSec:
        existing?.targetDurationSec ?? targetDurationSec ?? 30,
      actualDurationSec: existing?.actualDurationSec ?? null,
      outputMediaAssetId: result.outputMediaAssetId ?? existing?.outputMediaAssetId ?? null,
      failureReason: null,
      brandingStatus: existing?.brandingStatus ?? null,
      brandingConfig: existing?.brandingConfig ?? null,
      coverMediaAssetId: existing?.coverMediaAssetId ?? null,
      preBrandingOutputMediaAssetId: existing?.preBrandingOutputMediaAssetId ?? null,
      brandingFailureReason: null,
      canApplyBranding: false,
      canRebrand: false,
      canAssemble: false,
      canReassemble: result.status === "completed" || result.status === "failed",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function handleAssemblySuccess(
    reelScriptId: string,
    result: AssembleReelForScriptSuccess,
    targetDurationSec: number | null,
  ) {
    setAssemblyOverrides((prev) => ({
      ...prev,
      [reelScriptId]: buildAssemblyOverrideFromSuccess(
        reelScriptId,
        result,
        targetDurationSec,
      ),
    }));
    router.refresh();
  }

  function buildBrandingOverrideFromSuccess(
    reelScriptId: string,
    result: ApplyBrandingForAssemblySuccess,
  ): OperatorAssemblyJobDto | null {
    const existing = assemblyByReelScriptId[reelScriptId];
    if (!existing) {
      return null;
    }

    return {
      ...existing,
      brandingStatus: result.brandingStatus,
      outputMediaAssetId:
        result.outputMediaAssetId ?? existing.outputMediaAssetId,
      coverMediaAssetId:
        result.coverMediaAssetId ?? existing.coverMediaAssetId,
      brandingFailureReason: null,
      canApplyBranding:
        result.brandingStatus !== "queued" && result.brandingStatus !== "processing",
      canRebrand:
        result.brandingStatus === "completed" || result.brandingStatus === "failed",
      updatedAt: new Date().toISOString(),
    };
  }

  function handleBrandingSuccess(
    reelScriptId: string,
    result: ApplyBrandingForAssemblySuccess,
  ) {
    const override = buildBrandingOverrideFromSuccess(reelScriptId, result);
    if (!override) {
      return;
    }

    setAssemblyOverrides((prev) => ({
      ...prev,
      [reelScriptId]: override,
    }));
    router.refresh();
  }

  function handleAssemblyToastSuccess(summary: string) {
    toast.success(summary, { duration: 4000 });
  }

  function handleAssemblyError(message: string) {
    toast.error(message, { duration: 6000 });
  }

  function buildQaOverrideFromSuccess(
    result: RunQaForAssembledReelSuccess,
    existing: OperatorQaReportDetailDto | null | undefined,
  ): OperatorQaReportDetailDto {
    const now = new Date().toISOString();
    return {
      qaReportId: result.qaReportId,
      assembledReelId: result.assembledReelId,
      status: result.status,
      checks: result.checks,
      overrides: existing?.overrides ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  function handleQaSuccess(result: RunQaForAssembledReelSuccess) {
    const existing = qaByAssembledReelId[result.assembledReelId];
    setQaOverrides((prev) => ({
      ...prev,
      [result.assembledReelId]: buildQaOverrideFromSuccess(result, existing),
    }));
    router.refresh();
  }

  function handleQaOverrideSuccess(result: OverrideQaCheckSuccess) {
    setQaOverrides((prev) => ({
      ...prev,
      [result.assembledReelId]: result.report,
    }));
    router.refresh();
  }

  function handleQaToastSuccess(summary: string) {
    toast.success(summary, { duration: 4000 });
  }

  function handleQaError(message: string) {
    toast.error(message, { duration: 6000 });
  }

  function handleVideoJobMutationError(message: string) {
    setBanner(message);
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      toast.success(copy.toastCopySuccess, { duration: 2500 });
    });
  }

  if (loadFailed) {
    return (
      <div className="max-w-[1100px] my-0 mx-auto">
        <PageHeader copy={copy} />
        <StatusAlert severity="error" text={copy.loadError} className="w-full" />
        <Button
          type="button"
          onClick={() => router.push("/dashboard")}
          variant="ghost"
          className="mt-4"
        >
          {copy.backDashboard}
        </Button>
      </div>
    );
  }

  const versionLabel = data.approvedStrategy
    ? copy.versionLabel.replace("{version}", String(data.approvedStrategy.version))
    : null;

  return (
    <div className="max-w-[1100px] my-0 mx-auto">
      <VideoJobRetryConfirmDialog
        visible={retryDialogVisible}
        failedJobId={retryFailedJobId}
        locale={locale}
        copy={copy.videoJob.retryConfirm}
        pending={videoJobMutationPending}
        onHide={closeRetryDialog}
        onPendingChange={setVideoJobMutationPending}
        onSuccess={handleVideoJobRetrySuccess}
        onRetryLimitExceeded={openOverrideDialog}
        onError={handleVideoJobMutationError}
      />
      <VideoJobRetryLimitOverrideDialog
        visible={overrideDialogVisible}
        failedJobId={overrideFailedJobId}
        copy={copy.videoJob.retryOverride}
        pending={videoJobMutationPending}
        onHide={closeOverrideDialog}
        onPendingChange={setVideoJobMutationPending}
        onSuccess={handleVideoJobOverrideSuccess}
        onError={handleVideoJobMutationError}
      />
      <AssemblyReassembleConfirmDialog
        visible={reassembleDialogVisible}
        reelScriptId={reassembleReelScriptId}
        copy={copy.assembly.reassembleConfirm}
        pending={assemblyMutationPending}
        onHide={closeReassembleDialog}
        onPendingChange={setAssemblyMutationPending}
        onSuccess={(result) => {
          if (reassembleReelScriptId) {
            const row = data.items.find((item) => item.scriptId === reassembleReelScriptId);
            handleAssemblySuccess(
              reassembleReelScriptId,
              result,
              row?.targetDurationSec ?? null,
            );
            handleAssemblyToastSuccess(copy.assembly.toastAssembleSuccess);
          }
        }}
        onError={handleAssemblyError}
      />
      <BrandingRebrandConfirmDialog
        visible={rebrandDialogVisible}
        assemblyJobId={rebrandAssemblyJobId}
        subtitlesEnabled={rebrandSubtitlesEnabled}
        logoEnabled={rebrandLogoEnabled}
        coverFrameSec={rebrandCoverFrameSec}
        copy={copy.assembly.rebrandConfirm}
        pending={assemblyMutationPending}
        onHide={closeRebrandDialog}
        onPendingChange={setAssemblyMutationPending}
        onSuccess={(result) => {
          const reelScriptId = rebrandAssemblyJobId
            ? findReelScriptIdForAssemblyJob(rebrandAssemblyJobId)
            : null;
          if (reelScriptId) {
            handleBrandingSuccess(reelScriptId, result);
            handleAssemblyToastSuccess(copy.assembly.branding.toastApplySuccess);
          }
        }}
        onError={handleAssemblyError}
      />
      <ReelBudgetConfirmDialog
        visible={budgetDialogVisible}
        loading={budgetPreviewLoading}
        loadError={budgetPreviewError}
        preview={budgetPreview}
        isBatch={budgetPreviewIsBatch}
        locale={locale}
        copy={copy.budget}
        recommendationCopy={copy.providerRecommendation}
        overrideReason={budgetOverrideReason}
        onOverrideReasonChange={setBudgetOverrideReason}
        pending={budgetConfirmPending}
        onHide={closeBudgetDialog}
        onConfirm={() => void confirmBudgetAction()}
        onProceedAnyway={() =>
          void confirmBudgetAction({
            budgetOverride: true,
            overrideReason: budgetOverrideReason.trim(),
          })
        }
      />
      <PageHeader copy={copy} />

      <div className="mb-6 max-w-[320px]">
        <Label
          htmlFor="scripts-week-picker"
          className="mb-2 block font-semibold"
        >
          {copy.weekLabel}
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="scripts-week-picker"
              type="button"
              variant="outline"
              disabled={isBusy}
              className="w-full justify-between font-normal"
            >
              {formatDateInputValue(weekDate)}
              <CalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto border-edge bg-panel p-0" align="start">
            <Calendar
              mode="single"
              selected={weekDate}
              defaultMonth={weekDate}
              onSelect={(date) => {
                if (!date || isBusy) {
                  return;
                }
                navigateWeek(normalizeToIsoMonday(date));
              }}
            />
          </PopoverContent>
        </Popover>
        <p className="mt-2 mx-0 mb-0 text-dim text-sm">
          {weekRangeLabel}
        </p>
      </div>

      {hasApprovedStrategy ? (
        <div
          className="flex items-center justify-between gap-4 flex-wrap mb-4"
        >
          <div className="flex flex-wrap gap-2 items-center">
            {versionLabel ? <TagLine text={versionLabel} /> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={(isBusy) || (batchPending)}
            >
              {batchPending ? <Spinner className="size-4 text-current" /> : <SparklesIcon />}
              {batchPending ? copy.generating : copy.generate}
            </Button>
            {hasAnyGenerated ? (
              <Button
                type="button"
                onClick={() => void handleGenerateCaptions()}
                disabled={(isBusy) || (captionBatchPending)}
              >
                {captionBatchPending ? <Spinner className="size-4 text-current" /> : <CameraIcon />}
                {captionBatchPending ? copy.caption.generating : copy.caption.generate}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.strategyVersionChanged ? (
        <StatusAlert
          severity="warn"
          text={copy.strategyVersionWarning}
          className="w-full mb-4"
        />
      ) : null}

      {banner ? (
        <StatusAlert severity="error" text={banner} className="w-full mb-4" />
      ) : null}

      {batchPending || captionBatchPending ? (
        <GeneratingSkeleton
          copy={copy}
          message={captionBatchPending ? copy.caption.generating : copy.generating}
        />
      ) : !hasApprovedStrategy ? (
        <div>
          <StatusAlert severity="info" text={copy.emptyNoStrategy} className="w-full" />
          <Link href={`/operator/strategy?weekStart=${weekStart}`}>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
            >
              {copy.emptyNoStrategyCta}
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {allPending ? (
            <StatusAlert
              severity="info"
              text={copy.emptyNoScripts}
              className="w-full mb-4"
            />
          ) : null}
          {allCaptionsPending ? (
            <StatusAlert
              severity="info"
              text={copy.caption.emptyPending}
              className="w-full mb-4"
            />
          ) : null}
          <Table>
            <TableHeader>
              <TableRow className="border-edge hover:bg-transparent">
                <TableHead className="w-12" />
                <TableHead className="text-dim">{copy.columns.tema}</TableHead>
                <TableHead className="text-dim">{copy.columns.day}</TableHead>
                <TableHead className="text-dim">{copy.columns.duration}</TableHead>
                <TableHead className="text-dim">{copy.columns.status}</TableHead>
                {showCostSummary ? (
                  <TableHead className="text-dim">
                    {copy.cost.actual.columnHeader}
                  </TableHead>
                ) : null}
                <TableHead className="text-dim">{copy.columns.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row: ReelScriptListItem) => {
                const isExpanded = expandedRows.some(
                  (expanded) => expanded.slotIndex === row.slotIndex,
                );
                const slotCost = showCostSummary
                  ? findSlotCostSummary(costSummary, row.slotIndex)
                  : undefined;
                const actual = showCostSummary
                  ? renderActualCostValue(slotCost, locale, copy.cost.actual)
                  : null;

                return (
                  <Fragment key={row.slotIndex}>
                    <TableRow className="border-edge odd:bg-panel/40 hover:bg-panel/70 data-[state=expanded]:bg-panel/70" data-state={isExpanded ? "expanded" : undefined}>
                      <TableCell className="w-12">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-expanded={isExpanded}
                          aria-label={row.tema}
                          onClick={() =>
                            setExpandedRows((current) =>
                              current.some(
                                (expanded) => expanded.slotIndex === row.slotIndex,
                              )
                                ? current.filter(
                                    (expanded) => expanded.slotIndex !== row.slotIndex,
                                  )
                                : [...current, row],
                            )
                          }
                        >
                          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="font-semibold">{row.tema}</span>
                          {row.readability?.hasWarnings ? (
                            <StatusBadge
                              value={copy.readability.rowBadge}
                              severity="warning"
                              icon={<TriangleAlertIcon />}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.dayOfWeek
                          ? copy.days[row.dayOfWeek as ContentStrategyDayOfWeek] ?? row.dayOfWeek
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {formatDuration(row.targetDurationSec, copy.durationSeconds)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap gap-[0.35rem]">
                          <StatusBadge
                            value={
                              row.status === "generated"
                                ? copy.status.generated
                                : copy.status.pending
                            }
                            severity={row.status === "generated" ? "success" : "warning"}
                          />
                          {row.status === "generated" ? (
                            <StatusBadge
                              value={
                                row.caption.status === "generated"
                                  ? copy.caption.status.generated
                                  : copy.caption.status.pending
                              }
                              severity={
                                row.caption.status === "generated" ? "info" : "warning"
                              }
                            />
                          ) : null}
                          {row.caption.stale ? (
                            <StatusBadge
                              value={copy.caption.staleBadge}
                              severity="warning"
                              icon={<TriangleAlertIcon />}
                            />
                          ) : null}
                          {row.scriptId &&
                          videoJobsByReelScriptId[row.scriptId] ? (
                            <VideoJobStatusTag
                              status={videoJobsByReelScriptId[row.scriptId]!.status}
                              copy={copy.videoJob}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      {showCostSummary && actual ? (
                        <TableCell>
                          <div className="grid gap-[0.2rem] text-sm">
                            <div className="text-fog">
                              <span className="text-dim mr-[0.35rem]">
                                {copy.cost.actual.estimated}
                              </span>
                              {renderEstimatedCostValue(slotCost, locale)}
                            </div>
                            <div className={actual.subdued ? "text-dim" : "text-fog"}>
                              <span className="text-dim mr-[0.35rem]">
                                {copy.cost.actual.actual}
                              </span>
                              {actual.text}
                            </div>
                          </div>
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Button
                          type="button"
                          onClick={() => void handleRegenerate(row.slotIndex)}
                          variant="secondary"
                          size="sm"
                          disabled={isBusy || regeneratingSlot === row.slotIndex}
                        >
                          {regeneratingSlot === row.slotIndex ? (
                            <Spinner className="size-4 text-current" />
                          ) : null}
                          {regeneratingSlot === row.slotIndex
                            ? copy.regenerating
                            : copy.regenerate}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow className="border-edge hover:bg-transparent">
                        <TableCell
                          colSpan={showCostSummary ? 7 : 6}
                          className="whitespace-normal"
                        >
                      <ReelDetailPanel
                        row={row}
                        weekStart={weekStart}
                        locale={locale}
                        clientId={clientId}
                        copy={copy}
                        reelCostRollups={reelCostRollups}
                        videoJobsByReelScriptId={videoJobsByReelScriptId}
                        brollJobsByReelScriptId={data.brollJobsByReelScriptId}
                        voiceoverByReelScriptId={voiceoverByReelScriptId}
                        assemblyByReelScriptId={assemblyByReelScriptId}
                        qaByAssembledReelId={qaByAssembledReelId}
                        showCostRollup={showCostSummary}
                        onCopy={copyToClipboard}
                        onRegenerateCaption={(slotIndex) => void handleRegenerateCaption(slotIndex)}
                        onSelectCaptionCta={(slotIndex, selectedCtaIndex) =>
                          void handleSelectCaptionCta(slotIndex, selectedCtaIndex)
                        }
                        onRequestVideoJobRetry={openRetryDialog}
                        onRequestVideoJobOverride={openOverrideDialog}
                        onHeygenGenerateSuccess={handleHeygenGenerateSuccess}
                        onHeygenGenerateError={handleVideoJobMutationError}
                        onBrollGenerateSuccess={handleBrollGenerateSuccess}
                        onBrollGenerateError={handleVideoJobMutationError}
                        onManualUploadSuccess={(job) => {
                          if (row.scriptId) {
                            handleManualUploadSuccess(row.scriptId, job);
                          }
                        }}
                        onVoiceoverSuccess={(result) => {
                          if (row.scriptId) {
                            handleVoiceoverSuccess(row.scriptId, result);
                          }
                        }}
                        onVoiceoverToastSuccess={handleVoiceoverToastSuccess}
                        onVoiceoverError={handleVoiceoverError}
                        onRequestAssemblyReassemble={openReassembleDialog}
                        onAssemblySuccess={(result) => {
                          if (row.scriptId) {
                            handleAssemblySuccess(
                              row.scriptId,
                              result,
                              row.targetDurationSec,
                            );
                          }
                        }}
                        onAssemblyToastSuccess={handleAssemblyToastSuccess}
                        onAssemblyError={handleAssemblyError}
                        onQaSuccess={handleQaSuccess}
                        onQaOverrideSuccess={handleQaOverrideSuccess}
                        onQaToastSuccess={handleQaToastSuccess}
                        onQaError={handleQaError}
                        onRequestBrandingRebrand={openRebrandDialog}
                        onBrandingSuccess={(result) => {
                          if (row.scriptId) {
                            handleBrandingSuccess(row.scriptId, result);
                          }
                        }}
                        captionRegeneratingSlot={captionRegeneratingSlot}
                        captionSelectingSlot={captionSelectingSlot}
                        isBusy={isBusy}
                      />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          {showCostSummary ? (
            <WeeklyCostFooter
              costSummary={costSummary}
              locale={locale}
              copy={copy.cost.actual}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

type ReelDetailPanelProps = {
  row: ReelScriptListItem;
  weekStart: string;
  locale: string;
  clientId: string;
  copy: ScriptsPageCopy;
  reelCostRollups: ReelCostRollupsMap;
  videoJobsByReelScriptId: OperatorVideoJobsByReelMap;
  brollJobsByReelScriptId: OperatorBrollJobsByReelMap;
  voiceoverByReelScriptId: VoiceoverSummaryByReelMap;
  assemblyByReelScriptId: OperatorAssemblyJobsByReelMap;
  qaByAssembledReelId: OperatorQaReportsByAssembledReelMap;
  showCostRollup: boolean;
  onCopy: (text: string) => void;
  onRegenerateCaption: (slotIndex: number) => void;
  onSelectCaptionCta: (slotIndex: number, selectedCtaIndex: number) => void;
  onRequestVideoJobRetry: (failedJobId: string) => void;
  onRequestVideoJobOverride: (failedJobId: string) => void;
  onHeygenGenerateSuccess: () => void;
  onHeygenGenerateError: (message: string) => void;
  onBrollGenerateSuccess: (outcome: BrollGenerateOutcome) => void;
  onBrollGenerateError: (message: string) => void;
  onManualUploadSuccess: (job: OperatorVideoJobSummaryDto) => void;
  onVoiceoverSuccess: (result: SynthesizeVoiceoverForReelScriptSuccess) => void;
  onVoiceoverToastSuccess: (summary: string) => void;
  onVoiceoverError: (message: string) => void;
  onRequestAssemblyReassemble: (reelScriptId: string) => void;
  onRequestBrandingRebrand: (
    assemblyJobId: string,
    subtitlesEnabled: boolean,
    logoEnabled: boolean,
    coverFrameSec: number,
  ) => void;
  onAssemblySuccess: (result: AssembleReelForScriptSuccess) => void;
  onBrandingSuccess: (result: ApplyBrandingForAssemblySuccess) => void;
  onAssemblyToastSuccess: (summary: string) => void;
  onAssemblyError: (message: string) => void;
  onQaSuccess: (result: RunQaForAssembledReelSuccess) => void;
  onQaOverrideSuccess: (result: OverrideQaCheckSuccess) => void;
  onQaToastSuccess: (summary: string) => void;
  onQaError: (message: string) => void;
  captionRegeneratingSlot: number | null;
  captionSelectingSlot: number | null;
  isBusy: boolean;
};

function ReelDetailPanel({
  row,
  weekStart,
  locale,
  clientId,
  copy,
  reelCostRollups,
  videoJobsByReelScriptId,
  brollJobsByReelScriptId,
  voiceoverByReelScriptId,
  assemblyByReelScriptId,
  qaByAssembledReelId,
  showCostRollup,
  onCopy,
  onRegenerateCaption,
  onSelectCaptionCta,
  onRequestVideoJobRetry,
  onRequestVideoJobOverride,
  onHeygenGenerateSuccess,
  onHeygenGenerateError,
  onBrollGenerateSuccess,
  onBrollGenerateError,
  onManualUploadSuccess,
  onVoiceoverSuccess,
  onVoiceoverToastSuccess,
  onVoiceoverError,
  onRequestAssemblyReassemble,
  onRequestBrandingRebrand,
  onAssemblySuccess,
  onBrandingSuccess,
  onAssemblyToastSuccess,
  onAssemblyError,
  onQaSuccess,
  onQaOverrideSuccess,
  onQaToastSuccess,
  onQaError,
  captionRegeneratingSlot,
  captionSelectingSlot,
  isBusy,
}: ReelDetailPanelProps) {
  const rollup =
    row.scriptId !== null ? reelCostRollups[row.scriptId] : undefined;
  const videoJob =
    row.scriptId !== null ? videoJobsByReelScriptId[row.scriptId] : null;
  const brollClips =
    row.scriptId !== null ? (brollJobsByReelScriptId[row.scriptId] ?? []) : [];
  const voiceoverSummary =
    row.scriptId !== null ? voiceoverByReelScriptId[row.scriptId] : null;
  const assemblyJob =
    row.scriptId !== null ? assemblyByReelScriptId[row.scriptId] : null;
  const qaReport =
    assemblyJob?.jobId != null
      ? qaByAssembledReelId[assemblyJob.jobId]
      : null;
  const videoJobInFlight =
    videoJob?.status === "queued" || videoJob?.status === "processing";

  return (
    <div>
      <ProviderRecommendationPanel
        weekStart={weekStart}
        slotIndex={row.slotIndex}
        locale={locale}
        copy={copy.providerRecommendation}
      />
      {showCostRollup ? (
        <ReelCostRollupPanel
          rollup={rollup}
          locale={locale}
          copy={copy.cost.rollup}
        />
      ) : null}
      {row.scriptId ? (
        <ManualVideoUploadControl
          reelScriptId={row.scriptId}
          clientId={clientId}
          videoJob={videoJob}
          copy={copy.videoJob.manualUpload}
          disabled={isBusy}
          onSuccess={onManualUploadSuccess}
        />
      ) : null}
      {row.scriptId ? (
        <OperatorVoiceoverPanel
          reelScriptId={row.scriptId}
          summary={voiceoverSummary}
          copy={copy.voiceover}
          disabled={isBusy}
          onSuccess={onVoiceoverSuccess}
          onError={onVoiceoverError}
          onToastSuccess={onVoiceoverToastSuccess}
        />
      ) : null}
      {row.scriptId ? (
        <HeygenGenerateControl
          reelScriptId={row.scriptId}
          clientId={clientId}
          targetDurationSec={row.targetDurationSec}
          voiceoverAssetId={voiceoverSummary?.voiceoverAssetId}
          jobInFlight={videoJobInFlight}
          locale={locale}
          copy={copy.heygen}
          disabled={isBusy}
          onSuccess={onHeygenGenerateSuccess}
          onError={onHeygenGenerateError}
        />
      ) : null}
      {row.scriptId ? (
        <BrollGenerateControl
          reelScriptId={row.scriptId}
          clientId={clientId}
          locale={locale}
          copy={copy.broll}
          disabled={isBusy}
          onSuccess={onBrollGenerateSuccess}
          onError={onBrollGenerateError}
        />
      ) : null}
      <OperatorBrollJobsPanel
        initialClips={brollClips}
        copy={copy.brollStatus}
      />
      <OperatorVideoJobSummaryPanel
        initialJob={videoJob}
        locale={locale}
        copy={copy.videoJob}
        isBusy={isBusy}
        onRequestRetry={onRequestVideoJobRetry}
        onRequestOverride={onRequestVideoJobOverride}
      />
      {row.scriptId ? (
        <OperatorAssemblyPanel
          reelScriptId={row.scriptId}
          initialJob={assemblyJob}
          primaryVideoJob={videoJob}
          copy={copy.assembly}
          disabled={isBusy}
          onRequestReassemble={onRequestAssemblyReassemble}
          onRequestRebrand={onRequestBrandingRebrand}
          onAssembleSuccess={onAssemblySuccess}
          onBrandingSuccess={onBrandingSuccess}
          onError={onAssemblyError}
          onToastSuccess={onAssemblyToastSuccess}
        />
      ) : null}
      {assemblyJob?.jobId ? (
        <OperatorQaPanel
          assembledReelId={assemblyJob.jobId}
          assemblyStatus={assemblyJob.status}
          brandingStatus={assemblyJob.brandingStatus}
          report={qaReport}
          copy={copy.qa}
          disabled={isBusy}
          onSuccess={onQaSuccess}
          onOverrideSuccess={onQaOverrideSuccess}
          onError={onQaError}
          onToastSuccess={onQaToastSuccess}
        />
      ) : null}
      <Tabs defaultValue="script">
        <TabsList variant="line" className="border-b border-edge">
          <TabsTrigger
            value="script"
            className="text-dim data-[state=active]:text-fog"
          >
            {copy.caption.tabs.script}
          </TabsTrigger>
          <TabsTrigger
            value="caption"
            className="text-dim data-[state=active]:text-fog"
          >
            {copy.caption.tabs.caption}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="script"
          forceMount
          className="pt-3 data-[state=inactive]:hidden"
        >
          <ScriptDetailPanel row={row} copy={copy} onCopy={onCopy} />
        </TabsContent>
        <TabsContent
          value="caption"
          forceMount
          className="pt-3 data-[state=inactive]:hidden"
        >
        <CaptionDetailPanel
          row={row}
          copy={copy}
          onCopy={onCopy}
          onRegenerate={() => onRegenerateCaption(row.slotIndex)}
          onSelectCta={(selectedCtaIndex) =>
            onSelectCaptionCta(row.slotIndex, selectedCtaIndex)
          }
          isRegenerating={captionRegeneratingSlot === row.slotIndex}
          isSelecting={captionSelectingSlot === row.slotIndex}
          isBusy={isBusy}
        />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ScriptDetailPanelProps = {
  row: ReelScriptListItem;
  copy: ScriptsPageCopy;
  onCopy: (text: string) => void;
};

function ScriptDetailPanel({ row, copy, onCopy }: ScriptDetailPanelProps) {
  if (!row.package) {
    return (
      <p className="m-0 text-dim italic">
        {copy.status.pending}
      </p>
    );
  }

  const pkg = row.package;

  return (
    <div className="grid gap-4 py-2 px-0">
      <ScriptField
        label={copy.fields.hook}
        value={pkg.hook}
        highlighted
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.body}
        value={pkg.body}
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.cta}
        value={pkg.cta}
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      <ScriptField
        label={copy.fields.onScreenText}
        value={pkg.onScreenText}
        preserveWhitespace
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      {row.readability ? (
        <OnScreenReadabilityMetrics
          readability={row.readability}
          copy={copy}
        />
      ) : null}
      <ScriptField
        label={copy.fields.voiceoverText}
        value={pkg.voiceoverText}
        copyLabel={copy.copyField}
        onCopy={onCopy}
      />
      {row.readability ? (
        <VoiceoverReadabilityMetrics
          voiceover={row.readability.voiceover}
          copy={copy}
        />
      ) : null}
      {pkg.brollBeats && pkg.brollBeats.length > 0 ? (
        <ScriptField
          label={copy.fields.brollBeats}
          value={pkg.brollBeats.map((beat, index) => `${index + 1}. ${beat}`).join("\n")}
          preserveWhitespace
          copyLabel={copy.copyField}
          onCopy={onCopy}
        />
      ) : null}
      {pkg.coldOpenNotes ? (
        <ScriptField
          label={copy.fields.coldOpenNotes}
          value={pkg.coldOpenNotes}
          copyLabel={copy.copyField}
          onCopy={onCopy}
        />
      ) : null}
      {pkg.editingNotes ? (
        <ScriptField
          label={copy.fields.editingNotes}
          value={pkg.editingNotes}
          copyLabel={copy.copyField}
          onCopy={onCopy}
        />
      ) : null}
    </div>
  );
}

type CaptionDetailPanelProps = {
  row: ReelScriptListItem;
  copy: ScriptsPageCopy;
  onCopy: (text: string) => void;
  onRegenerate: () => void;
  onSelectCta: (selectedCtaIndex: number) => void;
  isRegenerating: boolean;
  isSelecting: boolean;
  isBusy: boolean;
};

function CaptionDetailPanel({
  row,
  copy,
  onCopy,
  onRegenerate,
  onSelectCta,
  isRegenerating,
  isSelecting,
  isBusy,
}: CaptionDetailPanelProps) {
  if (row.status !== "generated") {
    return (
      <StatusAlert severity="info" text={copy.caption.emptyNoScript} className="w-full" />
    );
  }

  const caption = row.caption;
  const record = caption.record;

  if (caption.status !== "generated" || !record) {
    return (
      <div className="grid gap-4">
        <StatusAlert severity="info" text={copy.caption.emptyPending} className="w-full" />
        <Button
          type="button"
          onClick={onRegenerate}
          variant="secondary"
          disabled={(isBusy) || (isRegenerating)}
        >
          {isRegenerating ? <Spinner className="size-4 text-current" /> : <RefreshCwIcon />}
          {isRegenerating ? copy.caption.regenerating : copy.caption.regenerate}
        </Button>
      </div>
    );
  }

  const charOverLimit = record.charCount > IG_CAPTION_MAX_CHARS;
  const hashtagWarn =
    record.hashtagsOverConfiguredMax || record.hashtagCount > IG_HASHTAG_WARN_MAX;
  const hashtagBlock = record.hashtags.join(" ");
  const hasSelectedCta = caption.selectedCtaIndex !== null;
  const effectivePreview = hasSelectedCta
    ? buildEffectiveInstagramCaption({
        caption: record.caption,
        selectedCtaText: caption.selectedCtaText,
      })
    : null;
  const ctaGroupId = `cta-select-${row.slotIndex}`;

  return (
    <div className="grid gap-4">
      {caption.stale ? (
        <StatusAlert
          severity="warn"
          icon={<TriangleAlertIcon />}
          text={copy.caption.staleBadge}
          className="w-full"
        />
      ) : null}

      <div>
        <div
          className="flex items-center justify-between gap-2 mb-[0.35rem]"
        >
          <span className="font-semibold text-sm text-fog">
            {copy.caption.tabs.caption}
          </span>
          <Button
            type="button"
            onClick={() => onCopy(record.caption)}
            variant="ghost"
            size="sm"
          >
            <CopyIcon />
            {copy.caption.copyCaption}
          </Button>
        </div>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-lg border bg-panel px-4 py-3 text-[0.95rem] leading-normal text-fog",
            charOverLimit ? "border-butter/60" : "border-edge",
          )}
        >
          {record.caption}
        </div>
        <p
          className={cn(
            "mt-[0.35rem] mb-0 text-[0.8125rem]",
            charOverLimit ? "font-semibold text-butter" : "font-normal text-dim",
          )}
        >
          {formatTemplate(copy.caption.charCount, {
            count: record.charCount,
            max: record.maxCaptionChars,
          })}
        </p>
      </div>

      <div>
        <div
          className="flex items-center justify-between gap-2 mb-2"
        >
          <span className="font-semibold text-sm text-fog">
            {copy.caption.hashtagsLabel}
          </span>
          <Button
            type="button"
            onClick={() => onCopy(hashtagBlock)}
            variant="ghost"
            size="sm"
          >
            <CopyIcon />
            {copy.caption.copyHashtags}
          </Button>
        </div>
        <div className="flex flex-wrap gap-[0.35rem]">
          {record.hashtags.map((tag) => (
            <StatusBadge key={tag} value={tag} severity={hashtagWarn ? "warning" : "info"} />
          ))}
        </div>
        <p
          className={cn(
            "mt-[0.35rem] mb-0 text-[0.8125rem]",
            hashtagWarn ? "font-semibold text-butter" : "font-normal text-dim",
          )}
        >
          {formatTemplate(copy.caption.hashtagCount, {
            count: record.hashtagCount,
            max: record.maxHashtagsConfigured,
          })}
        </p>
        {hashtagWarn ? (
          <p className="mt-1 mx-0 mb-0 text-[0.8125rem] text-butter">
            {formatTemplate(copy.caption.hashtagsOverMax, {
              max: record.maxHashtagsConfigured,
            })}
          </p>
        ) : null}
      </div>

      {record.hasKeywords && record.keywords.length > 0 ? (
        <div>
          <span
            className="block font-semibold text-sm text-fog mb-2"
          >
            {copy.caption.keywordsLabel}
          </span>
          <div className="flex flex-wrap gap-[0.35rem]">
            {record.keywords.map((keyword) => (
              <StatusBadge key={keyword} value={keyword} severity="secondary" />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <span
          id={ctaGroupId}
          className="block font-semibold text-sm text-fog mb-2"
        >
          {copy.caption.ctaSelect.selectLabel}
        </span>
        <RadioGroup
          aria-labelledby={ctaGroupId}
          className="grid gap-2"
          name={`cta-${row.slotIndex}`}
          value={
            caption.selectedCtaIndex !== null &&
            caption.selectedCtaIndex !== undefined
              ? String(caption.selectedCtaIndex)
              : ""
          }
          disabled={isBusy || isSelecting}
          onValueChange={(value) => onSelectCta(Number(value))}
        >
          {record.ctaVariants.map((variant, index) => {
            const inputId = `cta-${row.slotIndex}-${index}`;
            const isSelected = caption.selectedCtaIndex === index;

            return (
              <label
                key={`${index}-${variant}`}
                htmlFor={inputId}
                className={cn(
                  "flex items-start gap-[0.65rem] rounded-md border px-[0.85rem] py-[0.65rem] text-[0.9rem] text-fog",
                  isSelected ? "border-info/60 bg-info/10" : "border-edge bg-panel",
                  isBusy ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <RadioGroupItem id={inputId} value={String(index)} />
                <span className="flex-1 leading-normal">
                  {formatTemplate(copy.caption.ctaVariantLine, {
                    index: index + 1,
                    text: variant,
                  })}
                </span>
              </label>
            );
          })}
        </RadioGroup>
        {!hasSelectedCta ? (
          <p
            className="mt-2 mx-0 mb-0 text-[0.8125rem] text-dim"
          >
            {copy.caption.ctaSelect.unselectedHint}
          </p>
        ) : null}
      </div>

      <div>
        <span
          className="block font-semibold text-sm text-fog mb-[0.35rem]"
        >
          {copy.caption.ctaSelect.previewHeading}
        </span>
        {effectivePreview ? (
          <>
            <div
              className={cn(
                "whitespace-pre-wrap rounded-lg border px-4 py-3 text-[0.95rem] leading-normal text-fog",
                caption.effectiveCaptionOverLimit
                  ? "border-butter/60 bg-butter/10"
                  : "border-edge bg-panel",
              )}
            >
              {effectivePreview}
            </div>
            {caption.effectiveCaptionOverLimit ? (
              <p
                className="mt-[0.35rem] mx-0 mb-0 text-[0.8125rem] text-butter font-semibold"
              >
                {formatTemplate(copy.caption.ctaSelect.effectiveLengthWarn, {
                  count: caption.effectiveCaptionCharCount,
                  max: IG_CAPTION_MAX_CHARS,
                })}
              </p>
            ) : null}
          </>
        ) : (
          <p
            className="m-0 text-sm text-dim italic"
          >
            {copy.caption.ctaSelect.unselectedHint}
          </p>
        )}
      </div>

      <Button
        type="button"
        onClick={onRegenerate}
        variant="secondary"
        disabled={(isBusy) || (isRegenerating || isSelecting)}
      >
        {isRegenerating || isSelecting ? <Spinner className="size-4 text-current" /> : <RefreshCwIcon />}
        {isRegenerating ? copy.caption.regenerating : copy.caption.regenerate}
      </Button>
    </div>
  );
}

type ScriptFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  highlighted?: boolean;
  preserveWhitespace?: boolean;
  onCopy: (text: string) => void;
};

function OnScreenReadabilityMetrics({
  readability,
  copy,
}: {
  readability: ReelScriptReadability;
  copy: ScriptsPageCopy;
}) {
  const { onScreen } = readability;
  const hasTooManyBeats = onScreen.warnings.includes("too_many_beats");

  return (
    <div className="grid gap-2">
      {hasTooManyBeats ? (
        <StatusAlert
          severity="warn"
          icon={<TriangleAlertIcon />}
          text={formatTemplate(copy.readability.tooManyBeats, {
            max: copy.readability.maxBeatLinesTotal,
          })}
          className="w-full"
        />
      ) : null}
      {onScreen.beatLines.map((beat) => (
        <OnScreenBeatLineMetrics
          key={beat.index}
          beat={beat}
          copy={copy}
        />
      ))}
    </div>
  );
}

function OnScreenBeatLineMetrics({
  beat,
  copy,
}: {
  beat: ReelScriptReadabilityBeatLine;
  copy: ScriptsPageCopy;
}) {
  const hasCharWarning = beat.warnings.includes("chars_exceeded");
  const hasLineWarning = beat.warnings.includes("lines_exceeded");
  const hasWarning = hasCharWarning || hasLineWarning;
  const displayIndex = beat.index + 1;

  const warningMessages: string[] = [];
  if (hasCharWarning) {
    warningMessages.push(
      formatTemplate(copy.readability.beatCharsExceeded, {
        index: displayIndex,
        charCount: beat.charCount,
        max: copy.readability.maxCharsPerBeatLine,
      }),
    );
  }
  if (hasLineWarning) {
    warningMessages.push(
      formatTemplate(copy.readability.beatLinesExceeded, {
        index: displayIndex,
      }),
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        hasWarning ? "border-butter/60 bg-butter/10" : "border-edge bg-panel",
      )}
    >
      <div
        className="flex items-start justify-between gap-3 flex-wrap"
      >
        <span
          className="text-sm text-fog whitespace-pre-wrap flex-[1_1_auto]"
        >
          {beat.text}
        </span>
        <span
          className={cn(
            "whitespace-nowrap text-[0.8125rem]",
            hasWarning ? "font-semibold text-butter" : "font-normal text-dim",
          )}
        >
          {beat.charCount}
        </span>
      </div>
      {warningMessages.map((message) => (
        <p
          key={message}
          className="mt-[0.35rem] mx-0 mb-0 text-[0.8125rem] text-butter flex items-center gap-[0.35rem]"
        >
          <TriangleAlertIcon aria-hidden="true" className="size-4" />
          <span>{message}</span>
        </p>
      ))}
    </div>
  );
}

function VoiceoverReadabilityMetrics({
  voiceover,
  copy,
}: {
  voiceover: ReelScriptReadabilityVoiceover;
  copy: ScriptsPageCopy;
}) {
  const template =
    voiceover.status === "over"
      ? copy.readability.voiceoverOver
      : voiceover.status === "under"
        ? copy.readability.voiceoverUnder
        : copy.readability.voiceoverOk;

  const summary = formatTemplate(template, {
    wordCount: voiceover.wordCount,
    targetWordCount: voiceover.targetWordCount,
    targetDurationSec: voiceover.targetDurationSec,
  });

  const hasWarning = voiceover.status !== "ok";

  if (hasWarning) {
    return (
      <StatusAlert
        severity="warn"
        icon={<TriangleAlertIcon />}
        text={summary}
        className="w-full"
      />
    );
  }

  return (
    <p
      className="m-0 text-sm text-dim"
    >
      {summary}
    </p>
  );
}

function ScriptField({
  label,
  value,
  copyLabel,
  highlighted = false,
  preserveWhitespace = false,
  onCopy,
}: ScriptFieldProps) {
  return (
    <div>
      <div
        className="flex items-center justify-between gap-2 mb-[0.35rem]"
      >
        <span className="font-semibold text-sm text-fog">
          {label}
        </span>
        <Button
          type="button"
          onClick={() => onCopy(value)}
          variant="ghost"
          size="sm"
        >
          <CopyIcon />
          {copyLabel}
        </Button>
      </div>
      <div
        className={cn(
          "rounded-lg border px-4 py-3 text-[0.95rem] leading-normal text-fog",
          highlighted ? "border-butter/60 bg-butter/15" : "border-edge bg-panel",
          preserveWhitespace ? "whitespace-pre-wrap" : "whitespace-normal",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function WeeklyCostFooter({
  costSummary,
  locale,
  copy,
}: {
  costSummary: ReelWeekCostSummary;
  locale: string;
  copy: ActualCostCopy;
}) {
  const estimatedLabel = formatTemplate(copy.weeklyEstimated, {
    amount: formatCentsForDisplay(costSummary.weeklyEstimatedCostCents, locale),
  });
  const actualAmount =
    costSummary.weeklyActualCostCents !== null
      ? formatCentsForDisplay(costSummary.weeklyActualCostCents, locale)
      : "—";
  const actualLabel = formatTemplate(copy.weeklyActual, { amount: actualAmount });

  return (
    <div
      className="mt-4 py-[0.85rem] px-4 rounded-lg border border-edge bg-panel"
    >
      <div
        className="flex flex-wrap gap-y-2 gap-x-4 items-baseline text-sm"
      >
        <span className="font-semibold text-fog">{copy.weeklyTotal}</span>
        <span className="text-fog">{estimatedLabel}</span>
        <span className={costSummary.weeklyActualCostCents === null ? "text-dim" : "text-fog"}>
          {actualLabel}
        </span>
      </div>
      {costSummary.hasPartialActual ? (
        <p className="mt-2 mx-0 mb-0 text-[0.8125rem] text-dim">
          {copy.partialActualHint}
        </p>
      ) : null}
    </div>
  );
}

function TagLine({ text }: { text: string }) {
  return (
    <span
      className="inline-block py-[0.35rem] px-3 rounded-full bg-info/10 text-info text-sm font-semibold"
    >
      {text}
    </span>
  );
}

function GeneratingSkeleton({
  copy,
  message,
}: {
  copy: Pick<ScriptsPageCopy, "generating">;
  message: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <StatusAlert
        severity="info"
        text={message}
        className="w-full mb-4"
      />
      <Skeleton className="mb-3 h-10 bg-edge" />
      <Skeleton className="mb-3 h-10 bg-edge" />
      <Skeleton className="mb-3 h-10 bg-edge" />
      <Skeleton className="h-10 bg-edge" />
    </div>
  );
}

function PageHeader({ copy }: { copy: Pick<ScriptsPageCopy, "title" | "subtitle"> }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-fog mt-0 mx-0 mb-2 text-[2rem]">{copy.title}</h1>
      <p className="m-0 text-dim">{copy.subtitle}</p>
    </div>
  );
}
