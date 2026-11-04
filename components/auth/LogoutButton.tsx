"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { logOut } from "@/lib/auth/actions/log-out";
import type { LogOutResult } from "@/lib/contracts/auth";
import { isLocale } from "@/lib/i18n/locales";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type LogoutButtonCopy = {
  label: string;
  pendingLabel: string;
  confirmHeader: string;
  confirmMessage: string;
  confirmAccept: string;
  confirmReject: string;
  stayError: string;
};

type LogoutButtonProps = {
  copy: LogoutButtonCopy;
  appearance?: "header" | "pending";
};

function localeFromCurrentUrl(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const locale = new URLSearchParams(window.location.search).get("locale");
  return locale && isLocale(locale) ? locale : undefined;
}

function loginHref(redirectTo?: string): string {
  const base = redirectTo || "/login";
  const locale = localeFromCurrentUrl();
  if (!locale) {
    return base;
  }

  const url = new URL(base, window.location.origin);
  url.searchParams.set("locale", locale);
  return `${url.pathname}${url.search}`;
}

function shouldLeaveShell(result: LogOutResult): boolean {
  return result.ok || result.error.code === "INTERNAL_ERROR";
}

export function LogoutButton({
  copy,
  appearance = "pending",
}: LogoutButtonProps) {
  const router = useRouter();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [stayError, setStayError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    if (pendingRef.current) {
      return;
    }

    pendingRef.current = true;
    setStayError(null);
    setPending(true);

    try {
      const result = await logOut();

      if (shouldLeaveShell(result)) {
        router.push(loginHref(result.ok ? result.redirectTo : undefined));
        return;
      }

      pendingRef.current = false;
      setStayError(copy.stayError);
      setPending(false);
      setOpen(false);
    } catch {
      router.push(loginHref());
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {stayError ? (
        <Alert variant="destructive">
          <AlertDescription>{stayError}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant={appearance === "header" ? "ghost" : "outline"}
            size={appearance === "header" ? "sm" : "default"}
            disabled={pending}
            className="whitespace-nowrap"
          >
            {pending ? copy.pendingLabel : copy.label}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.confirmHeader}</AlertDialogTitle>
            <AlertDialogDescription>{copy.confirmMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{copy.confirmReject}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void handleLogout();
              }}
            >
              {pending ? copy.pendingLabel : copy.confirmAccept}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
