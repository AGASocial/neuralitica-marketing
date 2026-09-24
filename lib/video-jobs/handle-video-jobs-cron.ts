import { verifyCronSecret } from "@/lib/orchestration/verify-cron-secret";
import { pollActiveVideoJobsOnceBatch } from "@/lib/video-jobs/poll-video-job-until-terminal";

const headers = { "Cache-Control": "no-store" };

export type VideoJobsCronDependencies = {
  verify: typeof verifyCronSecret;
  pollBatch: typeof pollActiveVideoJobsOnceBatch;
};

const defaultDependencies: VideoJobsCronDependencies = {
  verify: verifyCronSecret,
  pollBatch: pollActiveVideoJobsOnceBatch,
};

/**
 * Vercel Cron fallback while Fly video worker (ADR-0003) is IMPLEMENTATION INCOMPLETE.
 * Single-tick poll of queued/processing jobs (primary + broll) against vendors.
 */
export async function handleVideoJobsCron(
  request: Request,
  dependencies: VideoJobsCronDependencies = defaultDependencies,
): Promise<Response> {
  const auth = dependencies.verify(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers },
    );
  }

  try {
    const result = await dependencies.pollBatch(20);
    return Response.json({ ok: true, ...result }, { status: 200, headers });
  } catch (error) {
    console.error("[cron] video-jobs poll failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500, headers },
    );
  }
}
