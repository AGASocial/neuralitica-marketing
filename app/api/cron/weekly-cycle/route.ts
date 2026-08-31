import { findForbiddenWeeklyCycleCronKeys } from "@/lib/orchestration/find-forbidden-weekly-cycle-cron-keys";
import { resolveWeekStartForCycle } from "@/lib/orchestration/resolve-week-start-for-cycle";
import { runWeeklyCycleBatch } from "@/lib/orchestration/run-weekly-cycle-batch";
import { verifyCronSecret } from "@/lib/orchestration/verify-cron-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

async function handleWeeklyCycleCron(request: Request): Promise<Response> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers });

  let body: unknown = null;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.trim()) {
      try { body = JSON.parse(text); } catch { body = null; }
    }
  }
  if (findForbiddenWeeklyCycleCronKeys(body).length > 0) return Response.json({ error: "FORBIDDEN_FIELDS" }, { status: 400, headers });
  const result = await runWeeklyCycleBatch({ weekStart: resolveWeekStartForCycle(), mode: "cron", dryRun: true });
  return Response.json(result, { status: 200, headers });
}

export async function GET(request: Request): Promise<Response> { return handleWeeklyCycleCron(request); }
export async function POST(request: Request): Promise<Response> { return handleWeeklyCycleCron(request); }
