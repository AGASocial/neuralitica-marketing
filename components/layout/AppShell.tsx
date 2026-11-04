import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import { OrchestratorChatProvider } from "@/components/orchestrator-chat/OrchestratorChatContext";
import type { CurrentUser } from "@/lib/auth/get-current-user";

type AppShellProps = {
  locale: "en" | "es";
  user: CurrentUser;
  children: ReactNode;
};

export async function AppShell({ locale, user, children }: AppShellProps) {
  return (
    <OrchestratorChatProvider>
      <div className="flex min-h-screen flex-col bg-deep text-fog">
        <AppHeader locale={locale} user={user} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </OrchestratorChatProvider>
  );
}
