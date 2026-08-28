export type PendingIdentity = {
  email: string;
  displayName: string;
};

const STORAGE_KEY = "neuramark.pendingIdentity";

export function storePendingIdentity(identity: PendingIdentity): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Private mode / quota: pending page stays on generic copy.
  }
}

export function readPendingIdentity(): PendingIdentity | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !("email" in parsed) ||
      !("displayName" in parsed)
    ) {
      return null;
    }

    const email = parsed.email;
    const displayName = parsed.displayName;
    if (typeof email !== "string" || typeof displayName !== "string") {
      return null;
    }
    if (!email.trim() || !displayName.trim()) {
      return null;
    }

    return { email, displayName };
  } catch {
    return null;
  }
}
