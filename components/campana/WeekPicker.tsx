"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { es } from "react-day-picker/locale/es";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

type WeekPickerProps = {
  /** Id for the trigger so an external `<Label htmlFor>` can target it. */
  id: string;
  /** ISO Monday (YYYY-MM-DD). */
  weekStart: string;
  locale: string;
  /** Called with the ISO Monday of the picked day. */
  onSelectWeek: (weekStart: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Local-midnight date for a YYYY-MM-DD string (DayPicker works in local time). */
function isoToLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** shadcn Popover + Calendar week picker (replaces PrimeReact Calendar). */
export function WeekPicker({
  id,
  weekStart,
  locale,
  onSelectWeek,
  disabled = false,
  className,
}: WeekPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = isoToLocalDate(weekStart);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 border-edge bg-panel font-normal text-fog hover:bg-edge hover:text-fog",
            className,
          )}
        >
          <CalendarIcon className="size-4 text-dim" aria-hidden />
          {weekStart}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-edge bg-panel p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          locale={locale.toLowerCase().startsWith("es") ? es : undefined}
          onSelect={(date) => {
            if (!date) {
              return;
            }
            setOpen(false);
            onSelectWeek(normalizeToIsoMonday(date));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
