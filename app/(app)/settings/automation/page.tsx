import { AutomationSettingsView } from "@/components/automation/AutomationSettingsView";
import { loadAutomationSettingsForClient } from "@/lib/automation/settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AutomationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const locale = await resolveRequestLocale(user.preferredLocale);
  const t = getTranslations(locale);
  const settings = await loadAutomationSettingsForClient(user.id);
  const copy = t.automationSettings;

  return (
    <AutomationSettingsView
      initial={settings}
      copy={{
        title: copy.title,
        subtitle: copy.subtitle,
        presetLabel: copy.presetLabel,
        reviewAll: copy.reviewAll,
        reviewAllHint: copy.reviewAllHint,
        autoPilot: copy.autoPilot,
        autoPilotHint: copy.autoPilotHint,
        custom: copy.custom,
        customHint: copy.customHint,
        weeklyCap: copy.weeklyCap,
        maxItem: copy.maxItem,
        reminders: copy.reminders,
        remind24: copy.remind24,
        remind48: copy.remind48,
        remind72: copy.remind72,
        save: copy.save,
        saving: copy.saving,
        success: copy.success,
        error: copy.error,
        centsHint: copy.centsHint,
      }}
    />
  );
}
