"use client";

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
import { cn } from "@/lib/utils";

import type {
  ActualCostUnavailableReason,
  ReelCostRollupAssetRole,
  ReelCostRollupDto,
} from "@/lib/contracts/actual-cost";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";

export type ReelCostRollupCopy = {
  title: string;
  estimated: string;
  actual: string;
  variance: string;
  overBudget: string;
  pending: string;
  empty: string;
  phaseNote: string;
  breakdownRole: string;
  breakdownEstimated: string;
  breakdownActual: string;
  component: Record<
    "llm" | "talkingHead" | "broll" | "tts",
    string
  >;
  actualPending: string;
  unavailable: Record<ActualCostUnavailableReason, string>;
};

type ReelCostRollupPanelProps = {
  rollup: ReelCostRollupDto | undefined;
  locale: string;
  copy: ReelCostRollupCopy;
};

const COMPONENT_ROLE_KEYS: Record<
  ReelCostRollupAssetRole,
  keyof ReelCostRollupCopy["component"]
> = {
  llm: "llm",
  talking_head: "talkingHead",
  broll: "broll",
  tts: "tts",
};

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function formatUnavailableReasons(
  reasons: ActualCostUnavailableReason[],
  copy: ReelCostRollupCopy,
): string {
  return reasons.map((reason) => copy.unavailable[reason]).join(", ");
}

function renderComponentActualValue(
  actualCostCents: number | null,
  hasPendingActual: boolean,
  unavailableReasonKeys: ActualCostUnavailableReason[],
  locale: string,
  copy: ReelCostRollupCopy,
): { text: string; subdued: boolean } {
  if (actualCostCents !== null) {
    return {
      text: formatCentsForDisplay(actualCostCents, locale),
      subdued: false,
    };
  }

  if (hasPendingActual) {
    return { text: copy.actualPending, subdued: true };
  }

  if (unavailableReasonKeys.length > 0) {
    return {
      text: formatUnavailableReasons(unavailableReasonKeys, copy),
      subdued: true,
    };
  }

  return { text: "—", subdued: false };
}

function renderVariance(
  varianceCents: number,
  locale: string,
  copy: ReelCostRollupCopy,
): { text: string; className: string } {
  const formatted = formatCentsForDisplay(Math.abs(varianceCents), locale);
  const signedAmount =
    varianceCents > 0 ? `+${formatted}` : varianceCents < 0 ? `−${formatted}` : formatted;

  return {
    text: formatTemplate(copy.variance, { amount: signedAmount }),
    className:
      varianceCents > 0
        ? "text-butter"
        : varianceCents < 0
          ? "text-success"
          : "text-dim",
  };
}

export function ReelCostRollupPanel({
  rollup,
  locale,
  copy,
}: ReelCostRollupPanelProps) {
  const hasComponents = (rollup?.components.length ?? 0) > 0;
  const showPhaseNote =
    rollup?.components.length === 1 && rollup.components[0]?.assetRole === "llm";

  return (
    <section
      className="mb-4 py-[0.85rem] px-4 rounded-lg border border-edge bg-panel"
      aria-label={copy.title}
    >
      <h3 className="font-display text-fog mt-0 mx-0 mb-3 text-[0.95rem] font-semibold">
        {copy.title}
      </h3>

      {!rollup || !hasComponents ? (
        <div className="text-sm text-dim">
          <span className="mr-[0.35rem]">—</span>
          {copy.empty}
        </div>
      ) : (
        <div className="grid gap-3">
          {rollup.isOverBudget ? (
            <StatusAlert
              severity="warn"
              className="w-full"
            >
              <span className="text-sm">
                  {formatTemplate(copy.overBudget, {
                    max: formatCentsForDisplay(rollup.maxCostCents, locale),
                  })}
                </span>
            </StatusAlert>
          ) : null}

          <div
            className="flex flex-wrap gap-y-2 gap-x-5 items-baseline text-sm"
          >
            <div>
              <span className="text-dim mr-[0.35rem]">
                {copy.estimated}
              </span>
              <span className="font-semibold text-fog">
                {formatCentsForDisplay(rollup.estimatedTotalCents, locale)}
              </span>
            </div>
            <div>
              <span className="text-dim mr-[0.35rem]">
                {copy.actual}
              </span>
              {rollup.actualTotalCents !== null ? (
                <span className="font-semibold text-fog">
                  {formatCentsForDisplay(rollup.actualTotalCents, locale)}
                </span>
              ) : rollup.hasPendingActual ? (
                <StatusBadge value={copy.pending} severity="warning" />
              ) : (
                <span className="text-dim">—</span>
              )}
            </div>
            {rollup.varianceCents !== null ? (() => {
              const variance = renderVariance(rollup.varianceCents, locale, copy);
              return (
                <div className={variance.className}>
                  {variance.text}
                </div>
              );
            })() : null}
          </div>

          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-edge text-left hover:bg-transparent">
                <TableHead className="h-auto pt-[0.35rem] pr-2 pb-[0.35rem] pl-0 font-semibold text-dim">
                  {copy.breakdownRole}
                </TableHead>
                <TableHead className="h-auto px-2 py-[0.35rem] font-semibold text-dim">
                  {copy.breakdownEstimated}
                </TableHead>
                <TableHead className="h-auto pt-[0.35rem] pr-0 pb-[0.35rem] pl-2 font-semibold text-dim">
                  {copy.breakdownActual}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rollup.components.map((component) => {
                const actual = renderComponentActualValue(
                  component.actualCostCents,
                  component.hasPendingActual,
                  component.unavailableReasonKeys,
                  locale,
                  copy,
                );

                return (
                  <TableRow
                    key={component.assetRole}
                    className="border-edge hover:bg-transparent"
                  >
                    <TableCell className="pt-[0.45rem] pr-2 pb-[0.45rem] pl-0 font-semibold text-fog">
                      {copy.component[COMPONENT_ROLE_KEYS[component.assetRole]]}
                    </TableCell>
                    <TableCell className="px-2 py-[0.45rem] text-fog">
                      {component.estimatedCostCents > 0
                        ? formatCentsForDisplay(component.estimatedCostCents, locale)
                        : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-[0.45rem] pr-0 pl-2",
                        actual.subdued ? "text-dim" : "text-fog",
                      )}
                    >
                      {actual.text}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {showPhaseNote ? (
            <p className="m-0 text-[0.8125rem] text-dim">
              {copy.phaseNote}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
