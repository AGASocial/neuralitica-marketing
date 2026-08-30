"use client";

import type { ReactNode } from "react";
import { Card } from "primereact/card";
import { Tag } from "primereact/tag";

import type {
  ContentStrategyBrief,
  ContentStrategyDayOfWeek,
  ContentStrategySlot,
  ContentStrategySlotGoal,
} from "@/lib/contracts/content-strategy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";

type StrategyBriefCopy = {
  sections: {
    pillars: string;
    themes: string;
    slots: string;
  };
  slot: {
    tema: string;
    formato: string;
    modalidad: string;
    tactica: string;
    goal: string;
    day: string;
    slotNumber: string;
  };
  goals: Record<ContentStrategySlotGoal, string>;
  days: Record<ContentStrategyDayOfWeek, string>;
  modalities: Record<VisualModality, string>;
};

type StrategyBriefViewProps = {
  brief: ContentStrategyBrief;
  playbookLabels?: Record<string, string>;
  copy: StrategyBriefCopy;
};

function goalSeverity(
  goal: ContentStrategySlotGoal,
): "success" | "info" | "warning" | "danger" | undefined {
  switch (goal) {
    case "trust":
      return "info";
    case "education":
      return "success";
    case "local_sale":
      return "warning";
    case "inbound_dm":
      return "danger";
    default:
      return undefined;
  }
}

function SlotCard({
  slot,
  playbookLabels,
  copy,
}: {
  slot: ContentStrategySlot;
  playbookLabels?: Record<string, string>;
  copy: StrategyBriefCopy;
}) {
  const formatoLabel =
    playbookLabels?.[slot.formatoPlaybookSlug] ?? slot.formatoPlaybookSlug;

  return (
    <Card
      style={{ marginBottom: "1rem" }}
      title={`${copy.slot.slotNumber} ${slot.slotIndex + 1}`}
    >
      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <Field label={copy.slot.tema} value={slot.tema} />
        <Field label={copy.slot.formato} value={formatoLabel} />
        <Field label={copy.slot.modalidad} value={copy.modalities[slot.modalidad]} />
        <Field label={copy.slot.goal}>
          <Tag value={copy.goals[slot.goal]} severity={goalSeverity(slot.goal)} />
        </Field>
        {slot.dayOfWeek ? (
          <Field label={copy.slot.day} value={copy.days[slot.dayOfWeek]} />
        ) : null}
        {slot.tacticaTendenciaSlug ? (
          <Field label={copy.slot.tactica} value={slot.tacticaTendenciaSlug} />
        ) : null}
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: "0.25rem",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </div>
      {children ?? (
        <div style={{ color: "#111827", lineHeight: 1.5 }}>{value}</div>
      )}
    </div>
  );
}

export function StrategyBriefView({
  brief,
  playbookLabels,
  copy,
}: StrategyBriefViewProps) {
  const sortedSlots = [...brief.slots].sort((a, b) => a.slotIndex - b.slotIndex);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.125rem" }}>
          {copy.sections.pillars}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {brief.pillars.map((pillar) => (
            <Tag key={pillar} value={pillar} severity="secondary" />
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.125rem" }}>
          {copy.sections.themes}
        </h2>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#374151" }}>
          {brief.themes.map((theme) => (
            <li key={theme} style={{ marginBottom: "0.35rem" }}>
              {theme}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.125rem" }}>
          {copy.sections.slots}
        </h2>
        {sortedSlots.map((slot) => (
          <SlotCard
            key={slot.slotIndex}
            slot={slot}
            playbookLabels={playbookLabels}
            copy={copy}
          />
        ))}
      </section>
    </div>
  );
}
