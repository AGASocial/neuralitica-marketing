import "server-only";

import {
  WEEKLY_CYCLE_STEP_KEYS,
  type WeeklyCyclePlanStep,
  type WeeklyCycleStepKey,
  type WeeklyCycleStepPlan,
} from "@/lib/contracts/weekly-cycle";

export { WEEKLY_CYCLE_STEP_KEYS };
export type { WeeklyCyclePlanStep, WeeklyCycleStepKey, WeeklyCycleStepPlan };

const refs: Record<WeeklyCycleStepKey, string> = {
  strategy: "generateContentStrategyForClient", scripts: "generateReelScriptsForClient",
  captions: "generateReelCaptionsForClient", primary_video: "createPrimaryVideoJobsForReelScript",
  tts: "synthesizeVoiceoverForReelScript", broll: "createBrollVideoJobs",
  assembly: "createAssemblyJobForReelScript", branding: "enqueueBrandingForAssembledReel",
  qa: "runQaForAssembledReelForClient", approval: "ensureApprovalQueueEntryForReel",
};

export function planWeeklyCycleSteps(params: { clientId: string; weekStart: string }): WeeklyCycleStepPlan {
  return { dryRun: true, clientId: params.clientId, weekStart: params.weekStart, invokedBy: "system", steps: WEEKLY_CYCLE_STEP_KEYS.map((step) => ({ step, status: "planned", orchestratorRef: refs[step] })) };
}
