"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { Message } from "primereact/message";
import { Toast } from "primereact/toast";

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
  const toastRef = useRef<Toast>(null);

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
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastGlobalSuccess,
          life: 4000,
        });
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
        toastRef.current?.show({
          severity: "success",
          summary: copy.toastClientSuccess,
          life: 4000,
        });
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
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <Toast ref={toastRef} position="top-right" />

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>{copy.title}</h1>
        <p style={{ margin: 0, color: "#6b7280" }}>{copy.subtitle}</p>
      </header>

      {settings.highTierWarningKey ? (
        <Message
          severity="warn"
          text={copy.highTierInactiveWarning}
          style={{ width: "100%", marginBottom: "1rem" }}
        />
      ) : null}

      {banner ? (
        <Message severity="error" text={banner} style={{ width: "100%", marginBottom: "1rem" }} />
      ) : null}

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "1.25rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{copy.globalSectionTitle}</h2>

        <div>
          <label htmlFor="global-max-cost" style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}>
            {copy.maxCostLabel}
          </label>
          <InputNumber
            inputId="global-max-cost"
            value={globalMaxDollars}
            onValueChange={(event) => {
              if (typeof event.value === "number") {
                setGlobalMaxDollars(event.value);
              }
            }}
            mode="currency"
            currency="USD"
            locale={locale}
            min={0.01}
            max={maxDollarsCeiling}
            disabled={globalPending || clientPending}
            style={{ width: "100%" }}
          />
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            {copy.maxCostHint.replace(
              "{max}",
              formatCentsForDisplay(MAX_COST_CENTS_CEILING, locale),
            )}
          </p>
        </div>

        <div>
          <label htmlFor="global-provider-tier" style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}>
            {copy.providerTierLabel}
          </label>
          <Dropdown
            inputId="global-provider-tier"
            value={globalTier}
            options={tierDropdownOptions}
            onChange={(event) => setGlobalTier(event.value as ProviderTier)}
            disabled={globalPending || clientPending}
            style={{ width: "100%" }}
          />
        </div>

        <Button
          type="button"
          label={globalPending ? copy.saving : copy.saveGlobal}
          loading={globalPending}
          disabled={clientPending}
          onClick={() => void handleSaveGlobal()}
        />
      </section>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "1.25rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{copy.clientSectionTitle}</h2>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Checkbox
            inputId="client-override-enabled"
            checked={clientOverrideEnabled}
            onChange={(event) => setClientOverrideEnabled(event.checked === true)}
            disabled={globalPending || clientPending}
          />
          <label htmlFor="client-override-enabled">{copy.clientOverrideToggle}</label>
        </div>

        {clientOverrideEnabled ? (
          <>
            <div>
              <label htmlFor="client-max-cost" style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}>
                {copy.maxCostLabel}
              </label>
              <InputNumber
                inputId="client-max-cost"
                value={clientMaxDollars}
                onValueChange={(event) => {
                  if (typeof event.value === "number") {
                    setClientMaxDollars(event.value);
                  }
                }}
                mode="currency"
                currency="USD"
                locale={locale}
                min={0.01}
                max={maxDollarsCeiling}
                disabled={globalPending || clientPending}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="client-provider-tier" style={{ display: "block", fontWeight: 600, marginBottom: "0.35rem" }}>
                {copy.providerTierLabel}
              </label>
              <Dropdown
                inputId="client-provider-tier"
                value={clientTier}
                options={tierDropdownOptions}
                onChange={(event) => setClientTier(event.value as ProviderTier)}
                disabled={globalPending || clientPending}
                style={{ width: "100%" }}
              />
            </div>
          </>
        ) : null}

        <Button
          type="button"
          label={clientPending ? copy.saving : copy.saveClient}
          loading={clientPending}
          disabled={globalPending}
          onClick={() => void handleSaveClientOverride()}
        />
      </section>

      <section
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>{copy.effectiveTitle}</h2>
        <p style={{ margin: "0 0 0.35rem" }}>
          <strong>{effectiveLabel}</strong>
        </p>
        <p style={{ margin: "0 0 0.35rem", color: "#374151" }}>
          {copy.maxCostLabel}:{" "}
          {formatCentsForDisplay(settings.effective.maxCostCents, locale)}
        </p>
        <p style={{ margin: "0 0 0.35rem", color: "#374151" }}>
          {copy.providerTierLabel}:{" "}
          {copy.providerTierOptions[settings.effective.providerTier]}
        </p>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>
          {copy.resolvedProviderLabel}: {settings.resolvedLlmProviderLabel}
        </p>
      </section>

      <Button
        type="button"
        label={copy.backDashboard}
        className="p-button-text"
        onClick={() => router.push("/dashboard")}
      />
    </div>
  );
}
