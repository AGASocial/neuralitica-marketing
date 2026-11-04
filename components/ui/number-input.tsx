"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type NumberInputProps = {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  /** Value used while the field is empty (mirrors the legacy `?? default`). */
  fallback: number;
  /** Optional unit rendered inside the field (e.g. "s"). */
  suffix?: string;
  disabled?: boolean;
  className?: string;
};

/** Bounded numeric field with an optional unit suffix (replaces PrimeReact InputNumber). */
function NumberInput({
  id,
  value,
  onValueChange,
  min,
  max,
  fallback,
  suffix,
  disabled,
  className,
}: NumberInputProps) {
  return (
    <div className={cn("relative w-40", className)}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = event.target.valueAsNumber;
          onValueChange(Number.isNaN(parsed) ? fallback : parsed);
        }}
        onBlur={() => onValueChange(Math.min(max, Math.max(min, value)))}
        disabled={disabled}
        className={suffix ? "pr-8" : undefined}
      />
      {suffix ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-dim"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export { NumberInput };
