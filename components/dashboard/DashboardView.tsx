"use client";

import Link from "next/link";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { Message } from "primereact/message";

export type DashboardCard = {
  title: string;
  body: string;
  cta: string;
  href?: string;
  /** When true, show body as an error Message and omit the CTA link */
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
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "2rem" }}>{title}</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>{subtitle}</p>
      </div>

      {setupBanner ? (
        <Message
          severity="info"
          text={`${setupBanner.title}: ${setupBanner.body}`}
          style={{ marginBottom: "1.5rem", width: "100%" }}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        {cards.map((card) => (
          <Card key={card.title} title={card.title}>
            {card.error ? (
              <Message
                severity="error"
                text={card.body}
                style={{ width: "100%", marginBottom: "0.75rem" }}
              />
            ) : (
              <p style={{ margin: "0 0 1rem", color: "#4b5563" }}>{card.body}</p>
            )}
            {card.href && !card.error ? (
              <Link href={card.href} style={{ textDecoration: "none" }}>
                <Button type="button" label={card.cta} />
              </Link>
            ) : card.error ? null : (
              <p style={{ margin: 0, color: "#6b7280" }}>{card.cta}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
