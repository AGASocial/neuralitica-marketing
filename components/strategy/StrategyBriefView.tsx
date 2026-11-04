"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type {
  ContentStrategyBrief,
  ContentStrategyDayOfWeek,
  ContentStrategySlot,
  ContentStrategySlotGoal,
} from "@/lib/contracts/content-strategy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import { cn } from "@/lib/utils";

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

const GOAL_BADGE_CLASS: Record<ContentStrategySlotGoal, string> = {
  trust: "border-info/40 bg-info/15 text-info",
  education: "border-success/40 bg-success/15 text-success",
  local_sale: "border-butter/50 bg-butter/15 text-butter",
  inbound_dm: "border-rose/50 bg-rose/15 text-rose",
};

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
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-dim">
        {label}
      </div>
      {children ?? <div className="leading-relaxed text-fog">{value}</div>}
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
    <Card className="gap-4 border-edge bg-panel py-5">
      <CardHeader className="px-5">
        <CardTitle className="font-display text-2xl font-normal text-fog">
          {`${copy.slot.slotNumber} ${slot.slotIndex + 1}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <Field label={copy.slot.tema} value={slot.tema} />
          <Field label={copy.slot.formato} value={formatoLabel} />
          <Field
            label={copy.slot.modalidad}
            value={copy.modalities[slot.modalidad]}
          />
          <Field label={copy.slot.goal}>
            <Badge
              variant="outline"
              className={cn(GOAL_BADGE_CLASS[slot.goal])}
            >
              {copy.goals[slot.goal]}
            </Badge>
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
                <Input
                  value={slot.angle ?? ""}
                  className="border-edge bg-deep text-fog"
                  onChange={(event) =>
                    onSlotFieldChange?.(slot.slotIndex, "angle", event.target.value)
                  }
                />
              </Field>
              <Field label={copy.slot.ctaHint}>
                <Input
                  value={slot.ctaHint ?? ""}
                  className="border-edge bg-deep text-fog"
                  onChange={(event) =>
                    onSlotFieldChange?.(slot.slotIndex, "ctaHint", event.target.value)
                  }
                />
              </Field>
            </>
          ) : (
            <>
              {slot.angle ? (
                <Field label={copy.slot.angle} value={slot.angle} />
              ) : null}
              {slot.ctaHint ? (
                <Field label={copy.slot.ctaHint} value={slot.ctaHint} />
              ) : null}
            </>
          )}
        </div>
      </CardContent>
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
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 font-display text-2xl text-fog">
          {copy.sections.pillars}
        </h2>
        <div className="flex flex-wrap gap-2">
          {brief.pillars.map((pillar) => (
            <Badge
              key={pillar}
              variant="outline"
              className="border-edge bg-panel text-fog"
            >
              {pillar}
            </Badge>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-fog">{copy.sections.themes}</h2>
          {isEditable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full border-edge bg-transparent text-fog hover:bg-panel hover:text-fog"
              disabled={brief.themes.length >= 8}
              onClick={addTheme}
            >
              <Plus aria-hidden />
              {copy.themes.add}
            </Button>
          ) : null}
        </div>
        {isEditable ? (
          <div className="flex flex-col gap-2">
            {brief.themes.map((theme, index) => (
              <div key={`theme-${index}`} className="flex items-center gap-2">
                <Input
                  value={theme}
                  className="flex-1 border-edge bg-panel text-fog"
                  onChange={(event) => updateTheme(index, event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-rose hover:text-rose"
                  aria-label={copy.themes.remove}
                  disabled={brief.themes.length <= 1}
                  onClick={() => removeTheme(index)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-fog marker:text-butter">
            {brief.themes.map((theme) => (
              <li key={theme}>{theme}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl text-fog">{copy.sections.slots}</h2>
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
