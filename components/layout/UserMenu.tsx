"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  LogoutButton,
  type LogoutButtonCopy,
} from "@/components/auth/LogoutButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocalePreference } from "@/lib/i18n/actions/set-locale-preference";
import type { Locale } from "@/lib/i18n/locales";

export type UserMenuCopy = {
  menuAriaLabel: string;
  languageLabel: string;
  languageEs: string;
  languageEn: string;
  settings: string;
  logout: LogoutButtonCopy;
};

type UserMenuProps = {
  locale: Locale;
  displayName: string;
  email: string;
  copy: UserMenuCopy;
};

export function UserMenu({ locale, displayName, email, copy }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = displayName.slice(0, 1).toUpperCase() || "?";

  function onLocaleChange(next: string) {
    if (next !== "en" && next !== "es") {
      return;
    }
    if (next === locale) {
      return;
    }
    startTransition(async () => {
      const result = await setLocalePreference({ locale: next });
      if (!result.ok) {
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex h-9 max-w-[14rem] items-center gap-2 px-1.5 text-dim hover:text-fog"
          aria-label={copy.menuAriaLabel}
          disabled={pending}
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-edge bg-panel text-xs font-semibold text-butter"
            aria-hidden
          >
            {initial}
          </span>
          <span
            className="hidden min-w-0 truncate sm:inline"
            title={email}
          >
            <strong className="font-semibold text-fog">{displayName}</strong>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-dim">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{copy.languageLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={onLocaleChange}>
          <DropdownMenuRadioItem value="es" disabled={pending}>
            {copy.languageEs}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en" disabled={pending}>
            {copy.languageEn}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">{copy.settings}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-1 py-1">
          <LogoutButton appearance="header" copy={copy.logout} />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
