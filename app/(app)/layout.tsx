import type { ReactNode } from "react";

import { requireActive } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

/**
 * Product route group. URL paths stay `/` and `/dashboard`.
 * New pages under `app/(app)/` inherit `requireActive("page")`.
 * Auth pages and `/pending` stay outside this group.
 */
export default async function AppLayout({ children }: AppLayoutProps) {
  await requireActive("page");
  return children;
}
