"use client";

import { useEffect, useState } from "react";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";

import type { AssetRole } from "@/lib/contracts/providers";
import type {
  ProviderRationaleKey,
  ReelProviderRecommendation,
} from "@/lib/contracts/provider-decisions";
import type { ProviderTier } from "@/lib/contracts/providers";
import { getReelProviderRecommendations } from "@/lib/cost-policy/actions/get-reel-provider-recommendations";
import { formatCentsForDisplay } from "@/lib/cost-policy/format-cents-for-display";

export type ProviderRecommendationCopy = {
  title: string;
  loading: string;
  loadError: string;
  projectedTotal: string;
  manualFallbackNote: string;
  providerLabel: string;
  costLabel: string;
  rationaleLabel: string;
  tierBadge: string;
  providerTierOptions: Record<ProviderTier, string>;
  assetRoles: Record<AssetRole, string>;
  rationale: Record<ProviderRationaleKey, string>;
  errors: {
    providerUnavailable: string;
    strategyNotApproved: string;
    slotNotFound: string;
    forbidden: string;
  };
};

type ProviderRecommendationPanelProps = {
  weekStart: string;
  slotIndex: number;
  locale: string;
  copy: ProviderRecommendationCopy;
};

type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; recommendation: ReelProviderRecommendation };

function errorMessageForCode(
  code: string,
  copy: ProviderRecommendationCopy,
): string {
  switch (code) {
    case "PROVIDER_UNAVAILABLE":
      return copy.errors.providerUnavailable;
    case "STRATEGY_NOT_APPROVED":
      return copy.errors.strategyNotApproved;
    case "SLOT_NOT_FOUND":
      return copy.errors.slotNotFound;
    case "FORBIDDEN":
      return copy.errors.forbidden;
    default:
      return copy.loadError;
  }
}

export function ProviderRecommendationPanel({
  weekStart,
  slotIndex,
  locale,
  copy,
}: ProviderRecommendationPanelProps) {
  const [state, setState] = useState<PanelState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      const result = await getReelProviderRecommendations({
        weekStart,
        slotIndex,
      });

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setState({
          status: "error",
          message: errorMessageForCode(result.error.code, copy),
        });
        return;
      }

      const recommendation = result.items.find((item) => item.slotIndex === slotIndex);
      if (!recommendation) {
        setState({
          status: "error",
          message: copy.errors.slotNotFound,
        });
        return;
      }

      setState({ status: "success", recommendation });
    }

    void load();

    return () => {
      cancelled = true;
    };
    // copy is stable for the page session; weekStart/slotIndex drive refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, slotIndex]);

  return (
    <section
      style={{
        marginBottom: "1rem",
        padding: "0.75rem 1rem",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        background: "#f9fafb",
      }}
      aria-label={copy.title}
    >
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 600 }}>
        {copy.title}
      </h3>

      {state.status === "loading" || state.status === "idle" ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <Skeleton height="1.25rem" />
          <Skeleton height="3rem" />
        </div>
      ) : null}

      {state.status === "loading" ? (
        <p style={{ margin: "0.5rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.loading}
        </p>
      ) : null}

      {state.status === "error" ? (
        <Message severity="warn" text={state.message} style={{ width: "100%" }} />
      ) : null}

      {state.status === "success" ? (
        <ProviderRecommendationContent
          recommendation={state.recommendation}
          locale={locale}
          copy={copy}
        />
      ) : null}
    </section>
  );
}

function ProviderRecommendationContent({
  recommendation,
  locale,
  copy,
}: {
  recommendation: ReelProviderRecommendation;
  locale: string;
  copy: ProviderRecommendationCopy;
}) {
  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "grid",
          gap: "0.5rem",
        }}
      >
        {recommendation.components.map((component) => (
          <li
            key={component.assetRole}
            style={{
              padding: "0.5rem 0.75rem",
              border: "1px solid #e5e7eb",
              borderRadius: "4px",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: "0.35rem",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                {copy.assetRoles[component.assetRole]}
              </span>
              <Tag
                value={copy.tierBadge.replace(
                  "{tier}",
                  copy.providerTierOptions[component.providerTier],
                )}
                severity={component.providerTier === "high" ? "info" : "secondary"}
              />
            </div>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gap: "0.2rem",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <dt style={{ display: "inline", color: "#6b7280" }}>
                  {copy.providerLabel}:{" "}
                </dt>
                <dd style={{ display: "inline", margin: 0 }}>{component.displayLabel}</dd>
              </div>
              <div>
                <dt style={{ display: "inline", color: "#6b7280" }}>
                  {copy.costLabel}:{" "}
                </dt>
                <dd style={{ display: "inline", margin: 0 }}>
                  {formatCentsForDisplay(component.estimatedCostCents, locale)}
                </dd>
              </div>
              <div>
                <dt style={{ display: "inline", color: "#6b7280" }}>
                  {copy.rationaleLabel}:{" "}
                </dt>
                <dd style={{ display: "inline", margin: 0 }}>
                  {copy.rationale[component.rationaleKey]}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem" }}>
        {copy.projectedTotal.replace(
          "{amount}",
          formatCentsForDisplay(recommendation.projectedTotalCents, locale),
        )}
      </p>

      <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8125rem" }}>
        {copy.manualFallbackNote}
      </p>
    </div>
  );
}
