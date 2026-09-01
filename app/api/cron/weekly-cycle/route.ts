import { handleWeeklyCycleCron } from "@/lib/orchestration/handle-weekly-cycle-cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleWeeklyCycleCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleWeeklyCycleCron(request);
}
