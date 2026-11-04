import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { requireActive } from "@/lib/auth/require-user";
import { resolveRequestLocale } from "@/lib/i18n/resolve-request-locale";

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
  const locale = await resolveRequestLocale(user.preferredLocale);

  return (
    <AppShell locale={locale} user={user}>
      {children}
    </AppShell>
  );
}
