"use client";

import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Message } from "primereact/message";
import { useRef, useState } from "react";

import { logOut } from "@/lib/auth/actions/log-out";
import type { LogOutResult } from "@/lib/contracts/auth";
import { isLocale } from "@/lib/i18n/locales";

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
    } catch {
      router.push(loginHref());
    }
  }

  function askToLogOut() {
    if (pendingRef.current) {
      return;
    }

    confirmDialog({
      header: copy.confirmHeader,
      message: copy.confirmMessage,
      acceptLabel: copy.confirmAccept,
      rejectLabel: copy.confirmReject,
      icon: "pi pi-sign-out",
      accept: () => {
        void handleLogout();
      },
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        flexShrink: 0,
      }}
    >
      <ConfirmDialog />

      {stayError ? (
        <Message severity="error" text={stayError} style={{ width: "100%" }} />
      ) : null}

      <Button
        type="button"
        label={pending ? copy.pendingLabel : copy.label}
        icon="pi pi-sign-out"
        loading={pending}
        disabled={pending}
        text={appearance === "header"}
        outlined={appearance === "pending"}
        size={appearance === "header" ? "small" : undefined}
        style={{ whiteSpace: "nowrap" }}
        onClick={askToLogOut}
      />
    </div>
  );
}
