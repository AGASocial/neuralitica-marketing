"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CurrencyInputProps = {
  id: string;
  /** Amount in major units (e.g. dollars). */
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  /** Currency symbol shown before the amount. */
  symbol?: string;
  disabled?: boolean;
  className?: string;
};

function parseAmount(text: string): number | null {
  const normalized = text.replace(",", ".").replace(/[^0-9.]/g, "");
  if (normalized === "" || normalized === ".") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Bounded decimal money field (replaces PrimeReact InputNumber currency mode). */
function CurrencyInput({
  id,
  value,
  onValueChange,
  min,
  max,
  symbol = "$",
  disabled,
  className,
}: CurrencyInputProps) {
  // `null` while not editing → display the committed value.
  const [draft, setDraft] = React.useState<string | null>(null);

  return (
    <div className={cn("relative w-full", className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-dim"
      >
        {symbol}
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft ?? value.toFixed(2)}
        onFocus={() => setDraft(value.toFixed(2))}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseAmount(event.target.value);
          if (parsed !== null) {
            onValueChange(parsed);
          }
        }}
        onBlur={() => {
          onValueChange(Math.min(max, Math.max(min, value)));
          setDraft(null);
        }}
        disabled={disabled}
        className="pl-7"
      />
    </div>
  );
}

export { CurrencyInput };
