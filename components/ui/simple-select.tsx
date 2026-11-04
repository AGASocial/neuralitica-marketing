"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SimpleSelectOption<T extends string = string> = {
  label: string;
  value: T;
  disabled?: boolean;
};

type SimpleSelectProps<T extends string> = {
  id?: string;
  value: T | null | undefined;
  options: SimpleSelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/** Options-array wrapper over the shadcn Select (replaces PrimeReact Dropdown). */
function SimpleSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: SimpleSelectProps<T>) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => onChange(next as T)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { SimpleSelect };
