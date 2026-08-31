import "server-only";

import { acquireWeeklyCycleRun, type WeeklyCycleRunMode } from "@/lib/orchestration/acquire-weekly-cycle-run";
import { persistWeeklyCycleRunPlan } from "@/lib/orchestration/persist-weekly-cycle-run-plan";
import { planWeeklyCycleSteps, type WeeklyCycleStepPlan } from "@/lib/orchestration/plan-weekly-cycle-steps";

export type RunWeeklyCycleForClientParams = { clientId: string; weekStart: string; invokedBy: "system"; mode: WeeklyCycleRunMode; dryRun: true };
export type RunWeeklyCycleForClientResult =
  | { ok: true; runId: string; weekStart: string; clientId: string; status: "dry_run"; acquireOutcome: "CREATED" | "ALREADY_EXISTS"; plan: WeeklyCycleStepPlan }
  | { ok: false; error: { code: "INTERNAL_ERROR" } };

type RunWeeklyCycleForClientDependencies = {
  acquire: typeof acquireWeeklyCycleRun;
  persist: typeof persistWeeklyCycleRunPlan;
  plan: typeof planWeeklyCycleSteps;
};

const defaultDependencies: RunWeeklyCycleForClientDependencies = {
  acquire: acquireWeeklyCycleRun,
  persist: persistWeeklyCycleRunPlan,
  plan: planWeeklyCycleSteps,
};

export async function runWeeklyCycleForClient(
  params: RunWeeklyCycleForClientParams,
  dependencies: RunWeeklyCycleForClientDependencies = defaultDependencies,
): Promise<RunWeeklyCycleForClientResult> {
  if (params.dryRun !== true) return { ok: false, error: { code: "INTERNAL_ERROR" } };
  try {
    const acquired = await dependencies.acquire(params);
    const plan = dependencies.plan(params);
    await dependencies.persist(acquired.runId, plan.steps);
    return { ok: true, runId: acquired.runId, weekStart: params.weekStart, clientId: params.clientId, status: "dry_run", acquireOutcome: acquired.outcome, plan };
  } catch {
    return { ok: false, error: { code: "INTERNAL_ERROR" } };
  }
}
