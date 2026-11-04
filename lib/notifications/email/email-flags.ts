export function isOwnerEmailNotificationsEnabled(
  raw: string | undefined = process.env.OWNER_EMAIL_NOTIFICATIONS_ENABLED,
): boolean {
  return raw?.trim() === "true";
}

export function parseNotificationsAllowlist(
  raw: string | undefined = process.env.NOTIFICATIONS_TEST_ALLOWLIST,
): string[] | null {
  if (raw == null || raw.trim() === "") {
    return null;
  }
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveNotificationsFromEmail(
  raw: string | undefined = process.env.NOTIFICATIONS_FROM_EMAIL,
): string {
  const configured = raw?.trim();
  if (configured) {
    return configured;
  }
  return "Neuralitica <avisos@notification.aga.social>";
}

export function isRecipientAllowed(
  to: string,
  allowlistRaw?: string,
): boolean {
  const allowlist = parseNotificationsAllowlist(
    allowlistRaw ?? process.env.NOTIFICATIONS_TEST_ALLOWLIST,
  );
  if (!allowlist) {
    return true;
  }
  return allowlist.includes(to.trim().toLowerCase());
}
