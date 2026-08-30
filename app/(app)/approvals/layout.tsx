import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { requireActive } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type ApprovalsLayoutProps = {
  children: ReactNode;
};

export default async function ApprovalsLayout({
  children,
}: ApprovalsLayoutProps) {
  const user = await requireActive("page");
  const locale = resolveLocale(user.preferredLocale);

  return (
    <AppShell locale={locale} user={user}>
      {children}
    </AppShell>
  );
}
