"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CampanaScriptItem = {
  id: string;
  meta: string;
  statusLabel: string;
  statusTone: "butter" | "rose" | "dim";
  hook: string;
  href: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
};

type ScriptsSidePanelCopy = {
  heading: string;
  totalLabel: string;
  strategyHeading: string;
};

type ScriptsSidePanelProps = {
  copy: ScriptsSidePanelCopy;
  totalCount: number;
  items: CampanaScriptItem[];
  strategyBody?: string | null;
  className?: string;
};

const toneClass = {
  butter: "text-butter",
  rose: "text-rose",
  dim: "text-dim",
} as const;

export function ScriptsSidePanel({
  copy,
  totalCount,
  items,
  strategyBody,
  className,
}: ScriptsSidePanelProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden border-edge bg-panel/50 p-5 lg:border-l",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-3xl text-fog">{copy.heading}</h2>
        <span className="text-sm text-dim">{copy.totalLabel.replace("{count}", String(totalCount))}</span>
      </div>

      <ul className="mt-5 space-y-3 overflow-y-auto pr-1">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "rounded-xl bg-panel p-4",
              item.statusTone === "butter" && "border border-butter/60",
            )}
          >
            <div className="flex justify-between gap-2 text-xs">
              <span className={cn("font-bold", toneClass[item.statusTone])}>
                {item.meta}
              </span>
              <span className="text-dim">{item.statusLabel}</span>
            </div>
            <p className="mt-2 font-display text-xl leading-snug text-fog">
              “{item.hook}”
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.primaryActionLabel ? (
                <Button asChild size="sm" className="rounded-full">
                  <Link href={item.href}>{item.primaryActionLabel}</Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link href={item.href}>{item.secondaryActionLabel ?? item.statusLabel}</Link>
                </Button>
              )}
              {item.secondaryActionLabel && item.primaryActionLabel ? (
                <Button asChild size="sm" variant="outline" className="rounded-full">
                  <Link href={item.href}>{item.secondaryActionLabel}</Link>
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {strategyBody ? (
        <div className="mt-5 rounded-xl border border-edge p-4">
          <p className="text-sm font-semibold text-fog">{copy.strategyHeading}</p>
          <p className="mt-1 text-sm leading-relaxed text-dim">{strategyBody}</p>
        </div>
      ) : null}
    </aside>
  );
}

export function ScriptStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "butter" | "rose" | "dim";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border-edge",
        tone === "butter" && "border-butter/50 text-butter",
        tone === "rose" && "border-rose/50 text-rose",
        tone === "dim" && "text-dim",
      )}
    >
      {label}
    </Badge>
  );
}
