import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { OwnerComposer } from "@/components/layout/OwnerComposer";
import { OwnerMobileTabBar } from "@/components/layout/OwnerMobileTabBar";
import { OrchestratorChatProvider } from "@/components/orchestrator-chat/OrchestratorChatContext";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { getTranslations } from "@/lib/i18n/get-translations";
import { loadSuggestedPromptChips } from "@/lib/orchestrator-chat/load-suggested-prompt-chips";

type AppShellProps = {
  locale: "en" | "es";
  user: CurrentUser;
  children: ReactNode;
};

export async function AppShell({ locale, user, children }: AppShellProps) {
  const t = getTranslations(locale);
  const suggestedChips = await loadSuggestedPromptChips({ user, locale });

  const tabs = [
    { id: "hoy" as const, href: "/dashboard", label: t.header.nav.home },
    {
      id: "campaign" as const,
      href: "/approvals",
      label: t.header.nav.myCampaign,
    },
    {
      id: "videos" as const,
      href: "/ready-to-publish",
      label: t.header.nav.myVideos,
    },
    {
      id: "business" as const,
      href: "/profile",
      label: t.header.nav.myBusiness,
    },
  ];

  return (
    <OrchestratorChatProvider>
      <div className="flex min-h-screen flex-col bg-deep text-fog">
        <AppHeader
          locale={locale}
          user={user}
          suggestedChips={suggestedChips}
        />
        {/*
          Mobile clearance ≈ tab bar (3.5rem + safe-area) + single-row composer
          (chips row + input). Keeps Hoy feed cards tappable above sticky chrome.
        */}
        <main className="flex-1 overflow-x-hidden px-4 py-6 pb-[calc(11.5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-28 lg:px-8">
          {children}
        </main>
        <div className="sticky bottom-0 z-30 md:static">
          <OwnerComposer
            locale={locale}
            suggestedChips={suggestedChips}
            prominent
            className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
            copy={{
              placeholder: t.orchestratorChat.layoutPlaceholder,
              send: t.orchestratorChat.send,
              micLabel: t.orchestratorChat.micLabel,
              micListening: t.orchestratorChat.micListening,
              suggestedPrompts: {
                listAriaLabel: t.orchestratorChat.suggestedPrompts.listAriaLabel,
              },
            }}
          />
        </div>
        <OwnerMobileTabBar
          tabs={tabs}
          ariaLabel={t.header.mobileTabBarAriaLabel}
        />
      </div>
    </OrchestratorChatProvider>
  );
}
