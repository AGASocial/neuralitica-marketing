"use client";

import type { ReactNode } from "react";

import { PrimeProvider } from "@/components/providers/PrimeProvider";
import { Toaster } from "@/components/ui/sonner";

type AppProvidersProps = {
  children: ReactNode;
};

/**
 * App-wide client providers. PrimeReact remains until remaining screens are
 * migrated off primereact (phase 4); Toaster is the Campaña/shadcn path.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <PrimeProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </PrimeProvider>
  );
}
