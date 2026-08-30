"use server";

import type {
  ApplyBrandingForAssemblyRequest,
  ApplyBrandingForAssemblyResult,
} from "@/lib/contracts/branding-job";

/**
 * Operator branding apply / re-brand (US-9.2).
 * Implementation: nextjs-backend — replace stub when BE lands.
 */
export async function applyBrandingForAssembly(
  _input: ApplyBrandingForAssemblyRequest,
): Promise<ApplyBrandingForAssemblyResult> {
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR" },
  };
}
