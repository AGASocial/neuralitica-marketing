"use client";

import type { ReactNode } from "react";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { InputText } from "primereact/inputtext";
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
    angle: string;
    ctaHint: string;
  };
  themes: {
    add: string;
    remove: string;
  };
  goals: Record<ContentStrategySlotGoal, string>;
  days: Record<ContentStrategyDayOfWeek, string>;
  modalities: Record<VisualModality, string>;
};

type StrategyBriefViewProps = {
  brief: ContentStrategyBrief;
  playbookLabels?: Record<string, string>;
  copy: StrategyBriefCopy;
  isEditable?: boolean;
  onBriefChange?: (brief: ContentStrategyBrief) => void;
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

function SlotCard({
  slot,
  playbookLabels,
  copy,
  isEditable,
  onSlotFieldChange,
}: {
  slot: ContentStrategySlot;
  playbookLabels?: Record<string, string>;
  copy: StrategyBriefCopy;
  isEditable?: boolean;
  onSlotFieldChange?: (
    slotIndex: number,
    field: "angle" | "ctaHint",
    value: string,
  ) => void;
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
        {isEditable ? (
          <>
            <Field label={copy.slot.angle}>
              <InputText
                value={slot.angle ?? ""}
                onChange={(event) =>
                  onSlotFieldChange?.(slot.slotIndex, "angle", event.target.value)
                }
                style={{ width: "100%" }}
              />
            </Field>
            <Field label={copy.slot.ctaHint}>
              <InputText
                value={slot.ctaHint ?? ""}
                onChange={(event) =>
                  onSlotFieldChange?.(slot.slotIndex, "ctaHint", event.target.value)
                }
                style={{ width: "100%" }}
              />
            </Field>
          </>
        ) : (
          <>
            {slot.angle ? <Field label={copy.slot.angle} value={slot.angle} /> : null}
            {slot.ctaHint ? (
              <Field label={copy.slot.ctaHint} value={slot.ctaHint} />
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

export function StrategyBriefView({
  brief,
  playbookLabels,
  copy,
  isEditable = false,
  onBriefChange,
}: StrategyBriefViewProps) {
  const sortedSlots = [...brief.slots].sort((a, b) => a.slotIndex - b.slotIndex);

  function updateTheme(index: number, value: string) {
    if (!onBriefChange) {
      return;
    }
    const themes = [...brief.themes];
    themes[index] = value;
    onBriefChange({ ...brief, themes });
  }

  function addTheme() {
    if (!onBriefChange || brief.themes.length >= 8) {
      return;
    }
    onBriefChange({ ...brief, themes: [...brief.themes, ""] });
  }

  function removeTheme(index: number) {
    if (!onBriefChange || brief.themes.length <= 1) {
      return;
    }
    onBriefChange({
      ...brief,
      themes: brief.themes.filter((_, themeIndex) => themeIndex !== index),
    });
  }

  function updateSlotField(
    slotIndex: number,
    field: "angle" | "ctaHint",
    value: string,
  ) {
    if (!onBriefChange) {
      return;
    }
    const slots = brief.slots.map((slot) => {
      if (slot.slotIndex !== slotIndex) {
        return slot;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        const { [field]: _removed, ...rest } = slot;
        return rest as ContentStrategySlot;
      }
      return { ...slot, [field]: trimmed };
    });
    onBriefChange({ ...brief, slots });
  }

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>{copy.sections.themes}</h2>
          {isEditable ? (
            <Button
              type="button"
              label={copy.themes.add}
              icon="pi pi-plus"
              size="small"
              outlined
              disabled={brief.themes.length >= 8}
              onClick={addTheme}
            />
          ) : null}
        </div>
        {isEditable ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {brief.themes.map((theme, index) => (
              <div
                key={`theme-${index}`}
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <InputText
                  value={theme}
                  onChange={(event) => updateTheme(index, event.target.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  type="button"
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  aria-label={copy.themes.remove}
                  disabled={brief.themes.length <= 1}
                  onClick={() => removeTheme(index)}
                />
              </div>
            ))}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#374151" }}>
            {brief.themes.map((theme) => (
              <li key={theme} style={{ marginBottom: "0.35rem" }}>
                {theme}
              </li>
            ))}
          </ul>
        )}
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
            isEditable={isEditable}
            onSlotFieldChange={updateSlotField}
          />
        ))}
      </section>
    </div>
  );
}
