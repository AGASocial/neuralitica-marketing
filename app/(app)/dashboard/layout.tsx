import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { requireActive } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  // Parent `app/(app)/layout.tsx` already gated; React cache() makes this
  // a second call without a second Auth/DB round-trip. Needed for AppShell user.
  const user = await requireActive("page");
  const locale = resolveLocale(user.preferredLocale);

  return (
    <AppShell locale={locale} user={user}>
      {children}
    </AppShell>
  );
}
