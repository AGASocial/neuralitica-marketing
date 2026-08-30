"use client";

import { Message } from "primereact/message";
import { Tag } from "primereact/tag";

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
): { text: string; color: string } {
  const formatted = formatCentsForDisplay(Math.abs(varianceCents), locale);
  const signedAmount =
    varianceCents > 0 ? `+${formatted}` : varianceCents < 0 ? `−${formatted}` : formatted;

  return {
    text: formatTemplate(copy.variance, { amount: signedAmount }),
    color:
      varianceCents > 0
        ? "#b45309"
        : varianceCents < 0
          ? "#059669"
          : "#6b7280",
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
      style={{
        marginBottom: "1rem",
        padding: "0.85rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
      }}
      aria-label={copy.title}
    >
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 600 }}>
        {copy.title}
      </h3>

      {!rollup || !hasComponents ? (
        <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          <span style={{ marginRight: "0.35rem" }}>—</span>
          {copy.empty}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {rollup.isOverBudget ? (
            <Message
              severity="warn"
              style={{ width: "100%" }}
              content={
                <span style={{ fontSize: "0.875rem" }}>
                  {formatTemplate(copy.overBudget, {
                    max: formatCentsForDisplay(rollup.maxCostCents, locale),
                  })}
                </span>
              }
            />
          ) : null}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem 1.25rem",
              alignItems: "baseline",
              fontSize: "0.875rem",
            }}
          >
            <div>
              <span style={{ color: "#6b7280", marginRight: "0.35rem" }}>
                {copy.estimated}
              </span>
              <span style={{ fontWeight: 600, color: "#374151" }}>
                {formatCentsForDisplay(rollup.estimatedTotalCents, locale)}
              </span>
            </div>
            <div>
              <span style={{ color: "#6b7280", marginRight: "0.35rem" }}>
                {copy.actual}
              </span>
              {rollup.actualTotalCents !== null ? (
                <span style={{ fontWeight: 600, color: "#374151" }}>
                  {formatCentsForDisplay(rollup.actualTotalCents, locale)}
                </span>
              ) : rollup.hasPendingActual ? (
                <Tag value={copy.pending} severity="warning" />
              ) : (
                <span style={{ color: "#6b7280" }}>—</span>
              )}
            </div>
            {rollup.varianceCents !== null ? (() => {
              const variance = renderVariance(rollup.varianceCents, locale, copy);
              return (
                <div style={{ color: variance.color }}>
                  {variance.text}
                </div>
              );
            })() : null}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
                  <th
                    style={{
                      padding: "0.35rem 0.5rem 0.35rem 0",
                      color: "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    {copy.breakdownRole}
                  </th>
                  <th
                    style={{
                      padding: "0.35rem 0.5rem",
                      color: "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    {copy.breakdownEstimated}
                  </th>
                  <th
                    style={{
                      padding: "0.35rem 0 0.35rem 0.5rem",
                      color: "#6b7280",
                      fontWeight: 600,
                    }}
                  >
                    {copy.breakdownActual}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rollup.components.map((component) => {
                  const actual = renderComponentActualValue(
                    component.actualCostCents,
                    component.hasPendingActual,
                    component.unavailableReasonKeys,
                    locale,
                    copy,
                  );

                  return (
                    <tr
                      key={component.assetRole}
                      style={{ borderBottom: "1px solid #f3f4f6" }}
                    >
                      <td
                        style={{
                          padding: "0.45rem 0.5rem 0.45rem 0",
                          fontWeight: 600,
                          color: "#374151",
                        }}
                      >
                        {copy.component[COMPONENT_ROLE_KEYS[component.assetRole]]}
                      </td>
                      <td style={{ padding: "0.45rem 0.5rem", color: "#374151" }}>
                        {component.estimatedCostCents > 0
                          ? formatCentsForDisplay(component.estimatedCostCents, locale)
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "0.45rem 0 0.45rem 0.5rem",
                          color: actual.subdued ? "#6b7280" : "#374151",
                        }}
                      >
                        {actual.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPhaseNote ? (
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "#6b7280" }}>
              {copy.phaseNote}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
