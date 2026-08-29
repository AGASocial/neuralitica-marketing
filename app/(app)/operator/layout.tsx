import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { requireOperator } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/i18n/get-translations";

export const dynamic = "force-dynamic";

type OperatorLayoutProps = {
  children: ReactNode;
};

export default async function OperatorLayout({ children }: OperatorLayoutProps) {
  const user = await requireOperator("page");
  const locale = resolveLocale(user.preferredLocale);

  return (
    <AppShell locale={locale} user={user}>
      {children}
    </AppShell>
  );
}
