"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { mapPipelineStatusToReelBadge } from "@/components/campana/pipeline-badge";
import {
  NewReelCard,
  ReelCard,
  type CampanaReelCardModel,
} from "@/components/campana/ReelCard";
import {
  ScriptsSidePanel,
  type CampanaScriptItem,
} from "@/components/campana/ScriptsSidePanel";
import { WeekPicker } from "@/components/campana/WeekPicker";
import {
  WeeksStrip,
  type CampanaWeekCell,
  type CampanaWeekStatus,
} from "@/components/campana/WeeksStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  briefsEqual,
  buildEditablePatch,
  cloneBrief,
  hasValidEditableThemes,
} from "@/components/strategy/strategy-brief-edit";
import { StrategyBriefView } from "@/components/strategy/StrategyBriefView";
import { StrategyInsightsPanel } from "@/components/strategy/StrategyInsightsPanel";
import type {
  ContentStrategyBrief,
  ContentStrategyDayOfWeek,
  ContentStrategyErrorCode,
  ContentStrategySlotGoal,
  ContentStrategyView,
} from "@/lib/contracts/content-strategy";
import { approveContentStrategy } from "@/lib/content-strategy/actions/approve-content-strategy";
import { generateContentStrategy } from "@/lib/content-strategy/actions/generate-content-strategy";
import { updateContentStrategyBrief } from "@/lib/content-strategy/actions/update-content-strategy-brief";
import type { OperatorClientOption } from "@/lib/content-strategy/load-operator-clients-for-strategy";
import type { CalendarSlotDetailDto } from "@/lib/contracts/calendar";
import type { ReelScriptListItem } from "@/lib/contracts/reel-script";
import type { StrategyPerformanceInsightsDto } from "@/lib/contracts/strategy-insights";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { formatWeekRange } from "@/lib/trend/normalize-week-start";
import { cn } from "@/lib/utils";

type StrategyPageCopy = {
  title: string;
  subtitle: string;
  generate: string;
  regenerate: string;
  generating: string;
  save: string;
  saving: string;
  approve: string;
  approving: string;
  clientLabel: string;
  clientSessionHint: string;
  weekLabel: string;
  empty: string;
  loadError: string;
  backDashboard: string;
  versionLabel: string;
  versionLabelApproved: string;
  toastGenerateSuccess: string;
  toastSaveSuccess: string;
  toastApproveSuccess: string;
  approvedLockedHint: string;
  approvalCaption: string;
  viewScripts: string;
  status: {
    draft: string;
    approved: string;
  };
  sections: {
    pillars: string;
    themes: string;
    slots: string;
  };
  slot: {
    tema: string;
    formato: string;
    modalidad: string;
    tactica: string;
    goal: string;
    day: string;
    slotNumber: string;
    angle: string;
    ctaHint: string;
  };
  themes: {
    add: string;
    remove: string;
  };
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
    agentOutputInvalid: string;
    providerUnavailable: string;
    notMonday: string;
    notDraft: string;
    invalidTransition: string;
    locked: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
  insights: {
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
};

/** Mirrors `messages.campana` (strategy-hub Campaña layout). */
export type StrategyCampanaCopy = {
  weeksAriaLabel: string;
  reelsHeading: string;
  viewCalendar: string;
  scriptsHeading: string;
  scriptsTotal: string;
  strategyHeading: string;
  newReel: string;
  newReelHint: string;
  rendering: string;
  status: {
    published: string;
    scheduled: string;
    review: string;
    rendering: string;
    draft: string;
    approved: string;
    inProgress: string;
    ready: string;
    planned: string;
  };
  weekLabel: string;
  weekMeta: string;
  slotsCount: string;
  slotsProgress: string;
  openScript: string;
  createVideo: string;
  editScript: string;
  insightsHeading: string;
  editBrief: string;
};

type StrategyPageViewProps = {
  weekStart: string;
  sessionClientId: string;
  selectedClientId: string;
  clients: OperatorClientOption[];
  initialInsights: StrategyPerformanceInsightsDto | null;
  strategy: ContentStrategyView | null;
  playbookLabels?: Record<string, string>;
  loadFailed: boolean;
  locale: string;
  copy: StrategyPageCopy;
  /** Operator calendar slots for `weekStart` (all clients); filtered by selected client. */
  calendarSlots?: CalendarSlotDetailDto[];
  /** Session-client reel scripts for `weekStart`. */
  scriptItems?: ReelScriptListItem[];
  campanaCopy?: StrategyCampanaCopy;
};

function shiftWeek(weekStart: string, deltaDays: number): string {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/** ISO-8601 week number for a Monday `weekStart`. */
function isoWeekNumber(weekStart: string): number {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

function formatShortRange(weekStart: string, locale: string): string {
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch {
    return weekStart;
  }
}

function formatSlotDay(isoDate: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${isoDate}T12:00:00.000Z`));
  } catch {
    return isoDate;
  }
}

function formatApprovalDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function messageForCode(
  code: ContentStrategyErrorCode,
  messageKey: string | undefined,
  copy: StrategyPageCopy,
): string {
  if (messageKey === "strategy.errors.notMonday") {
    return copy.errors.notMonday;
  }
  if (messageKey === "strategy.errors.notDraft") {
    return copy.errors.notDraft;
  }
  if (messageKey === "strategy.errors.invalidTransition") {
    return copy.errors.invalidTransition;
  }
  if (messageKey === "strategy.errors.locked") {
    return copy.errors.locked;
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
    case "AGENT_OUTPUT_INVALID":
      return copy.errors.agentOutputInvalid;
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "STRATEGY_NOT_DRAFT":
      return copy.errors.notDraft;
    case "INVALID_STATE_TRANSITION":
      return copy.errors.invalidTransition;
    case "STRATEGY_LOCKED":
      return copy.errors.locked;
    case "UNAUTHENTICATED":
      return copy.errors.unauthenticated;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.errors.internal;
  }
}

export function StrategyPageView({
  weekStart,
  sessionClientId,
  selectedClientId: initialSelectedClientId,
  clients,
  initialInsights,
  strategy,
  playbookLabels,
  loadFailed,
  locale,
  copy,
  calendarSlots,
  scriptItems,
  campanaCopy,
}: StrategyPageViewProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [editedBrief, setEditedBrief] = useState<ContentStrategyBrief | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(initialSelectedClientId);
  const clientSelectorEnabled = clients.length > 0;

  useEffect(() => {
    setSelectedClientId(initialSelectedClientId);
  }, [initialSelectedClientId]);

  useEffect(() => {
    if (strategy) {
      setEditedBrief(cloneBrief(strategy.brief));
    } else {
      setEditedBrief(null);
    }
  }, [strategy]);

  const clientOptions = useMemo(() => {
    if (clients.length > 0) {
      return clients.map((client) => ({
        label: `${client.displayName} (${client.email})`,
        value: client.id,
      }));
    }
    return [
      {
        label: sessionClientId,
        value: sessionClientId,
      },
    ];
  }, [clients, sessionClientId]);

  const weekRangeLabel = formatWeekRange(weekStart, locale);
  const generateLabel = strategy ? copy.regenerate : copy.generate;
  const isBusy = pending || saving || approving;

  const versionLabel = strategy
    ? strategy.status === "approved"
      ? copy.versionLabelApproved.replace("{version}", String(strategy.version))
      : strategy.version > 1
        ? copy.versionLabel.replace("{version}", String(strategy.version))
        : null
    : null;

  const isDirty =
    strategy !== null &&
    editedBrief !== null &&
    !briefsEqual(strategy.brief, editedBrief);

  const hasValidThemes =
    editedBrief !== null && hasValidEditableThemes(editedBrief);

  const canEdit = strategy?.isEditable === true && strategy.status === "draft";
  const displayBrief = editedBrief ?? strategy?.brief ?? null;

  const approvalCaption =
    strategy?.status === "approved" &&
    strategy.approvedBy &&
    strategy.approvedAt
      ? copy.approvalCaption
          .replace("{name}", strategy.approvedBy.displayName)
          .replace("{date}", formatApprovalDate(strategy.approvedAt, locale))
      : null;

  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const clientName = selectedClient?.displayName ?? null;
  const canLinkScripts = selectedClientId === sessionClientId;
  const scriptsHref = `/operator/scripts?weekStart=${weekStart}`;
  const calendarHref = `/operator/calendar?weekStart=${weekStart}`;

  const clientSlots = useMemo(
    () =>
      (calendarSlots ?? [])
        .filter((slot) => slot.clientId === selectedClientId)
        .sort(
          (a, b) =>
            a.scheduledDate.localeCompare(b.scheduledDate) ||
            a.slotIndex - b.slotIndex,
        ),
    [calendarSlots, selectedClientId],
  );

  // Reel scripts are loaded for the session client only.
  const clientScripts = useMemo(
    () => (canLinkScripts ? (scriptItems ?? []) : []),
    [canLinkScripts, scriptItems],
  );

  const reelCards = useMemo<CampanaReelCardModel[]>(() => {
    if (!campanaCopy) {
      return [];
    }

    if (clientSlots.length > 0) {
      return clientSlots.map((slot) => {
        const badge = mapPipelineStatusToReelBadge(slot.pipelineStatus);
        return {
          id: slot.slotId,
          title: slot.tema,
          subtitle: formatSlotDay(slot.scheduledDate, locale),
          badge,
          badgeLabel: campanaCopy.status[badge],
          thumbnailUrl: slot.thumbnailPreviewUrl,
          href:
            canLinkScripts && slot.reelScriptId
              ? `${scriptsHref}&highlightSlot=${slot.slotIndex}`
              : calendarHref,
        };
      });
    }

    if (!strategy) {
      return [];
    }

    return [...strategy.brief.slots]
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((slot) => ({
        id: `brief-slot-${slot.slotIndex}`,
        title: slot.tema,
        subtitle: slot.dayOfWeek
          ? copy.days[slot.dayOfWeek]
          : `${copy.slot.slotNumber} ${slot.slotIndex + 1}`,
        badge: "planned" as const,
        badgeLabel: campanaCopy.status.planned,
      }));
  }, [
    calendarHref,
    campanaCopy,
    canLinkScripts,
    clientSlots,
    copy.days,
    copy.slot.slotNumber,
    locale,
    scriptsHref,
    strategy,
  ]);

  const publishedCount = clientSlots.filter(
    (slot) => slot.pipelineStatus === "published",
  ).length;

  const currentWeekStatus = ((): CampanaWeekStatus => {
    if (clientSlots.length > 0) {
      if (publishedCount === clientSlots.length) {
        return "published";
      }
      if (
        clientSlots.some((slot) =>
          ["generating", "qa", "pending"].includes(slot.pipelineStatus),
        )
      ) {
        return "inProgress";
      }
    }
    if (
      clientScripts.length > 0 &&
      clientScripts.every((item) => item.status === "generated")
    ) {
      return "ready";
    }
    if (strategy?.status === "approved") {
      return "approved";
    }
    if (strategy?.status === "draft") {
      return "draft";
    }
    return "planned";
  })();

  const weekCells = useMemo<CampanaWeekCell[]>(() => {
    if (!campanaCopy) {
      return [];
    }
    return [-7, 0, 7, 14].map((delta) => {
      const cellWeekStart = shiftWeek(weekStart, delta);
      const status: CampanaWeekStatus =
        delta === 0 ? currentWeekStatus : "planned";
      return {
        weekStart: cellWeekStart,
        title: campanaCopy.weekLabel.replace(
          "{n}",
          String(isoWeekNumber(cellWeekStart)),
        ),
        subtitle: `${formatShortRange(cellWeekStart, locale)} · ${campanaCopy.status[status]}`,
        status,
        selected: delta === 0,
      };
    });
  }, [campanaCopy, currentWeekStatus, locale, weekStart]);

  const scriptPanelItems = useMemo<CampanaScriptItem[]>(() => {
    if (!campanaCopy) {
      return [];
    }
    return clientScripts.map((item) => {
      const generated = item.status === "generated";
      const dayLabel = item.dayOfWeek
        ? copy.days[item.dayOfWeek as ContentStrategyDayOfWeek]
        : undefined;
      return {
        id: item.scriptId ?? `slot-${item.slotIndex}`,
        meta: [
          `${copy.slot.slotNumber} ${item.slotIndex + 1}`,
          dayLabel,
        ]
          .filter(Boolean)
          .join(" · "),
        statusLabel: generated
          ? campanaCopy.status.ready
          : campanaCopy.status.planned,
        statusTone: generated ? ("butter" as const) : ("dim" as const),
        hook: item.package?.hook ?? item.tema,
        href: `${scriptsHref}&highlightSlot=${item.slotIndex}`,
        primaryActionLabel: generated ? campanaCopy.openScript : undefined,
        secondaryActionLabel: generated ? campanaCopy.editScript : undefined,
      };
    });
  }, [campanaCopy, clientScripts, copy.days, copy.slot.slotNumber, scriptsHref]);

  function navigateWeek(nextWeekStart: string) {
    const params = new URLSearchParams();
    params.set("weekStart", nextWeekStart);
    if (clientSelectorEnabled && selectedClientId) {
      params.set("clientId", selectedClientId);
    }
    router.push(`/operator/strategy?${params.toString()}`);
    router.refresh();
  }

  function handleClientChange(nextClientId: string) {
    if (isBusy || !clientSelectorEnabled) {
      return;
    }

    setSelectedClientId(nextClientId);

    const params = new URLSearchParams();
    params.set("weekStart", weekStart);
    params.set("clientId", nextClientId);
    router.replace(`/operator/strategy?${params.toString()}`);
  }

  async function handleGenerate() {
    if (isBusy) {
      return;
    }

    setPending(true);
    setBanner(null);

    try {
      const result = await generateContentStrategy({
        weekStart,
        clientId: selectedClientId,
      });

      if (result.ok) {
        toast.success(copy.toastGenerateSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(
        messageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(false);
    }
  }

  async function handleSave() {
    if (!strategy || !editedBrief || !canEdit || !isDirty || saving) {
      return;
    }

    setSaving(true);
    setBanner(null);

    try {
      const result = await updateContentStrategyBrief({
        strategyId: strategy.id,
        weekStart,
        editable: buildEditablePatch(editedBrief),
      });

      if (result.ok) {
        toast.success(copy.toastSaveSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(
        messageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!strategy || !canEdit || isDirty || approving) {
      return;
    }

    setApproving(true);
    setBanner(null);

    try {
      const result = await approveContentStrategy({
        strategyId: strategy.id,
        weekStart,
      });

      if (result.ok) {
        toast.success(copy.toastApproveSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(
        messageForCode(result.error.code, result.error.messageKey, copy),
      );
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setApproving(false);
    }
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title={copy.title} subtitle={copy.subtitle} />
        <StatusAlert severity="error" text={copy.loadError} />
        <Button
          type="button"
          variant="ghost"
          className="text-butter hover:text-butter"
          onClick={() => router.push("/dashboard")}
        >
          {copy.backDashboard}
        </Button>
      </div>
    );
  }

  const strategyThemes = strategy
    ? strategy.brief.themes.slice(0, 2).join(" · ")
    : "";
  const headerTitle = strategyThemes.length > 0 ? strategyThemes : copy.title;
  const eyebrow = campanaCopy
    ? campanaCopy.weekMeta
        .replace("{client}", clientName ?? "")
        .replace("{range}", weekRangeLabel)
    : clientName
      ? `${clientName} · ${weekRangeLabel}`
      : weekRangeLabel;
  const showNewReel =
    campanaCopy !== undefined &&
    canLinkScripts &&
    strategy?.status === "approved";

  const mainColumn = (
    <div className="space-y-8 p-6 lg:p-8">
      <header>
        <p className="text-sm font-semibold text-butter">{eyebrow}</p>
        <h1 className="mt-2 line-clamp-3 font-display text-4xl leading-tight text-fog sm:text-5xl">
          {headerTitle}
        </h1>
        <p className="mt-2 max-w-3xl text-dim">{copy.subtitle}</p>
      </header>

      {campanaCopy ? (
        <WeeksStrip
          weeks={weekCells}
          copy={{ ariaLabel: campanaCopy.weeksAriaLabel }}
          onSelectWeek={(nextWeekStart) => {
            if (!isBusy && nextWeekStart !== weekStart) {
              navigateWeek(nextWeekStart);
            }
          }}
          disabled={isBusy}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        <div className="space-y-2">
          <Label htmlFor="strategy-client-select" className="text-fog">
            {copy.clientLabel}
          </Label>
          <Select
            value={selectedClientId}
            disabled={!clientSelectorEnabled || isBusy}
            onValueChange={handleClientChange}
          >
            <SelectTrigger
              id="strategy-client-select"
              className="w-full border-edge bg-panel text-fog"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clientOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!clientSelectorEnabled ? (
            <p className="text-sm text-dim">{copy.clientSessionHint}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="strategy-week-picker" className="text-fog">
            {copy.weekLabel}
          </Label>
          <WeekPicker
            id="strategy-week-picker"
            weekStart={weekStart}
            locale={locale}
            disabled={isBusy}
            onSelectWeek={(nextWeekStart) => {
              if (!isBusy) {
                navigateWeek(nextWeekStart);
              }
            }}
          />
          <p className="text-sm text-dim">{weekRangeLabel}</p>
        </div>
      </div>

      {campanaCopy && (reelCards.length > 0 || showNewReel) ? (
        <section aria-labelledby="strategy-reels-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="strategy-reels-heading"
                className="font-display text-3xl text-fog"
              >
                {campanaCopy.reelsHeading}
              </h2>
              <p className="mt-1 text-sm text-dim">
                {campanaCopy.slotsCount.replace(
                  "{count}",
                  String(reelCards.length),
                )}
                {clientSlots.length > 0
                  ? ` · ${campanaCopy.slotsProgress
                      .replace("{done}", String(publishedCount))
                      .replace("{total}", String(clientSlots.length))}`
                  : ""}
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="rounded-full border-edge bg-transparent text-fog hover:bg-panel hover:text-fog"
            >
              <Link href={calendarHref}>{campanaCopy.viewCalendar}</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {reelCards.map((reel) => (
              <ReelCard
                key={reel.id}
                reel={reel}
                onSelect={() => {
                  document
                    .getElementById("strategy-brief")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            ))}
            {showNewReel ? (
              <NewReelCard
                copy={{
                  newReel: campanaCopy.newReel,
                  newReelHint: campanaCopy.newReelHint,
                  rendering: campanaCopy.rendering,
                }}
                href={scriptsHref}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <StrategyInsightsPanel
        initialInsights={initialInsights}
        clientId={selectedClientId}
        weekStart={weekStart}
        locale={locale}
        copy={copy.insights}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {strategy ? (
            <StatusBadge
              severity={strategy.status === "approved" ? "success" : "warning"}
              value={
                strategy.status === "approved"
                  ? copy.status.approved
                  : copy.status.draft
              }
            />
          ) : null}
          {versionLabel ? (
            <Badge
              variant="outline"
              className={cn("border-info/40 bg-info/15 text-info")}
            >
              {versionLabel}
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          className="rounded-full"
          disabled={isBusy}
          onClick={() => void handleGenerate()}
        >
          {pending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Sparkles aria-hidden />
          )}
          {generateLabel}
        </Button>
      </div>

      {approvalCaption ? (
        <p className="text-sm text-dim">{approvalCaption}</p>
      ) : null}

      {strategy?.status === "approved" ? (
        <div className="space-y-3">
          <StatusAlert severity="info" text={copy.approvedLockedHint} />
          <Button asChild className="rounded-full">
            <Link href={scriptsHref}>
              <FileText aria-hidden />
              {copy.viewScripts}
            </Link>
          </Button>
        </div>
      ) : null}

      {strategy && canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="rounded-full"
            disabled={!isDirty || !hasValidThemes || isBusy}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            {saving ? copy.saving : copy.save}
          </Button>
          <Button
            type="button"
            className="rounded-full bg-success text-deep hover:bg-success/90"
            disabled={isDirty || isBusy}
            onClick={() => void handleApprove()}
          >
            {approving ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            {approving ? copy.approving : copy.approve}
          </Button>
        </div>
      ) : null}

      {banner ? <StatusAlert severity="error" text={banner} /> : null}

      <section id="strategy-brief" className="scroll-mt-20">
        {campanaCopy && canEdit ? (
          <h2 className="mb-4 font-display text-3xl text-fog">
            {campanaCopy.editBrief}
          </h2>
        ) : null}
        {pending ? (
          <GeneratingSkeleton text={copy.generating} />
        ) : strategy && displayBrief ? (
          <StrategyBriefView
            brief={displayBrief}
            playbookLabels={playbookLabels}
            isEditable={canEdit}
            onBriefChange={canEdit ? setEditedBrief : undefined}
            copy={{
              sections: copy.sections,
              slot: copy.slot,
              themes: copy.themes,
              goals: copy.goals,
              days: copy.days,
              modalities: copy.modalities,
            }}
          />
        ) : (
          <StatusAlert severity="info" text={copy.empty} />
        )}
      </section>
    </div>
  );

  if (!campanaCopy) {
    return <div className="mx-auto max-w-5xl">{mainColumn}</div>;
  }

  return (
    <div className="-mx-4 -my-6 grid min-h-[calc(100vh-4rem)] sm:-mx-6 lg:-mx-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">{mainColumn}</div>
      <div className="border-t border-edge lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:border-t-0">
        <ScriptsSidePanel
          copy={{
            heading: campanaCopy.scriptsHeading,
            totalLabel: campanaCopy.scriptsTotal,
            strategyHeading: campanaCopy.strategyHeading,
          }}
          totalCount={scriptPanelItems.length}
          items={scriptPanelItems}
          strategyBody={strategy ? strategy.brief.pillars.join(" · ") : null}
        />
      </div>
    </div>
  );
}

function GeneratingSkeleton({ text }: { text: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <StatusAlert severity="info" text={text} />
      <Skeleton className="h-8 w-full bg-panel" />
      <Skeleton className="h-24 w-full bg-panel" />
      <Skeleton className="h-32 w-full bg-panel" />
      <Skeleton className="h-32 w-full bg-panel" />
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="font-display text-4xl text-fog sm:text-5xl">{title}</h1>
      <p className="mt-2 text-dim">{subtitle}</p>
    </div>
  );
}
