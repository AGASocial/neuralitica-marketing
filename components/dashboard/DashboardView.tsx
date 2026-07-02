"use client";

import { Card } from "primereact/card";
import { Message } from "primereact/message";

type DashboardCard = {
  title: string;
  body: string;
  cta: string;
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
          <Card key={card.title} title={card.title} subTitle={card.body}>
            <p style={{ margin: 0, color: "#6b7280" }}>{card.cta}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
