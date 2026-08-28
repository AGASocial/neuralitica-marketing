import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

type SetNewPasswordLayoutProps = {
  children: ReactNode;
};

export default function SetNewPasswordLayout({
  children,
}: SetNewPasswordLayoutProps) {
  return children;
}
