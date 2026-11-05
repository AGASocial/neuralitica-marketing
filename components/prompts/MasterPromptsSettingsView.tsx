"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import type { MasterPromptsForSettings } from "@/lib/prompts/get-master-prompts-for-settings";
import type { SupportedLocale } from "@/lib/contracts/providers";
import { updateGlobalMasterPrompt } from "@/lib/prompts/actions/update-global-master-prompt";
import { updateBusinessMasterPrompt } from "@/lib/prompts/actions/update-business-master-prompt";
    10|
type MasterPromptsCopy = {
  title: string;
  subtitle: string;
  globalSectionTitle: string;
  globalHint: string;
  globalPlaceholder: string;
  businessSectionTitle: string;
  businessHint: string;
  businessPlaceholder: string;
    20|  clientLabel: string;
  clientPlaceholder: string;
  saveGlobal: string;
  saveBusiness: string;
  saving: string;
  characterCount: string;
  toastGlobalSuccess: string;
  toastBusinessSuccess: string;
  backDashboard: string;
  loadError: string;
    30|  errors: {
    validation: string;
    unavailable: string;
    unauthenticated: string;
    forbidden: string;
    internal: string;
  };
};

export type MasterPromptsSettingsViewProps = {
    40|  initialPrompts: MasterPromptsForSettings;
  locale: SupportedLocale;
  copy: MasterPromptsCopy;
};

export function MasterPromptsSettingsView(
  props: MasterPromptsSettingsViewProps,
) {
  const [globalPrompt, setGlobalPrompt] = useState(props.initialPrompts.global);
  const [businessPrompt, setBusinessPrompt] = useState("");
    50|  const [selectedClientId, setSelectedClientId] = useState("");
  const [isPendingGlobal, startTransitionGlobal] = useTransition();
  const [isPendingBusiness, startTransitionBusiness] = useTransition();

  const handleSaveGlobal = () => {
    startTransitionGlobal(async () => {
      const result = await updateGlobalMasterPrompt({
        globalMasterPrompt: globalPrompt,
      });
    60|
      if (!result.ok) {
        const errorMessage =
          result.error.code === "VALIDATION_ERROR"
            ? props.copy.errors.validation
            : result.error.code === "FORBIDDEN"
              ? props.copy.errors.forbidden
              : props.copy.errors.internal;
        toast.error(errorMessage);
        return;
      }
    70|
      toast.success(props.copy.toastGlobalSuccess);
    });
  };

  const handleSaveBusiness = () => {
    if (!selectedClientId) {
      return;
    }
    80|    startTransitionBusiness(async () => {
      const result = await updateBusinessMasterPrompt({
        clientId: selectedClientId,
        businessMasterPrompt: businessPrompt,
      });

      if (!result.ok) {
        const errorMessage =
          result.error.code === "VALIDATION_ERROR"
            ? props.copy.errors.validation
    90|            : result.error.code === "FORBIDDEN"
              ? props.copy.errors.forbidden
              : props.copy.errors.internal;
        toast.error(errorMessage);
        return;
      }

      toast.success(props.copy.toastBusinessSuccess);
    });
  };
   100|
  const globalCharCount = globalPrompt.length;
  const businessCharCount = businessPrompt.length;

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div>
        <Link
          href="/operator"
          className="text-sm text-fog-light hover:text-fog"
   110|        >
          ← {props.copy.backDashboard}
        </Link>
        <h1 className="mt-4 mb-1.5 font-display text-4xl text-fog">
          {props.copy.title}
        </h1>
        <p className="text-fog-light">{props.copy.subtitle}</p>
      </div>

      {/* Global master prompt */}
   120|      <div className="rounded-lg border border-ash bg-white p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-fog mb-1">
            {props.copy.globalSectionTitle}
          </h2>
          <p className="text-sm text-fog-light">{props.copy.globalHint}</p>
        </div>

        <div>
          <textarea
   130|            value={globalPrompt}
            onChange={(e) => setGlobalPrompt(e.target.value)}
            placeholder={props.copy.globalPlaceholder}
            rows={8}
            className="w-full rounded-md border border-ash px-3 py-2 text-fog font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sky"
            maxLength={4000}
          />
          <p className="mt-1 text-xs text-fog-light text-right">
            {props.copy.characterCount.replace(
   140|              "{count}",
              String(globalCharCount),
            )}
          </p>
        </div>

        <button
          onClick={handleSaveGlobal}
          disabled={isPendingGlobal}
          className="rounded-md bg-sky px-4 py-2 text-sm font-medium text-white hover:bg-sky-dark disabled:opacity-50 disabled:cursor-not-allowed"
   150|        >
          {isPendingGlobal ? props.copy.saving : props.copy.saveGlobal}
        </button>
      </div>

      {/* Per-business master prompt */}
      <div className="rounded-lg border border-ash bg-white p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-fog mb-1">
            {props.copy.businessSectionTitle}
   160|          </h2>
          <p className="text-sm text-fog-light">{props.copy.businessHint}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-fog mb-1">
            {props.copy.clientLabel}
          </label>
          <input
            type="text"
   170|            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setBusinessPrompt(
                props.initialPrompts.perBusinessByClientId[e.target.value] ?? "",
              );
            }}
            placeholder={props.copy.clientPlaceholder}
            className="w-full rounded-md border border-ash px-3 py-2 text-fog text-sm focus:outline-none focus:ring-2 focus:ring-sky"
          />
   180|          <p className="mt-1 text-xs text-fog-light">
            Enter client UUID to edit per-business prompt
          </p>
        </div>

        {selectedClientId && (
          <>
            <div>
              <textarea
                value={businessPrompt}
   190|                onChange={(e) => setBusinessPrompt(e.target.value)}
                placeholder={props.copy.businessPlaceholder}
                rows={8}
                className="w-full rounded-md border border-ash px-3 py-2 text-fog font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-sky"
                maxLength={4000}
              />
              <p className="mt-1 text-xs text-fog-light text-right">
                {props.copy.characterCount.replace(
                  "{count}",
   200|                  String(businessCharCount),
                )}
              </p>
            </div>

            <button
              onClick={handleSaveBusiness}
              disabled={isPendingBusiness}
              className="rounded-md bg-sky px-4 py-2 text-sm font-medium text-white hover:bg-sky-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
   210|              {isPendingBusiness ? props.copy.saving : props.copy.saveBusiness}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
