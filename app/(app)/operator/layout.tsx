import type { ReactNode } from "react";

import { requireOperator } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

type OperatorLayoutProps = {
  children: ReactNode;
};

/** Operator gate only — AppShell comes from `(app)/layout.tsx`. */
export default async function OperatorLayout({ children }: OperatorLayoutProps) {
  await requireOperator("page");
  return children;
}
