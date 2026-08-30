"use server";

import type { AssembleReelForScriptResult } from "@/lib/contracts/assembly-job";
import { createAssemblyJobForReelScript } from "@/lib/assembly/create-assembly-job-for-reel-script";

/**
 * Operator assemble action (US-9.1).
 * Frontend consumer: `/operator/scripts` expand row — Assemble Reel / Re-assemble.
 */
export async function assembleReelForScript(
  rawInput: unknown,
): Promise<AssembleReelForScriptResult> {
  return createAssemblyJobForReelScript(rawInput);
}
