"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption<T extends string = string> = {
  label: string;
  value: T;
};

type MultiSelectProps<T extends string> = {
  id: string;
  value: T[];
  options: MultiSelectOption<T>[];
  onChange: (value: T[]) => void;
  disabled?: boolean;
  /** Shown in the trigger while nothing is selected. */
  placeholder?: string;
  className?: string;
};

/** Checkbox popover multi-select with chip display (replaces PrimeReact MultiSelect). */
function MultiSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  placeholder,
  className,
}: MultiSelectProps<T>) {
  const selected = options.filter((option) => value.includes(option.value));

  function toggle(optionValue: T, checked: boolean) {
    const next = checked
      ? [...value.filter((entry) => entry !== optionValue), optionValue]
      : value.filter((entry) => entry !== optionValue);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            "flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            className,
          )}
        >
          <span className="flex flex-wrap gap-1.5">
            {selected.length > 0 ? (
              selected.map((option) => (
                <Badge
                  key={option.value}
                  variant="outline"
                  className="border-edge bg-panel text-fog"
                >
                  {option.label}
                </Badge>
              ))
            ) : (
              <span className="text-dim">{placeholder}</span>
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) border-edge bg-panel p-2"
      >
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {options.map((option) => {
            const optionId = `${id}-${option.value}`;
            return (
              <li key={option.value}>
                <label
                  htmlFor={optionId}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-fog hover:bg-edge/40"
                >
                  <Checkbox
                    id={optionId}
                    checked={value.includes(option.value)}
                    onCheckedChange={(checked) =>
                      toggle(option.value, checked === true)
                    }
                  />
                  {option.label}
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export { MultiSelect };
