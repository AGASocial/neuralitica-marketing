"use client";

import type { CSSProperties } from "react";
import { Tag } from "primereact/tag";

import type { CalendarPipelineStatus } from "@/lib/contracts/calendar";

type CalendarStatusTagProps = {
  status: CalendarPipelineStatus;
  label: string;
  changesRequested?: boolean;
  changesRequestedLabel?: string;
};

const STATUS_STYLE: Record<
  CalendarPipelineStatus,
  { severity?: "success" | "info" | "warning" | "secondary"; style?: CSSProperties }
> = {
  draft: { severity: "secondary" },
  generating: { severity: "info" },
  qa: { severity: "warning" },
  pending: {
    style: {
      background: "#ea580c",
      color: "#ffffff",
    },
  },
  approved: { severity: "success" },
  published: {
    style: {
      background: "#7c3aed",
      color: "#ffffff",
    },
  },
};

export function CalendarStatusTag({
  status,
  label,
  changesRequested = false,
  changesRequestedLabel,
}: CalendarStatusTagProps) {
  const config = STATUS_STYLE[status];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
      <Tag value={label} severity={config.severity} style={config.style} />
      {status === "pending" && changesRequested && changesRequestedLabel ? (
        <Tag
          value={changesRequestedLabel}
          severity="warning"
          icon="pi pi-refresh"
          style={{ fontSize: "0.75rem" }}
        />
      ) : null}
    </div>
  );
}
