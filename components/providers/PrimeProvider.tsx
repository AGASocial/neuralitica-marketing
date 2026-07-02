"use client";

import { PrimeReactProvider } from "primereact/api";
import type { ReactNode } from "react";

type PrimeProviderProps = {
  children: ReactNode;
};

export function PrimeProvider({ children }: PrimeProviderProps) {
  return <PrimeReactProvider>{children}</PrimeReactProvider>;
}
