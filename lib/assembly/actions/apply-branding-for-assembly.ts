"use server";

import type {
  ApplyBrandingForAssemblyRequest,
  ApplyBrandingForAssemblyResult,
} from "@/lib/contracts/branding-job";
import { applyBrandingForAssemblyInner } from "@/lib/assembly/create-branding-job-for-assembly";

/**
 * Operator branding apply / re-brand (US-9.2).
 * Frontend consumer: `/operator/scripts` — Apply branding / Re-brand.
 */
export async function applyBrandingForAssembly(
  input: ApplyBrandingForAssemblyRequest,
): Promise<ApplyBrandingForAssemblyResult> {
  return applyBrandingForAssemblyInner(input);
}
