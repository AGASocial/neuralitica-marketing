"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppNavLink = {
  href: string;
  label: string;
};

export type AppNavGroup = {
  id: string;
  label: string;
  items: AppNavLink[];
};

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupActive(pathname: string, group: AppNavGroup): boolean {
  return group.items.some((item) => isActivePath(pathname, item.href));
}

type AppNavMenuProps = {
  primary: AppNavLink[];
  groups: AppNavGroup[];
  ariaLabel: string;
  className?: string;
  linkClassName?: string;
};

export function AppNavMenu({
  primary,
  groups,
  ariaLabel,
  className,
  linkClassName,
}: AppNavMenuProps) {
  const pathname = usePathname() ?? "/";

  return (
    <nav aria-label={ariaLabel} className={className}>
      {primary.map((item) => {
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

      {groups.map((group) => {
        const active = groupActive(pathname, group);
        return (
          <DropdownMenu key={group.id}>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 transition-colors focus-visible:outline-none",
                active
                  ? "bg-panel font-semibold text-fog"
                  : "text-dim hover:bg-panel/60 hover:text-fog",
                linkClassName,
              )}
            >
              {group.label}
              <ChevronDownIcon className="size-3.5 opacity-70" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-edge bg-panel text-fog"
            >
              {group.items.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className="cursor-pointer"
                    aria-current={
                      isActivePath(pathname, item.href) ? "page" : undefined
                    }
                  >
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
