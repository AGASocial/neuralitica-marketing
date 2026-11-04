"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { StatusAlert } from "@/components/ui/status-alert";
import { StatusBadge } from "@/components/ui/status-badge";

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
      className="mb-4 py-3 px-4 border border-edge rounded-md bg-panel"
      aria-label={copy.title}
    >
      <h3 className="font-display text-fog mt-0 mx-0 mb-3 text-[0.95rem] font-semibold">
        {copy.title}
      </h3>

      {state.status === "loading" || state.status === "idle" ? (
        <div className="grid gap-2">
          <Skeleton className="h-5 bg-edge" />
          <Skeleton className="h-12 bg-edge" />
        </div>
      ) : null}

      {state.status === "loading" ? (
        <p className="mt-2 mx-0 mb-0 text-dim text-sm">
          {copy.loading}
        </p>
      ) : null}

      {state.status === "error" ? (
        <StatusAlert severity="warn" text={state.message} className="w-full" />
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
    <div className="grid gap-3">
      <ul
        className="m-0 p-0 list-none grid gap-2"
      >
        {recommendation.components.map((component) => (
          <li
            key={component.assetRole}
            className="py-2 px-3 border border-edge rounded bg-panel"
          >
            <div
              className="flex flex-wrap gap-2 items-center mb-[0.35rem]"
            >
              <span className="font-semibold text-sm">
                {copy.assetRoles[component.assetRole]}
              </span>
              <StatusBadge
                value={copy.tierBadge.replace(
                  "{tier}",
                  copy.providerTierOptions[component.providerTier],
                )}
                severity={component.providerTier === "high" ? "info" : "secondary"}
              />
            </div>
            <dl
              className="m-0 grid gap-[0.2rem] text-sm"
            >
              <div>
                <dt className="inline text-dim">
                  {copy.providerLabel}:{" "}
                </dt>
                <dd className="inline m-0">{component.displayLabel}</dd>
              </div>
              <div>
                <dt className="inline text-dim">
                  {copy.costLabel}:{" "}
                </dt>
                <dd className="inline m-0">
                  {formatCentsForDisplay(component.estimatedCostCents, locale)}
                </dd>
              </div>
              <div>
                <dt className="inline text-dim">
                  {copy.rationaleLabel}:{" "}
                </dt>
                <dd className="inline m-0">
                  {copy.rationale[component.rationaleKey]}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <p className="m-0 font-semibold text-sm">
        {copy.projectedTotal.replace(
          "{amount}",
          formatCentsForDisplay(recommendation.projectedTotalCents, locale),
        )}
      </p>

      <p className="m-0 text-dim text-[0.8125rem]">
        {copy.manualFallbackNote}
      </p>
    </div>
  );
}
