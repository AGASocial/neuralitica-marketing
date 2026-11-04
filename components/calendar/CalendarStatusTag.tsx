"use client";

import { RefreshCw } from "lucide-react";

import {
  CAMPANA_BADGE_CLASS,
  mapPipelineStatusToReelBadge,
} from "@/components/campana/pipeline-badge";
import { Badge } from "@/components/ui/badge";
import type { CalendarPipelineStatus } from "@/lib/contracts/calendar";
import { cn } from "@/lib/utils";

type CalendarStatusTagProps = {
  status: CalendarPipelineStatus;
  label: string;
  changesRequested?: boolean;
  changesRequestedLabel?: string;
};

export function CalendarStatusTag({
  status,
  label,
  changesRequested = false,
  changesRequestedLabel,
}: CalendarStatusTagProps) {
  const badge = mapPipelineStatusToReelBadge(status);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        data-status={status}
        className={cn("font-bold", CAMPANA_BADGE_CLASS[badge])}
      >
        {label}
      </Badge>
      {status === "pending" && changesRequested && changesRequestedLabel ? (
        <Badge
          variant="outline"
          className="border-butter/50 bg-butter/15 text-[11px] text-butter"
        >
          <RefreshCw aria-hidden />
          {changesRequestedLabel}
        </Badge>
      ) : null}
    </div>
  );
}
