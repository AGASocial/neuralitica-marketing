import type { Metadata } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";

import "@/lib/auth/assert-dev-fallback";
import { AppProviders } from "@/components/providers/AppProviders";

import "primeicons/primeicons.css";
import "primereact/resources/themes/lara-light-blue/theme.css";
import "primereact/resources/primereact.min.css";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

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
    <html lang="en" className="dark">
      <body className={`${manrope.variable} ${instrumentSerif.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
