import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeSeverity =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "secondary"
  | "contrast"
  | null
  | undefined;

const severityClass: Record<string, string> = {
  success: "border-success/40 bg-success/15 text-success",
  info: "border-info/40 bg-info/15 text-info",
  warning: "border-butter/50 bg-butter/15 text-butter",
  danger: "border-rose/50 bg-rose/15 text-rose",
  secondary: "border-edge bg-panel text-dim",
  contrast: "border-fog/40 bg-fog/10 text-fog",
};

type StatusBadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  severity?: StatusBadgeSeverity;
  value?: React.ReactNode;
  /** Optional leading icon node (e.g. a lucide icon). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
};

/** Badge wrapper that maps legacy tag severities to Campaña tones. */
function StatusBadge({
  severity,
  value,
  icon,
  children,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        severity ? severityClass[severity] : "border-edge bg-panel text-fog",
        className,
      )}
      {...props}
    >
      {icon}
      {children ?? value}
    </Badge>
  );
}

export { StatusBadge };
