import { cn } from "@/lib/utils";

type IndeterminateProgressProps = {
  /** Accessible name for the busy indicator. */
  label: string;
  className?: string;
};

/** Indeterminate busy bar (replaces PrimeReact ProgressBar mode="indeterminate"). */
function IndeterminateProgress({ label, className }: IndeterminateProgressProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-busy="true"
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-edge", className)}
    >
      <div className="h-full w-1/3 animate-pulse rounded-full bg-butter motion-reduce:animate-none" />
    </div>
  );
}

export { IndeterminateProgress };
