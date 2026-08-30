import "server-only";

import { createBrandingJobForAssembly } from "./create-branding-job-for-assembly";

/**
 * Auto-chain branding after assembly completes (US-9.2).
 * Invoked from applyAssemblyJobUpdate when status → completed.
 */
export async function onAssemblyJobCompleted(input: {
  assemblyJobId: string;
}): Promise<void> {
  const result = await createBrandingJobForAssembly({
    assemblyJobId: input.assemblyJobId,
    source: "auto_chain",
  });

  if (!result.ok) {
    console.error("[branding] auto-chain enqueue failed", {
      assemblyJobId: input.assemblyJobId,
      code: result.error.code,
    });
  }
}
