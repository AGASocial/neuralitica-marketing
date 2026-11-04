"use client";

import { cn } from "@/lib/utils";

export type CampanaWeekStatus =
  | "published"
  | "inProgress"
  | "ready"
  | "planned"
  | "draft"
  | "approved";

export type CampanaWeekCell = {
  weekStart: string;
  title: string;
  subtitle: string;
  status: CampanaWeekStatus;
  selected?: boolean;
};

type WeeksStripCopy = {
  ariaLabel: string;
};

type WeeksStripProps = {
  weeks: CampanaWeekCell[];
  copy: WeeksStripCopy;
  onSelectWeek: (weekStart: string) => void;
  disabled?: boolean;
};

const statusBorder: Record<CampanaWeekStatus, string> = {
  published: "border-butter",
  inProgress: "border-rose",
  ready: "border-edge",
  planned: "border-edge",
  draft: "border-butter/70",
  approved: "border-success",
};

export function WeeksStrip({
  weeks,
  copy,
  onSelectWeek,
  disabled = false,
}: WeeksStripProps) {
  return (
    <div
      role="listbox"
      aria-label={copy.ariaLabel}
      className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-edge sm:grid-cols-4"
    >
      {weeks.map((week) => {
        const selected = week.selected === true;
        return (
          <button
            key={week.weekStart}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onSelectWeek(week.weekStart)}
            className={cn(
              "border-t-4 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-butter",
              statusBorder[week.status],
              selected ? "bg-panel" : "bg-deep/60 hover:bg-panel/80",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <p className="text-sm font-bold text-fog">{week.title}</p>
            <p className="mt-1 text-sm text-dim">{week.subtitle}</p>
          </button>
        );
      })}
    </div>
  );
}
