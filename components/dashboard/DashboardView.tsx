"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";

export type DashboardCard = {
  title: string;
  body: string;
  cta: string;
  href?: string;
  /** When true, show body as an error alert and omit the CTA link */
  error?: boolean;
};

type DashboardViewProps = {
  title: string;
  subtitle: string;
  setupBanner?: {
    title: string;
    body: string;
  };
  cards: DashboardCard[];
};

export function DashboardView({
  title,
  subtitle,
  setupBanner,
  cards,
}: DashboardViewProps) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-4xl text-fog sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-dim">{subtitle}</p>
      </div>

      {setupBanner ? (
        <StatusAlert
          severity="info"
          className="mb-6"
          text={`${setupBanner.title}: ${setupBanner.body}`}
        />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="gap-4 border-edge bg-panel py-5">
            <CardHeader className="px-5">
              <CardTitle className="font-display text-2xl font-normal text-fog">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 px-5">
              {card.error ? (
                <StatusAlert severity="error" text={card.body} />
              ) : (
                <p className="text-dim">{card.body}</p>
              )}
              {card.href && !card.error ? (
                <Button asChild className="mt-auto w-fit rounded-full">
                  <Link href={card.href}>{card.cta}</Link>
                </Button>
              ) : card.error ? null : (
                <p className="mt-auto text-sm text-dim">{card.cta}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
