import { handleVideoJobsCron } from "@/lib/video-jobs/handle-video-jobs-cron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Allow enough time to poll a batch of vendor statuses. */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return handleVideoJobsCron(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleVideoJobsCron(request);
}
