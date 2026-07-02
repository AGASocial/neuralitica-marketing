import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/AppHeader";

type AppShellProps = {
  locale: "en" | "es";
  children: ReactNode;
};

export function AppShell({ locale, children }: AppShellProps) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppHeader locale={locale} />
      <main style={{ flex: 1, padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
