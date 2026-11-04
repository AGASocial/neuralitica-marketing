"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  StatusBadge,
  type StatusBadgeSeverity,
} from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { WeeklyCycleRunMode, WeeklyCycleStepKey } from "@/lib/contracts/weekly-cycle";
import type { OperatorClientOption } from "@/lib/content-strategy/load-operator-clients-for-strategy";
// `OperatorWeeklyCycleRunDto` is the loader's own return-type declaration
// (structurally identical to `operatorWeeklyCycleRunDtoSchema` in
// `lib/contracts/weekly-cycle-live.ts` — see that loader file's header comment).
// Sourced here directly so this component always matches what the loader
// actually returns.
import type { OperatorWeeklyCycleRunDto } from "@/lib/orchestration/load-operator-weekly-cycle-runs";
// Manual trigger/preview/resume Server Actions — owned by the
// integrations-engineer agent building in parallel on this branch
// (CONTRACT.md "Manual trigger and loader"). `triggerWeeklyCycleForClient`'s
// exact result type is frozen in `lib/contracts/weekly-cycle-live.ts`
// (`TriggerWeeklyCycleResult`); `previewWeeklyCycleForClient` is documented as
// sharing its auth/input contract. Both are Server Action wrappers around the
// (already-landed) internal `resumeWeeklyCycleRun` implementation in
// `lib/orchestration/resume-weekly-cycle-run.ts` — see that file's header
// comment: "The `actions/resume-weekly-cycle-run.ts` Server Action is the
// only public entrypoint into this function."
import { previewWeeklyCycleForClient } from "@/lib/orchestration/actions/preview-weekly-cycle-for-client";
import { resumeWeeklyCycleRun } from "@/lib/orchestration/actions/resume-weekly-cycle-run";
import { triggerWeeklyCycleForClient } from "@/lib/orchestration/actions/trigger-weekly-cycle-for-client";
import { formatWeekRange } from "@/lib/trend/normalize-week-start";
import { cn } from "@/lib/utils";

export type OperatorCycleClientOption = OperatorClientOption;

/** Slot-level error code — derived from the DTO so it always matches the loader's shape. */
type WeeklyCycleErrorCode = NonNullable<
  OperatorWeeklyCycleRunDto["slots"][number]["errorCode"]
>;

type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "LIVE_DISABLED"
  | "CLIENT_INACTIVE"
  | "RUN_NOT_REPLANNABLE"
  | "RUN_NOT_RESUMABLE"
  | "INTERNAL_ERROR";

export type OperatorCycleCopy = {
  title: string;
  subtitle: string;
  backDashboard: string;
  clientLabel: string;
  clientPlaceholder: string;
  weekLabel: string;
  dryRunCta: string;
  dryRunPending: string;
  runCta: string;
  runPending: string;
  resumeCta: string;
  resumePending: string;
  emptyClients: string;
  emptyRuns: string;
  loadError: string;
  selectClientFirst: string;
  toastDryRunSuccess: string;
  toastRunStarted: string;
  toastAlreadyRunning: string;
  toastAlreadyCompleted: string;
  toastResumeSuccess: string;
  columns: {
    client: string;
    week: string;
    mode: string;
    status: string;
    slots: string;
    started: string;
    finished: string;
    actions: string;
  };
  mode: Record<WeeklyCycleRunMode, string>;
  status: Record<OperatorWeeklyCycleRunDto["status"], string>;
  slotStatus: Record<OperatorWeeklyCycleRunDto["slots"][number]["status"], string>;
  steps: Record<WeeklyCycleStepKey, string>;
  slotLabel: string;
  notStarted: string;
  weekOptionCurrent: string;
  weekOptionNext: string;
  weekOptionNextTwo: string;
  errors: Record<
    | "liveDisabled"
    | "clientInactive"
    | "tenantScopeMismatch"
    | "budgetExceeded"
    | "consentRequired"
    | "consentRevoked"
    | "policyRejected"
    | "providerUnavailable"
    | "validation"
    | "strategyInvalid"
    | "strategyStale"
    | "strategyApprovalConflict"
    | "dispatchTransient"
    | "providerTransient"
    | "workerTransient"
    | "jobTimeout"
    | "dependencyFailed"
    | "qaFailed"
    | "internal"
    | "unauthenticated"
    | "forbidden"
    | "notFound"
    | "runNotReplannable"
    | "runNotResumable",
    string
  >;
};

type OperatorCycleViewProps = {
  clients: OperatorCycleClientOption[];
  runs: OperatorWeeklyCycleRunDto[];
  loadFailed: boolean;
  locale: string;
  currentWeekStart: string;
  copy: OperatorCycleCopy;
};

type PendingAction =
  | { kind: "dryRun" }
  | { kind: "run" }
  | { kind: "resume"; runId: string }
  | null;

function shiftWeek(weekStart: string, deltaDays: number): string {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function statusSeverity(
  status: OperatorWeeklyCycleRunDto["status"],
): NonNullable<StatusBadgeSeverity> {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "paused":
    case "partial_failed":
      return "warning";
    case "failed":
      return "danger";
    case "dry_run":
    default:
      return "secondary";
  }
}

function slotSeverity(
  status: OperatorWeeklyCycleRunDto["slots"][number]["status"],
): NonNullable<StatusBadgeSeverity> {
  switch (status) {
    case "ready_for_approval":
      return "success";
    case "processing":
      return "info";
    case "failed":
      return "danger";
    case "pending":
    default:
      return "secondary";
  }
}

function PageHeader({ copy }: { copy: OperatorCycleCopy }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl text-fog sm:text-5xl">{copy.title}</h1>
      <p className="mt-2 max-w-3xl text-dim">{copy.subtitle}</p>
    </div>
  );
}

export function OperatorCycleView({
  clients,
  runs,
  loadFailed,
  locale,
  currentWeekStart,
  copy,
}: OperatorCycleViewProps) {
  const router = useRouter();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    clients[0]?.id ?? null,
  );
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentWeekStart);
  const [pending, setPending] = useState<PendingAction>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const weekOptions = useMemo(
    () => [
      {
        label: copy.weekOptionCurrent.replace(
          "{range}",
          formatWeekRange(currentWeekStart, locale),
        ),
        value: currentWeekStart,
      },
      {
        label: copy.weekOptionNext.replace(
          "{range}",
          formatWeekRange(shiftWeek(currentWeekStart, 7), locale),
        ),
        value: shiftWeek(currentWeekStart, 7),
      },
      {
        label: copy.weekOptionNextTwo.replace(
          "{range}",
          formatWeekRange(shiftWeek(currentWeekStart, 14), locale),
        ),
        value: shiftWeek(currentWeekStart, 14),
      },
    ],
    [copy, currentWeekStart, locale],
  );

  const clientDropdownOptions = clients.map((client) => ({
    label: client.displayName,
    value: client.id,
  }));

  function messageForActionError(code: ActionErrorCode): string {
    switch (code) {
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      case "NOT_FOUND":
        return copy.errors.notFound;
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "LIVE_DISABLED":
        return copy.errors.liveDisabled;
      case "CLIENT_INACTIVE":
        return copy.errors.clientInactive;
      case "RUN_NOT_REPLANNABLE":
        return copy.errors.runNotReplannable;
      case "RUN_NOT_RESUMABLE":
        return copy.errors.runNotResumable;
      case "INTERNAL_ERROR":
      default:
        return copy.errors.internal;
    }
  }

  function messageForSlotError(code: WeeklyCycleErrorCode | undefined): string | null {
    if (!code) {
      return null;
    }
    switch (code) {
      case "LIVE_DISABLED":
        return copy.errors.liveDisabled;
      case "CLIENT_INACTIVE":
        return copy.errors.clientInactive;
      case "TENANT_SCOPE_MISMATCH":
        return copy.errors.tenantScopeMismatch;
      case "BUDGET_EXCEEDED":
        return copy.errors.budgetExceeded;
      case "CONSENT_REQUIRED":
        return copy.errors.consentRequired;
      case "CONSENT_REVOKED":
        return copy.errors.consentRevoked;
      case "POLICY_REJECTED":
        return copy.errors.policyRejected;
      case "PROVIDER_UNAVAILABLE":
        return copy.errors.providerUnavailable;
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "STRATEGY_INVALID":
        return copy.errors.strategyInvalid;
      case "STRATEGY_STALE":
        return copy.errors.strategyStale;
      case "STRATEGY_APPROVAL_CONFLICT":
        return copy.errors.strategyApprovalConflict;
      case "DISPATCH_TRANSIENT":
        return copy.errors.dispatchTransient;
      case "PROVIDER_TRANSIENT":
        return copy.errors.providerTransient;
      case "WORKER_TRANSIENT":
        return copy.errors.workerTransient;
      case "JOB_TIMEOUT":
        return copy.errors.jobTimeout;
      case "DEPENDENCY_FAILED":
        return copy.errors.dependencyFailed;
      case "QA_FAILED":
        return copy.errors.qaFailed;
      case "INTERNAL_ERROR":
      default:
        return copy.errors.internal;
    }
  }

  async function handleDryRun() {
    if (pending || !selectedClientId) {
      if (!selectedClientId) {
        setBanner(copy.selectClientFirst);
      }
      return;
    }

    setPending({ kind: "dryRun" });
    setBanner(null);

    try {
      const result = await previewWeeklyCycleForClient({
        clientId: selectedClientId,
        weekStart: selectedWeekStart,
      });

      if (result.ok) {
        toast.success(copy.toastDryRunSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForActionError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(null);
    }
  }

  async function handleRunCycle() {
    if (pending || !selectedClientId) {
      if (!selectedClientId) {
        setBanner(copy.selectClientFirst);
      }
      return;
    }

    setPending({ kind: "run" });
    setBanner(null);

    try {
      const result = await triggerWeeklyCycleForClient({
        clientId: selectedClientId,
        weekStart: selectedWeekStart,
      });

      if (result.ok) {
        const summary =
          result.outcome === "ALREADY_RUNNING"
            ? copy.toastAlreadyRunning
            : result.outcome === "ALREADY_COMPLETED"
              ? copy.toastAlreadyCompleted
              : copy.toastRunStarted;
        if (result.outcome === "STARTED") {
          toast.success(summary, { duration: 4000 });
        } else {
          toast.info(summary, { duration: 4000 });
        }
        router.refresh();
        return;
      }

      setBanner(messageForActionError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(null);
    }
  }

  async function handleResume(runId: string) {
    if (pending) {
      return;
    }

    setPending({ kind: "resume", runId });
    setBanner(null);

    try {
      const result = await resumeWeeklyCycleRun({ runId });

      if (result.ok) {
        toast.success(copy.toastResumeSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForActionError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setPending(null);
    }
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader copy={copy} />
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

  const dryRunPending = pending?.kind === "dryRun";
  const runPending = pending?.kind === "run";
  const anyPending = pending !== null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader copy={copy} />

      {banner ? <StatusAlert severity="error" className="mb-4" text={banner} /> : null}

      {clients.length === 0 ? (
        <StatusAlert severity="info" className="mb-6" text={copy.emptyClients} />
      ) : (
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cycle-client-select" className="text-fog">
              {copy.clientLabel}
            </Label>
            <Select
              value={selectedClientId ?? ""}
              disabled={anyPending}
              onValueChange={(value) => setSelectedClientId(value)}
            >
              <SelectTrigger
                id="cycle-client-select"
                className="min-w-60 border-edge bg-panel text-fog"
              >
                <SelectValue placeholder={copy.clientPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {clientDropdownOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cycle-week-select" className="text-fog">
              {copy.weekLabel}
            </Label>
            <Select
              value={selectedWeekStart}
              disabled={anyPending}
              onValueChange={(value) => setSelectedWeekStart(value)}
            >
              <SelectTrigger
                id="cycle-week-select"
                className="min-w-64 border-edge bg-panel text-fog"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            className="rounded-full border-edge bg-transparent text-fog hover:bg-panel hover:text-fog"
            disabled={anyPending || !selectedClientId}
            onClick={() => void handleDryRun()}
          >
            {dryRunPending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {dryRunPending ? copy.dryRunPending : copy.dryRunCta}
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={anyPending || !selectedClientId}
            onClick={() => void handleRunCycle()}
          >
            {runPending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {runPending ? copy.runPending : copy.runCta}
          </Button>
        </div>
      )}

      {runs.length === 0 ? (
        <StatusAlert severity="info" text={copy.emptyRuns} />
      ) : (
        <div
          className={cn(
            "rounded-xl border border-edge bg-panel/60 p-2 transition-opacity",
            anyPending && "opacity-70",
          )}
          aria-busy={anyPending}
        >
          <Table>
            <TableHeader>
              <TableRow className="border-edge hover:bg-transparent">
                <TableHead className="text-dim">{copy.columns.client}</TableHead>
                <TableHead className="text-dim">{copy.columns.week}</TableHead>
                <TableHead className="text-dim">{copy.columns.mode}</TableHead>
                <TableHead className="text-dim">{copy.columns.status}</TableHead>
                <TableHead className="text-dim">{copy.columns.slots}</TableHead>
                <TableHead className="text-dim">{copy.columns.started}</TableHead>
                <TableHead className="text-dim">{copy.columns.finished}</TableHead>
                <TableHead className="text-dim">{copy.columns.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((row) => {
                const resumeLoading =
                  pending?.kind === "resume" && pending.runId === row.runId;
                return (
                  <TableRow
                    key={row.runId}
                    className="border-edge even:bg-deep/40 hover:bg-deep/70"
                  >
                    <TableCell className="font-medium text-fog">
                      {row.clientDisplayName}
                    </TableCell>
                    <TableCell>{formatWeekRange(row.weekStart, locale)}</TableCell>
                    <TableCell>
                      <StatusBadge severity="secondary" value={copy.mode[row.mode]} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        severity={statusSeverity(row.status)}
                        value={copy.status[row.status]}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        {row.slots.map((slot) => {
                          const stepLabel = slot.currentStep
                            ? copy.steps[slot.currentStep]
                            : null;
                          const errorLabel = messageForSlotError(slot.errorCode);
                          const title = [
                            copy.slotLabel.replace(
                              "{index}",
                              String(slot.slotIndex + 1),
                            ),
                            stepLabel,
                            errorLabel,
                          ]
                            .filter(Boolean)
                            .join(" — ");
                          return (
                            <StatusBadge
                              key={slot.slotIndex}
                              value={String(slot.slotIndex + 1)}
                              severity={slotSeverity(slot.status)}
                              title={title}
                            />
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.startedAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(row.startedAt))
                        : copy.notStarted}
                    </TableCell>
                    <TableCell>
                      {row.finishedAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(row.finishedAt))
                        : copy.notStarted}
                    </TableCell>
                    <TableCell>
                      {row.canResume ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-edge bg-transparent text-fog hover:bg-panel hover:text-fog"
                          disabled={anyPending}
                          onClick={() => void handleResume(row.runId)}
                        >
                          {resumeLoading ? (
                            <Loader2
                              className="animate-spin motion-reduce:animate-none"
                              aria-hidden
                            />
                          ) : null}
                          {resumeLoading ? copy.resumePending : copy.resumeCta}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
