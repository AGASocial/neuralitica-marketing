"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Spinner } from "@/components/ui/spinner";
import { StatusAlert } from "@/components/ui/status-alert";

import type { OperatorCostSettingsDto } from "@/lib/contracts/cost-policy";
import { MAX_COST_CENTS_CEILING } from "@/lib/contracts/cost-policy";
import type { ProviderTier } from "@/lib/contracts/providers";
import { updateClientCostPolicyOverride } from "@/lib/cost-policy/actions/update-client-cost-policy-override";
import { updateGlobalCostPolicy } from "@/lib/cost-policy/actions/update-global-cost-policy";
import {
  centsToDollars,
  dollarsToCents,
  formatCentsForDisplay,
} from "@/lib/cost-policy/format-cents-for-display";

export type CostPolicySettingsCopy = {
  title: string;
  subtitle: string;
  globalSectionTitle: string;
  clientSectionTitle: string;
  clientOverrideToggle: string;
  maxCostLabel: string;
  maxCostHint: string;
  providerTierLabel: string;
  providerTierOptions: Record<ProviderTier, string>;
  resolvedProviderLabel: string;
  effectiveTitle: string;
  effectiveGlobal: string;
  effectiveClient: string;
  saveGlobal: string;
  saveClient: string;
  saving: string;
  toastGlobalSuccess: string;
  toastClientSuccess: string;
  highTierInactiveWarning: string;
  backDashboard: string;
  loadError: string;
  errors: {
    validation: string;
    unavailable: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

type CostPolicySettingsFormProps = {
  initialSettings: OperatorCostSettingsDto;
  locale: string;
  copy: CostPolicySettingsCopy;
};

const TIER_OPTIONS: ProviderTier[] = ["low", "high"];

export function CostPolicySettingsForm({
  initialSettings,
  locale,
  copy,
}: CostPolicySettingsFormProps) {
  const router = useRouter();

  const [settings, setSettings] = useState(initialSettings);
  const [globalMaxDollars, setGlobalMaxDollars] = useState(
    centsToDollars(initialSettings.global.maxCostCents),
  );
  const [globalTier, setGlobalTier] = useState<ProviderTier>(
    initialSettings.global.providerTier,
  );
  const [clientOverrideEnabled, setClientOverrideEnabled] = useState(
    initialSettings.clientOverride !== null,
  );
  const [clientMaxDollars, setClientMaxDollars] = useState(
    centsToDollars(
      initialSettings.clientOverride?.maxCostCents ??
        initialSettings.global.maxCostCents,
    ),
  );
  const [clientTier, setClientTier] = useState<ProviderTier>(
    initialSettings.clientOverride?.providerTier ??
      initialSettings.global.providerTier,
  );
  const [globalPending, setGlobalPending] = useState(false);
  const [clientPending, setClientPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const tierDropdownOptions = TIER_OPTIONS.map((tier) => ({
    label: copy.providerTierOptions[tier],
    value: tier,
  }));

  const maxDollarsCeiling = centsToDollars(MAX_COST_CENTS_CEILING);

  function messageForError(code: string): string {
    switch (code) {
      case "POLICY_VALIDATION_ERROR":
      case "VALIDATION_ERROR":
        return copy.errors.validation;
      case "COST_POLICY_UNAVAILABLE":
        return copy.errors.unavailable;
      case "UNAUTHENTICATED":
        return copy.errors.unauthenticated;
      case "FORBIDDEN":
        return copy.errors.forbidden;
      default:
        return copy.errors.internal;
    }
  }

  async function handleSaveGlobal() {
    if (globalPending || clientPending) {
      return;
    }

    setGlobalPending(true);
    setBanner(null);

    try {
      const result = await updateGlobalCostPolicy({
        maxCostCents: dollarsToCents(globalMaxDollars),
        providerTier: globalTier,
      });

      if (result.ok) {
        setSettings(result.settings);
        toast.success(copy.toastGlobalSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setGlobalPending(false);
    }
  }

  async function handleSaveClientOverride() {
    if (globalPending || clientPending) {
      return;
    }

    setClientPending(true);
    setBanner(null);

    try {
      const result = await updateClientCostPolicyOverride(
        clientOverrideEnabled
          ? {
              enabled: true,
              maxCostCents: dollarsToCents(clientMaxDollars),
              providerTier: clientTier,
            }
          : { enabled: false },
      );

      if (result.ok) {
        setSettings(result.settings);
        setClientOverrideEnabled(result.settings.clientOverride !== null);
        toast.success(copy.toastClientSuccess, { duration: 4000 });
        router.refresh();
        return;
      }

      setBanner(messageForError(result.error.code));
    } catch {
      setBanner(copy.errors.internal);
    } finally {
      setClientPending(false);
    }
  }

  const effectiveLabel =
    settings.effective.scope === "client"
      ? copy.effectiveClient
      : copy.effectiveGlobal;

  return (
    <div className="mx-auto max-w-[720px]">
      <header className="mb-6">
        <h1 className="mb-1.5 font-display text-4xl text-fog">{copy.title}</h1>
        <p className="text-dim">{copy.subtitle}</p>
      </header>

      {settings.highTierWarningKey ? (
        <StatusAlert
          severity="warn"
          text={copy.highTierInactiveWarning}
          className="mb-4 w-full"
        />
      ) : null}

      {banner ? (
        <StatusAlert severity="error" text={banner} className="mb-4 w-full" />
      ) : null}

      <section className="mb-5 flex flex-col gap-4 rounded-xl border border-edge bg-panel p-5">
        <h2 className="font-display text-xl text-fog">{copy.globalSectionTitle}</h2>

        <div>
          <Label htmlFor="global-max-cost" className="mb-1.5 block font-semibold text-fog">
            {copy.maxCostLabel}
          </Label>
          <CurrencyInput
            id="global-max-cost"
            value={globalMaxDollars}
            onValueChange={setGlobalMaxDollars}
            min={0.01}
            max={maxDollarsCeiling}
            disabled={globalPending || clientPending}
          />
          <p className="mt-1.5 text-sm text-dim">
            {copy.maxCostHint.replace(
              "{max}",
              formatCentsForDisplay(MAX_COST_CENTS_CEILING, locale),
            )}
          </p>
        </div>

        <div>
          <Label
            htmlFor="global-provider-tier"
            className="mb-1.5 block font-semibold text-fog"
          >
            {copy.providerTierLabel}
          </Label>
          <SimpleSelect
            id="global-provider-tier"
            value={globalTier}
            options={tierDropdownOptions}
            onChange={setGlobalTier}
            disabled={globalPending || clientPending}
          />
        </div>

        <Button
          type="button"
          disabled={globalPending || clientPending}
          onClick={() => void handleSaveGlobal()}
          className="w-full"
        >
          {globalPending ? <Spinner className="size-4 text-current" /> : null}
          {globalPending ? copy.saving : copy.saveGlobal}
        </Button>
      </section>

      <section className="mb-5 flex flex-col gap-4 rounded-xl border border-edge bg-panel p-5">
        <h2 className="font-display text-xl text-fog">{copy.clientSectionTitle}</h2>

        <div className="flex items-center gap-2">
          <Checkbox
            id="client-override-enabled"
            checked={clientOverrideEnabled}
            onCheckedChange={(checked) => setClientOverrideEnabled(checked === true)}
            disabled={globalPending || clientPending}
          />
          <Label htmlFor="client-override-enabled" className="text-fog">
            {copy.clientOverrideToggle}
          </Label>
        </div>

        {clientOverrideEnabled ? (
          <>
            <div>
              <Label
                htmlFor="client-max-cost"
                className="mb-1.5 block font-semibold text-fog"
              >
                {copy.maxCostLabel}
              </Label>
              <CurrencyInput
                id="client-max-cost"
                value={clientMaxDollars}
                onValueChange={setClientMaxDollars}
                min={0.01}
                max={maxDollarsCeiling}
                disabled={globalPending || clientPending}
              />
            </div>

            <div>
              <Label
                htmlFor="client-provider-tier"
                className="mb-1.5 block font-semibold text-fog"
              >
                {copy.providerTierLabel}
              </Label>
              <SimpleSelect
                id="client-provider-tier"
                value={clientTier}
                options={tierDropdownOptions}
                onChange={setClientTier}
                disabled={globalPending || clientPending}
              />
            </div>
          </>
        ) : null}

        <Button
          type="button"
          disabled={globalPending || clientPending}
          onClick={() => void handleSaveClientOverride()}
          className="w-full"
        >
          {clientPending ? <Spinner className="size-4 text-current" /> : null}
          {clientPending ? copy.saving : copy.saveClient}
        </Button>
      </section>

      <section className="mb-5 rounded-xl border border-edge bg-deep/60 px-5 py-4">
        <h2 className="mb-3 font-display text-lg text-fog">{copy.effectiveTitle}</h2>
        <p className="mb-1.5 text-fog">
          <strong>{effectiveLabel}</strong>
        </p>
        <p className="mb-1.5 text-fog">
          {copy.maxCostLabel}:{" "}
          {formatCentsForDisplay(settings.effective.maxCostCents, locale)}
        </p>
        <p className="mb-1.5 text-fog">
          {copy.providerTierLabel}:{" "}
          {copy.providerTierOptions[settings.effective.providerTier]}
        </p>
        <p className="text-sm text-dim">
          {copy.resolvedProviderLabel}: {settings.resolvedLlmProviderLabel}
        </p>
      </section>

      <Button type="button" variant="ghost" onClick={() => router.push("/dashboard")}>
        {copy.backDashboard}
      </Button>
    </div>
  );
}
