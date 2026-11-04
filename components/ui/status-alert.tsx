import * as React from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type StatusSeverity = "info" | "success" | "warn" | "error";

const severityVariant = {
  info: "info",
  success: "success",
  warn: "warning",
  error: "destructive",
} as const;

type StatusAlertProps = Omit<React.ComponentProps<"div">, "children"> & {
  severity?: StatusSeverity;
  /** Plain text body. Ignored when `children` is provided. */
  text?: React.ReactNode;
  /** Optional leading icon node (e.g. a lucide icon). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
};

/** Alert wrapper that maps legacy severity names (info/success/warn/error). */
function StatusAlert({
  severity = "info",
  text,
  icon,
  children,
  className,
  ...props
}: StatusAlertProps) {
  return (
    <Alert
      variant={severityVariant[severity]}
      className={cn("text-fog", className)}
      {...props}
    >
      {icon ? (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
          <AlertDescription className="text-fog">{children ?? text}</AlertDescription>
        </div>
      ) : (
        <AlertDescription className="text-fog">{children ?? text}</AlertDescription>
      )}
    </Alert>
  );
}

export { StatusAlert };
