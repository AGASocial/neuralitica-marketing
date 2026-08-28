"use client";

import { useEffect, useState } from "react";

import { PendingActivationView } from "@/components/auth/PendingActivationView";
import { readPendingIdentity } from "@/components/auth/pending-identity";

type PendingActivationClientProps = {
  title: string;
  body: string;
  emailLabel: string;
  logoutLabel: string;
};

const UNTRUSTED_IDENTITY_PARAMS = [
  "email",
  "displayName",
  "display_name",
  "client_id",
  "auth_user_id",
  "role",
  "active",
] as const;

function stripUntrustedIdentityParams(): void {
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of UNTRUSTED_IDENTITY_PARAMS) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  const query = params.toString();
  const next = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  window.history.replaceState(null, "", next);
}

export function PendingActivationClient({
  title,
  body,
  emailLabel,
  logoutLabel,
}: PendingActivationClientProps) {
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [displayName, setDisplayName] = useState<string | undefined>(undefined);

  useEffect(() => {
    stripUntrustedIdentityParams();
    const stored = readPendingIdentity();
    if (stored) {
      setEmail(stored.email);
      setDisplayName(stored.displayName);
    }
  }, []);

  return (
    <PendingActivationView
      title={title}
      body={body}
      emailLabel={emailLabel}
      email={email}
      displayName={displayName}
      logoutLabel={logoutLabel}
    />
  );
}
