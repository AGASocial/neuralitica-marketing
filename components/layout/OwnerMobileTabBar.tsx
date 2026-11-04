"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClapperboardIcon,
  HomeIcon,
  LayoutGridIcon,
  StoreIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type OwnerMobileTab = {
  href: string;
  label: string;
  id: "hoy" | "campaign" | "videos" | "business";
};

type OwnerMobileTabBarProps = {
  tabs: OwnerMobileTab[];
  ariaLabel: string;
};

function iconFor(id: OwnerMobileTab["id"]) {
  switch (id) {
    case "hoy":
      return HomeIcon;
    case "campaign":
      return LayoutGridIcon;
    case "videos":
      return ClapperboardIcon;
    case "business":
      return StoreIcon;
    default:
      return HomeIcon;
  }
}

function isActive(pathname: string, href: string, id: OwnerMobileTab["id"]) {
  if (id === "hoy") {
    return pathname === "/dashboard" || pathname === "/";
  }
  if (id === "business") {
    return (
      pathname === "/profile" ||
      pathname.startsWith("/settings/preferences") ||
      pathname === "/interview"
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OwnerMobileTabBar({ tabs, ariaLabel }: OwnerMobileTabBarProps) {
  const pathname = usePathname() ?? "/dashboard";

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      data-testid="owner-mobile-tab-bar"
    >
      <ul className="grid grid-cols-4 gap-0 px-1 pt-1">
        {tabs.map((tab) => {
          const Icon = iconFor(tab.id);
          const active = isActive(pathname, tab.href, tab.id);
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 text-[0.65rem] transition-colors",
                  active ? "text-butter" : "text-dim hover:text-fog",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" aria-hidden />
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
