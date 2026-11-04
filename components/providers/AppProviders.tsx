"use client";

import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

type AppProvidersProps = {
  children: ReactNode;
};

/** App-wide client providers for the Campaña / shadcn UI stack. */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
