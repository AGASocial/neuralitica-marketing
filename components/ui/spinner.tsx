import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Loader2Icon>, "ref">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden
      className={cn("size-6 animate-spin text-butter", className)}
      {...props}
    />
  );
}

export { Spinner };
