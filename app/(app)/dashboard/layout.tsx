import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type PassthroughLayoutProps = {
  children: ReactNode;
};

/** AppShell is provided by `(app)/layout.tsx`. */
export default function DashboardLayout({ children }: PassthroughLayoutProps) {
  return children;
}
