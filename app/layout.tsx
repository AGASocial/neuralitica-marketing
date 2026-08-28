import type { Metadata } from "next";

import "@/lib/auth/assert-dev-fallback";
import { PrimeProvider } from "@/components/providers/PrimeProvider";

import "primeicons/primeicons.css";
import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neuralitica Marketing",
  description: "AI-powered content production for local service providers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PrimeProvider>{children}</PrimeProvider>
      </body>
    </html>
  );
}
