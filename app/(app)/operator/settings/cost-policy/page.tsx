import { CostPolicySettingsForm } from "@/components/cost-policy/CostPolicySettingsForm";
import { getCostPolicyForSettings } from "@/lib/cost-policy/actions/get-cost-policy-for-settings";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

function isNextNavigationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    (error.digest.startsWith("NEXT_REDIRECT") ||
      error.digest.startsWith("NEXT_HTTP_ERROR"))
  );
}

/**
 * Operator cost policy settings (US-7.1).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function CostPolicySettingsPage() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  let result: Awaited<ReturnType<typeof getCostPolicyForSettings>>;
  try {
    result = await getCostPolicyForSettings();
  } catch (error) {
    if (isNextNavigationError(error)) {
      throw error;
    }
    result = { ok: false, error: { code: "INTERNAL_ERROR" } };
  }

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="mb-1.5 font-display text-4xl text-fog">
          {t.settings.costPolicy.title}
        </h1>
        <p className="text-rose">{t.settings.costPolicy.loadError}</p>
      </div>
    );
  }

  return (
    <CostPolicySettingsForm
      initialSettings={result.settings}
      locale={locale}
      copy={{
        title: t.settings.costPolicy.title,
        subtitle: t.settings.costPolicy.subtitle,
        globalSectionTitle: t.settings.costPolicy.globalSectionTitle,
        clientSectionTitle: t.settings.costPolicy.clientSectionTitle,
        clientOverrideToggle: t.settings.costPolicy.clientOverrideToggle,
        maxCostLabel: t.settings.costPolicy.maxCostLabel,
        maxCostHint: t.settings.costPolicy.maxCostHint,
        providerTierLabel: t.settings.costPolicy.providerTierLabel,
        providerTierOptions: t.settings.costPolicy.providerTierOptions,
        resolvedProviderLabel: t.settings.costPolicy.resolvedProviderLabel,
        effectiveTitle: t.settings.costPolicy.effectiveTitle,
        effectiveGlobal: t.settings.costPolicy.effectiveGlobal,
        effectiveClient: t.settings.costPolicy.effectiveClient,
        saveGlobal: t.settings.costPolicy.saveGlobal,
        saveClient: t.settings.costPolicy.saveClient,
        saving: t.settings.costPolicy.saving,
        toastGlobalSuccess: t.settings.costPolicy.toastGlobalSuccess,
        toastClientSuccess: t.settings.costPolicy.toastClientSuccess,
        highTierInactiveWarning: t.settings.costPolicy.highTierInactiveWarning,
        backDashboard: t.settings.costPolicy.backDashboard,
        loadError: t.settings.costPolicy.loadError,
        errors: t.settings.costPolicy.errors,
      }}
    />
  );
}
