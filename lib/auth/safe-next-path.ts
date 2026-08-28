import "server-only";

const DASHBOARD = "/dashboard";
const MAX_NEXT_LENGTH = 2048;

function tryDecodePath(value: string): string | null {
  try {
    let current = decodeURIComponent(value);
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(current);
      if (next === current) {
        break;
      }
      current = next;
    }
    return current;
  } catch {
    return null;
  }
}

/**
 * Same-origin relative path only: single leading `/`, not `//`, no scheme,
 * no backslash. Encoded `//` / `\` are rejected after decoding.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  if (path.includes("\\") || path.includes("://") || /[\0\r\n]/.test(path)) {
    return false;
  }

  const colon = path.indexOf(":");
  const slash = path.indexOf("/");
  if (colon !== -1 && (slash === -1 || colon < slash)) {
    return false;
  }

  return true;
}

/** Sanitizes login `next`. Unsafe / absent → `/dashboard` (inactive login ignores this). */
export function sanitizeLoginNext(next: string | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_NEXT_LENGTH) {
    return DASHBOARD;
  }

  const decoded = tryDecodePath(next);
  if (!decoded) {
    return DASHBOARD;
  }

  if (!isSafeRelativePath(next) || !isSafeRelativePath(decoded)) {
    return DASHBOARD;
  }

  return next;
}
