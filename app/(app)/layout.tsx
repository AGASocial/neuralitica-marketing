import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { requireActive } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

/**
 * Product route group. URL paths stay `/` and `/dashboard`.
 * All authenticated product pages share AppShell (header nav).
 * Auth pages and `/pending` stay outside this group.
 */
export default async function AppLayout({ children }: AppLayoutProps) {
  const user = await requireActive("page");
  const locale = resolveLocale(user.preferredLocale);

  return (
    <AppShell locale={locale} user={user}>
      {children}
    </AppShell>
  );
}
