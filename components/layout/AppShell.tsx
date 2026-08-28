import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";
import type { CurrentUser } from "@/lib/auth/get-current-user";

type AppShellProps = {
  locale: "en" | "es";
  user: CurrentUser;
  children: ReactNode;
};

export function AppShell({ locale, user, children }: AppShellProps) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader locale={locale} user={user} />
      <main style={{ flex: 1, padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
