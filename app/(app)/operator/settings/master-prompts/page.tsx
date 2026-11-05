import { MasterPromptsSettingsView } from "@/components/prompts/MasterPromptsSettingsView";
import { getMasterPromptsForSettings } from "@/lib/prompts/get-master-prompts-for-settings";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

/**
 * Operator master prompts settings (operator-master-prompts OpenSpec change).
 * Auth: `operator/layout.tsx` `requireOperator("page")`.
 */
export default async function MasterPromptsSettingsPage() {
  const user = await getCurrentUser();
  const locale = await resolveRequestLocale(user?.preferredLocale);
  const t = getTranslations(locale);

  const result = await getMasterPromptsForSettings();

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-[960px]">
        <h1 className="mb-1.5 font-display text-4xl text-fog">
          {t.settings.masterPrompts.title}
        </h1>
        <p className="text-rose">{t.settings.masterPrompts.loadError}</p>
      </div>
    );
  }

  return (
    <MasterPromptsSettingsView
      initialPrompts={result.prompts}
      locale={locale}
      copy={{
        title: t.settings.masterPrompts.title,
        subtitle: t.settings.masterPrompts.subtitle,
        globalSectionTitle: t.settings.masterPrompts.globalSectionTitle,
        globalHint: t.settings.masterPrompts.globalHint,
        globalPlaceholder: t.settings.masterPrompts.globalPlaceholder,
        businessSectionTitle: t.settings.masterPrompts.businessSectionTitle,
        businessHint: t.settings.masterPrompts.businessHint,
        businessPlaceholder: t.settings.masterPrompts.businessPlaceholder,
        clientLabel: t.settings.masterPrompts.clientLabel,
        clientPlaceholder: t.settings.masterPrompts.clientPlaceholder,
        saveGlobal: t.settings.masterPrompts.saveGlobal,
        saveBusiness: t.settings.masterPrompts.saveBusiness,
        saving: t.settings.masterPrompts.saving,
        characterCount: t.settings.masterPrompts.characterCount,
        toastGlobalSuccess: t.settings.masterPrompts.toastGlobalSuccess,
        toastBusinessSuccess: t.settings.masterPrompts.toastBusinessSuccess,
        backDashboard: t.settings.masterPrompts.backDashboard,
        loadError: t.settings.masterPrompts.loadError,
        errors: t.settings.masterPrompts.errors,
      }}
    />
  );
}
