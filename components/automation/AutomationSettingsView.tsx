"use client";

import { useState, useTransition } from "react";

import { upsertAutomationSettings } from "@/lib/automation/actions/upsert-automation-settings";
import type {
  AutomationPreset,
  AutomationSettings,
} from "@/lib/contracts/automation-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";

export type AutomationSettingsCopy = {
  title: string;
  subtitle: string;
  presetLabel: string;
  reviewAll: string;
  reviewAllHint: string;
  autoPilot: string;
  autoPilotHint: string;
  custom: string;
  customHint: string;
  weeklyCap: string;
  maxItem: string;
  reminders: string;
  remind24: string;
  remind48: string;
  remind72: string;
  save: string;
  saving: string;
  success: string;
  error: string;
  centsHint: string;
};

type AutomationSettingsViewProps = {
  initial: AutomationSettings;
  copy: AutomationSettingsCopy;
};

export function AutomationSettingsView({
  initial,
  copy,
}: AutomationSettingsViewProps) {
  const [preset, setPreset] = useState<AutomationPreset>(initial.preset);
  const [weeklyCap, setWeeklyCap] = useState(
    initial.weeklySpendCapCents?.toString() ?? "",
  );
  const [maxItem, setMaxItem] = useState(
    initial.maxAutoApproveCostCents?.toString() ?? "",
  );
  const [remind24, setRemind24] = useState(initial.remindAfter24h);
  const [remind48, setRemind48] = useState(initial.remindAfter48hChannelChange);
  const [remind72, setRemind72] = useState(initial.remindAfter72hFallback);
  const [message, setMessage] = useState<"ok" | "err" | null>(null);
  const [pending, startTransition] = useTransition();

  function parseCents(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function onSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await upsertAutomationSettings({
        preset,
        weeklySpendCapCents: parseCents(weeklyCap),
        maxAutoApproveCostCents: parseCents(maxItem),
        remindAfter24h: remind24,
        remindAfter48hChannelChange: remind48,
        remindAfter72hFallback: remind72,
      });
      setMessage(result.ok ? "ok" : "err");
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-fog">{copy.title}</h1>
        <p className="text-dim">{copy.subtitle}</p>
      </header>

      <Card className="border-edge bg-panel/40">
        <CardHeader>
          <CardTitle className="text-base text-fog">{copy.presetLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(
            [
              ["review_all", copy.reviewAll, copy.reviewAllHint],
              ["auto_pilot", copy.autoPilot, copy.autoPilotHint],
              ["custom", copy.custom, copy.customHint],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-lg border border-edge bg-deep/40 p-3"
            >
              <input
                type="radio"
                name="automation-preset"
                checked={preset === value}
                onChange={() => setPreset(value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-fog">
                  {label}
                </span>
                <span className="block text-sm text-dim">{hint}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-edge bg-panel/40">
        <CardContent className="space-y-3 py-4">
          <label className="block space-y-1 text-sm">
            <span className="text-fog">{copy.weeklyCap}</span>
            <input
              type="number"
              min={0}
              value={weeklyCap}
              onChange={(e) => setWeeklyCap(e.target.value)}
              className="w-full rounded-md border border-edge bg-deep px-3 py-2 text-fog"
            />
            <span className="text-dim">{copy.centsHint}</span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-fog">{copy.maxItem}</span>
            <input
              type="number"
              min={0}
              value={maxItem}
              onChange={(e) => setMaxItem(e.target.value)}
              className="w-full rounded-md border border-edge bg-deep px-3 py-2 text-fog"
            />
            <span className="text-dim">{copy.centsHint}</span>
          </label>
        </CardContent>
      </Card>

      <Card className="border-edge bg-panel/40">
        <CardHeader>
          <CardTitle className="text-base text-fog">{copy.reminders}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-fog">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remind24}
              onChange={(e) => setRemind24(e.target.checked)}
            />
            {copy.remind24}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remind48}
              onChange={(e) => setRemind48(e.target.checked)}
            />
            {copy.remind48}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={remind72}
              onChange={(e) => setRemind72(e.target.checked)}
            />
            {copy.remind72}
          </label>
        </CardContent>
      </Card>

      {message === "ok" ? (
        <StatusAlert severity="success" text={copy.success} />
      ) : null}
      {message === "err" ? (
        <StatusAlert severity="error" text={copy.error} />
      ) : null}

      <Button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="w-fit bg-butter text-deep hover:bg-butter/90"
      >
        {pending ? copy.saving : copy.save}
      </Button>
    </div>
  );
}
