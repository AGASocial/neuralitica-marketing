import { FORBIDDEN_BRANDING_AUTHORITY_KEYS } from "@/lib/contracts/branding-job";

const FORBIDDEN_BRANDING_KEYS = new Set<string>([
  ...FORBIDDEN_BRANDING_AUTHORITY_KEYS,
]);

export function findForbiddenBrandingKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_BRANDING_KEYS.has(key));
}
