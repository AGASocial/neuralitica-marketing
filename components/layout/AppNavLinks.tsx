"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type AppNavItem = {
  href: string;
  label: string;
};

type AppNavLinksProps = {
  items: AppNavItem[];
  className?: string;
  linkClassName?: string;
  ariaLabel: string;
};

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavLinks({
  items,
  className,
  linkClassName,
  ariaLabel,
}: AppNavLinksProps) {
  const pathname = usePathname() ?? "/";

  return (
    <nav aria-label={ariaLabel} className={className}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 transition-colors focus-visible:outline-none",
              active
                ? "bg-panel font-semibold text-fog"
                : "text-dim hover:bg-panel/60 hover:text-fog",
              linkClassName,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
