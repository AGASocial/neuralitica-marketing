import { FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS } from "@/lib/contracts/assembly-job";

const FORBIDDEN_ASSEMBLY_KEYS = new Set<string>([
  ...FORBIDDEN_ASSEMBLY_AUTHORITY_KEYS,
]);

export function findForbiddenAssemblyKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_ASSEMBLY_KEYS.has(key));
}
