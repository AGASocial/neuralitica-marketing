import { DashboardView } from "@/components/dashboard/DashboardView";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations, resolveLocale } from "@/lib/i18n/get-translations";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const locale = resolveLocale(user?.preferredLocale);
  const t = getTranslations(locale);
  const supabaseReady = isSupabaseConfigured();

  const cards = [
    { ...t.dashboard.interviewCard, href: "/interview" },
    t.dashboard.profileCard,
    t.dashboard.approvalsCard,
    t.dashboard.productionCard,
  ];

  return (
    <DashboardView
      title={t.dashboard.title}
      subtitle={t.dashboard.subtitle}
      setupBanner={supabaseReady ? undefined : t.dashboard.setupBanner}
      cards={cards}
    />
  );
}
