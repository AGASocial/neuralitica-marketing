"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { RadioButton } from "primereact/radiobutton";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import { TabPanel, TabView } from "primereact/tabview";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";

import {
  ReelBudgetConfirmDialog,
  type ReelBudgetConfirmCopy,
} from "@/components/cost-policy/ReelBudgetConfirmDialog";
import type {
  ReelBudgetBatchPreview,
  ReelBudgetPreview,
} from "@/lib/contracts/cost-policy";
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
import type {
  GetReelScriptsForWeekSuccess,
  ReelScriptErrorCode,
  ReelScriptListItem,
} from "@/lib/contracts/reel-script";
import { getReelBudgetPreview } from "@/lib/cost-policy/actions/get-reel-budget-preview";
import { generateReelCaptions } from "@/lib/reel-captions/actions/generate-reel-captions";
import { regenerateReelCaption } from "@/lib/reel-captions/actions/regenerate-reel-caption";
import { selectReelCaptionCta } from "@/lib/reel-captions/actions/select-reel-caption-cta";
import type {
  ReelScriptReadability,
  ReelScriptReadabilityBeatLine,
  ReelScriptReadabilityVoiceover,
} from "@/lib/contracts/reel-script-readability";
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
  data: GetReelScriptsForWeekSuccess;
  loadFailed: boolean;
  locale: string;
  copy: ScriptsPageCopy;
};

function weekStartToDate(weekStart: string): Date {
  return new Date(`${weekStart}T12:00:00.000Z`);
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
  data,
  loadFailed,
  locale,
  copy,
}: ScriptsPageViewProps) {
  const router = useRouter();
  const toastRef = useRef<Toast>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [captionBatchPending, setCaptionBatchPending] = useState(false);
  const [regeneratingSlot, setRegeneratingSlot] = useState<number | null>(null);
  const [captionRegeneratingSlot, setCaptionRegeneratingSlot] = useState<number | null>(
    null,
  );
  const [captionSelectingSlot, setCaptionSelectingSlot] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<ReelScriptListItem[]>([]);
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

  const weekDate = weekStartToDate(weekStart);
  const weekRangeLabel = formatWeekRange(weekStart, locale);
  const isBusy =
    batchPending ||
    captionBatchPending ||
    regeneratingSlot !== null ||
    captionRegeneratingSlot !== null ||
    captionSelectingSlot !== null ||
    budgetPreviewLoading ||
    budgetConfirmPending;
  const hasApprovedStrategy = data.approvedStrategy !== null;
  const hasAnyGenerated = data.items.some((item) => item.status === "generated");
  const hasAnyCaptionGenerated = data.items.some(
    (item) => item.caption.status === "generated",
  );
  const allPending =
    hasApprovedStrategy && data.items.length > 0 && !hasAnyGenerated;
  const allCaptionsPending =
    hasApprovedStrategy && hasAnyGenerated && !hasAnyCaptionGenerated;

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
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastGenerateSuccess,
          life: 4000,
        });
        router.refresh();
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastRegenerateSuccess,
          life: 4000,
        });
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.caption.toastGenerateSuccess,
          life: 4000,
        });
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.caption.toastRegenerateSuccess,
          detail: copy.caption.ctaSelect.clearedOnRegen,
          life: 5000,
        });
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.caption.ctaSelect.selectionSaved,
          life: 4000,
        });
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

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text).then(() => {
      toastRef.current?.show({
        severity: "success",
        summary: copy.toastCopySuccess,
        life: 2500,
      });
    });
  }

  if (loadFailed) {
    return (
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <PageHeader copy={copy} />
        <Message severity="error" text={copy.loadError} style={{ width: "100%" }} />
        <Button
          type="button"
          label={copy.backDashboard}
          className="p-button-text"
          style={{ marginTop: "1rem" }}
          onClick={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  const versionLabel = data.approvedStrategy
    ? copy.versionLabel.replace("{version}", String(data.approvedStrategy.version))
    : null;

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Toast ref={toastRef} />
      <ReelBudgetConfirmDialog
        visible={budgetDialogVisible}
        loading={budgetPreviewLoading}
        loadError={budgetPreviewError}
        preview={budgetPreview}
        isBatch={budgetPreviewIsBatch}
        locale={locale}
        copy={copy.budget}
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

      <div style={{ marginBottom: "1.5rem", maxWidth: "320px" }}>
        <label
          htmlFor="scripts-week-picker"
          style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem" }}
        >
          {copy.weekLabel}
        </label>
        <Calendar
          inputId="scripts-week-picker"
          value={weekDate}
          onChange={(event) => {
            if (!event.value || isBusy) {
              return;
            }
            navigateWeek(normalizeToIsoMonday(event.value));
          }}
          dateFormat="yy-mm-dd"
          showIcon
          disabled={isBusy}
          style={{ width: "100%" }}
        />
        <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
          {weekRangeLabel}
        </p>
      </div>

      {hasApprovedStrategy ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            {versionLabel ? <TagLine text={versionLabel} /> : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <Button
              type="button"
              label={batchPending ? copy.generating : copy.generate}
              icon="pi pi-sparkles"
              loading={batchPending}
              disabled={isBusy}
              onClick={() => void handleGenerate()}
            />
            {hasAnyGenerated ? (
              <Button
                type="button"
                label={captionBatchPending ? copy.caption.generating : copy.caption.generate}
                icon="pi pi-instagram"
                loading={captionBatchPending}
                disabled={isBusy}
                onClick={() => void handleGenerateCaptions()}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {data.strategyVersionChanged ? (
        <Message
          severity="warn"
          text={copy.strategyVersionWarning}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%", marginBottom: "1rem" }} />
      ) : null}

      {batchPending || captionBatchPending ? (
        <GeneratingSkeleton
          copy={copy}
          message={captionBatchPending ? copy.caption.generating : copy.generating}
        />
      ) : !hasApprovedStrategy ? (
        <div>
          <Message severity="info" text={copy.emptyNoStrategy} style={{ width: "100%" }} />
          <Link href={`/operator/strategy?weekStart=${weekStart}`}>
            <Button
              type="button"
              label={copy.emptyNoStrategyCta}
              className="p-button-outlined"
              style={{ marginTop: "1rem" }}
            />
          </Link>
        </div>
      ) : (
        <>
          {allPending ? (
            <Message
              severity="info"
              text={copy.emptyNoScripts}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          {allCaptionsPending ? (
            <Message
              severity="info"
              text={copy.caption.emptyPending}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          ) : null}
          <DataTable
            value={data.items}
            dataKey="slotIndex"
            stripedRows
            expandedRows={expandedRows}
            onRowToggle={(event) => setExpandedRows(event.data as ReelScriptListItem[])}
            rowExpansionTemplate={(row: ReelScriptListItem) => (
              <ReelDetailPanel
                row={row}
                copy={copy}
                onCopy={copyToClipboard}
                onRegenerateCaption={(slotIndex) => void handleRegenerateCaption(slotIndex)}
                onSelectCaptionCta={(slotIndex, selectedCtaIndex) =>
                  void handleSelectCaptionCta(slotIndex, selectedCtaIndex)
                }
                captionRegeneratingSlot={captionRegeneratingSlot}
                captionSelectingSlot={captionSelectingSlot}
                isBusy={isBusy}
              />
            )}
          >
            <Column expander style={{ width: "3rem" }} />
            <Column
              field="tema"
              header={copy.columns.tema}
              body={(row: ReelScriptListItem) => (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{row.tema}</span>
                  {row.readability?.hasWarnings ? (
                    <Tag
                      value={copy.readability.rowBadge}
                      severity="warning"
                      icon="pi pi-exclamation-triangle"
                    />
                  ) : null}
                </div>
              )}
            />
            <Column
              header={copy.columns.day}
              body={(row: ReelScriptListItem) =>
                row.dayOfWeek ? copy.days[row.dayOfWeek as ContentStrategyDayOfWeek] ?? row.dayOfWeek : "—"
              }
            />
            <Column
              header={copy.columns.duration}
              body={(row: ReelScriptListItem) =>
                formatDuration(row.targetDurationSec, copy.durationSeconds)
              }
            />
            <Column
              header={copy.columns.status}
              body={(row: ReelScriptListItem) => (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  <Tag
                    value={
                      row.status === "generated"
                        ? copy.status.generated
                        : copy.status.pending
                    }
                    severity={row.status === "generated" ? "success" : "warning"}
                  />
                  {row.status === "generated" ? (
                    <Tag
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
                    <Tag
                      value={copy.caption.staleBadge}
                      severity="warning"
                      icon="pi pi-exclamation-triangle"
                    />
                  ) : null}
                </div>
              )}
            />
            <Column
              header={copy.columns.actions}
              body={(row: ReelScriptListItem) => (
                <Button
                  type="button"
                  label={
                    regeneratingSlot === row.slotIndex
                      ? copy.regenerating
                      : copy.regenerate
                  }
                  size="small"
                  severity="secondary"
                  loading={regeneratingSlot === row.slotIndex}
                  disabled={isBusy}
                  onClick={() => void handleRegenerate(row.slotIndex)}
                />
              )}
            />
          </DataTable>
        </>
      )}
    </div>
  );
}

type ReelDetailPanelProps = {
  row: ReelScriptListItem;
  copy: ScriptsPageCopy;
  onCopy: (text: string) => void;
  onRegenerateCaption: (slotIndex: number) => void;
  onSelectCaptionCta: (slotIndex: number, selectedCtaIndex: number) => void;
  captionRegeneratingSlot: number | null;
  captionSelectingSlot: number | null;
  isBusy: boolean;
};

function ReelDetailPanel({
  row,
  copy,
  onCopy,
  onRegenerateCaption,
  onSelectCaptionCta,
  captionRegeneratingSlot,
  captionSelectingSlot,
  isBusy,
}: ReelDetailPanelProps) {
  return (
    <TabView>
      <TabPanel header={copy.caption.tabs.script}>
        <ScriptDetailPanel row={row} copy={copy} onCopy={onCopy} />
      </TabPanel>
      <TabPanel header={copy.caption.tabs.caption}>
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
      </TabPanel>
    </TabView>
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
      <p style={{ margin: 0, color: "#6b7280", fontStyle: "italic" }}>
        {copy.status.pending}
      </p>
    );
  }

  const pkg = row.package;

  return (
    <div style={{ display: "grid", gap: "1rem", padding: "0.5rem 0" }}>
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
      <Message severity="info" text={copy.caption.emptyNoScript} style={{ width: "100%" }} />
    );
  }

  const caption = row.caption;
  const record = caption.record;

  if (caption.status !== "generated" || !record) {
    return (
      <div style={{ display: "grid", gap: "1rem" }}>
        <Message severity="info" text={copy.caption.emptyPending} style={{ width: "100%" }} />
        <Button
          type="button"
          label={isRegenerating ? copy.caption.regenerating : copy.caption.regenerate}
          icon="pi pi-refresh"
          severity="secondary"
          loading={isRegenerating}
          disabled={isBusy}
          onClick={onRegenerate}
        />
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
    <div style={{ display: "grid", gap: "1rem" }}>
      {caption.stale ? (
        <Message
          severity="warn"
          icon="pi pi-exclamation-triangle"
          text={copy.caption.staleBadge}
          style={{ width: "100%" }}
        />
      ) : null}

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            marginBottom: "0.35rem",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
            {copy.caption.tabs.caption}
          </span>
          <Button
            type="button"
            icon="pi pi-copy"
            label={copy.caption.copyCaption}
            size="small"
            text
            onClick={() => onCopy(record.caption)}
          />
        </div>
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: "#f9fafb",
            border: charOverLimit ? "1px solid #fcd34d" : "1px solid #e5e7eb",
            fontSize: "0.95rem",
            lineHeight: 1.5,
            color: "#111827",
            whiteSpace: "pre-wrap",
          }}
        >
          {record.caption}
        </div>
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8125rem",
            color: charOverLimit ? "#b45309" : "#6b7280",
            fontWeight: charOverLimit ? 600 : 400,
          }}
        >
          {formatTemplate(copy.caption.charCount, {
            count: record.charCount,
            max: record.maxCaptionChars,
          })}
        </p>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
            {copy.caption.hashtagsLabel}
          </span>
          <Button
            type="button"
            icon="pi pi-copy"
            label={copy.caption.copyHashtags}
            size="small"
            text
            onClick={() => onCopy(hashtagBlock)}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {record.hashtags.map((tag) => (
            <Tag key={tag} value={tag} severity={hashtagWarn ? "warning" : "info"} />
          ))}
        </div>
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8125rem",
            color: hashtagWarn ? "#b45309" : "#6b7280",
            fontWeight: hashtagWarn ? 600 : 400,
          }}
        >
          {formatTemplate(copy.caption.hashtagCount, {
            count: record.hashtagCount,
            max: record.maxHashtagsConfigured,
          })}
        </p>
        {hashtagWarn ? (
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#b45309" }}>
            {formatTemplate(copy.caption.hashtagsOverMax, {
              max: record.maxHashtagsConfigured,
            })}
          </p>
        ) : null}
      </div>

      {record.hasKeywords && record.keywords.length > 0 ? (
        <div>
          <span
            style={{
              display: "block",
              fontWeight: 600,
              fontSize: "0.875rem",
              color: "#374151",
              marginBottom: "0.5rem",
            }}
          >
            {copy.caption.keywordsLabel}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {record.keywords.map((keyword) => (
              <Tag key={keyword} value={keyword} severity="secondary" />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <span
          id={ctaGroupId}
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "#374151",
            marginBottom: "0.5rem",
          }}
        >
          {copy.caption.ctaSelect.selectLabel}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={ctaGroupId}
          style={{ display: "grid", gap: "0.5rem" }}
        >
          {record.ctaVariants.map((variant, index) => {
            const inputId = `cta-${row.slotIndex}-${index}`;
            const isSelected = caption.selectedCtaIndex === index;

            return (
              <label
                key={`${index}-${variant}`}
                htmlFor={inputId}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.65rem",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "0.375rem",
                  border: isSelected ? "1px solid #6366f1" : "1px solid #e5e7eb",
                  background: isSelected ? "#eef2ff" : "#f9fafb",
                  fontSize: "0.9rem",
                  color: "#111827",
                  cursor: isBusy ? "not-allowed" : "pointer",
                }}
              >
                <RadioButton
                  inputId={inputId}
                  name={`cta-${row.slotIndex}`}
                  value={index}
                  checked={isSelected}
                  disabled={isBusy || isSelecting}
                  onChange={() => onSelectCta(index)}
                />
                <span style={{ flex: 1, lineHeight: 1.5 }}>
                  {formatTemplate(copy.caption.ctaVariantLine, {
                    index: index + 1,
                    text: variant,
                  })}
                </span>
              </label>
            );
          })}
        </div>
        {!hasSelectedCta ? (
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.8125rem",
              color: "#6b7280",
            }}
          >
            {copy.caption.ctaSelect.unselectedHint}
          </p>
        ) : null}
      </div>

      <div>
        <span
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "#374151",
            marginBottom: "0.35rem",
          }}
        >
          {copy.caption.ctaSelect.previewHeading}
        </span>
        {effectivePreview ? (
          <>
            <div
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                background: caption.effectiveCaptionOverLimit ? "#fffbeb" : "#f9fafb",
                border: caption.effectiveCaptionOverLimit
                  ? "1px solid #fcd34d"
                  : "1px solid #e5e7eb",
                fontSize: "0.95rem",
                lineHeight: 1.5,
                color: "#111827",
                whiteSpace: "pre-wrap",
              }}
            >
              {effectivePreview}
            </div>
            {caption.effectiveCaptionOverLimit ? (
              <p
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "0.8125rem",
                  color: "#b45309",
                  fontWeight: 600,
                }}
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
            style={{
              margin: 0,
              fontSize: "0.875rem",
              color: "#6b7280",
              fontStyle: "italic",
            }}
          >
            {copy.caption.ctaSelect.unselectedHint}
          </p>
        )}
      </div>

      <Button
        type="button"
        label={isRegenerating ? copy.caption.regenerating : copy.caption.regenerate}
        icon="pi pi-refresh"
        severity="secondary"
        loading={isRegenerating || isSelecting}
        disabled={isBusy}
        onClick={onRegenerate}
      />
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
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {hasTooManyBeats ? (
        <Message
          severity="warn"
          icon="pi pi-exclamation-triangle"
          text={formatTemplate(copy.readability.tooManyBeats, {
            max: copy.readability.maxBeatLinesTotal,
          })}
          style={{ width: "100%" }}
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
      style={{
        padding: "0.5rem 0.75rem",
        borderRadius: "0.375rem",
        border: hasWarning ? "1px solid #fcd34d" : "1px solid #e5e7eb",
        background: hasWarning ? "#fffbeb" : "#f9fafb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "0.875rem",
            color: "#111827",
            whiteSpace: "pre-wrap",
            flex: "1 1 auto",
          }}
        >
          {beat.text}
        </span>
        <span
          style={{
            fontSize: "0.8125rem",
            color: hasWarning ? "#b45309" : "#6b7280",
            fontWeight: hasWarning ? 600 : 400,
            whiteSpace: "nowrap",
          }}
        >
          {beat.charCount}
        </span>
      </div>
      {warningMessages.map((message) => (
        <p
          key={message}
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8125rem",
            color: "#b45309",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          <i className="pi pi-exclamation-triangle" aria-hidden="true" />
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
      <Message
        severity="warn"
        icon="pi pi-exclamation-triangle"
        text={summary}
        style={{ width: "100%" }}
      />
    );
  }

  return (
    <p
      style={{
        margin: 0,
        fontSize: "0.875rem",
        color: "#6b7280",
      }}
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
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
          {label}
        </span>
        <Button
          type="button"
          icon="pi pi-copy"
          label={copyLabel}
          size="small"
          text
          onClick={() => onCopy(value)}
        />
      </div>
      <div
        style={{
          padding: "0.75rem 1rem",
          borderRadius: "0.5rem",
          background: highlighted ? "#fef3c7" : "#f9fafb",
          border: highlighted ? "1px solid #fcd34d" : "1px solid #e5e7eb",
          whiteSpace: preserveWhitespace ? "pre-wrap" : "normal",
          fontSize: "0.95rem",
          lineHeight: 1.5,
          color: "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TagLine({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.35rem 0.75rem",
        borderRadius: "9999px",
        background: "#eef2ff",
        color: "#3730a3",
        fontSize: "0.875rem",
        fontWeight: 600,
      }}
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
      <Message
        severity="info"
        text={message}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <Skeleton height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="2.5rem" style={{ marginBottom: "0.75rem" }} />
      <Skeleton height="2.5rem" />
    </div>
  );
}

function PageHeader({ copy }: { copy: Pick<ScriptsPageCopy, "title" | "subtitle"> }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{copy.title}</h1>
      <p style={{ margin: 0, color: "#4b5563" }}>{copy.subtitle}</p>
    </div>
  );
}
