import { findForbiddenWeeklyCycleCronKeys } from "@/lib/orchestration/find-forbidden-weekly-cycle-cron-keys";
import { resolveWeekStartForCycle } from "@/lib/orchestration/resolve-week-start-for-cycle";
import { runWeeklyCycleCronBatch } from "@/lib/orchestration/run-weekly-cycle-batch";
import { verifyCronSecret } from "@/lib/orchestration/verify-cron-secret";

const headers = { "Cache-Control": "no-store" };

export type WeeklyCycleCronDependencies = {
  verify: typeof verifyCronSecret;
  runBatch: typeof runWeeklyCycleCronBatch;
  resolveWeekStart: typeof resolveWeekStartForCycle;
};

const defaultDependencies: WeeklyCycleCronDependencies = {
  verify: verifyCronSecret,
  runBatch: runWeeklyCycleCronBatch,
  resolveWeekStart: resolveWeekStartForCycle,
};

export async function handleWeeklyCycleCron(
  request: Request,
  dependencies: WeeklyCycleCronDependencies = defaultDependencies,
): Promise<Response> {
  const auth = dependencies.verify(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers });
  }

  let body: unknown = null;
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "INVALID_JSON" }, { status: 400, headers });
    }
  }
  if (findForbiddenWeeklyCycleCronKeys(body).length > 0) {
    return Response.json({ error: "FORBIDDEN_FIELDS" }, { status: 400, headers });
  }
  const result = await dependencies.runBatch({
    weekStart: dependencies.resolveWeekStart(),
  });
  return Response.json(result, { status: 200, headers });
}
