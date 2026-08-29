import "server-only";

/**
 * Cancel queued (not yet submitted) own-avatar jobs for clientId.
 * US-3.2: idempotent no-op when neuramark_video_jobs (or successor) is absent.
 * US-8/US-10: real cancel of status=queued own-avatar rows.
 *
 * TODO (US-8 / US-10): flag in-flight provider jobs for Operator review —
 * do not invent Operator UI in US-3.2.
 */
export async function cancelQueuedOwnAvatarJobs(
  clientId: string,
): Promise<{ ok: true; cancelledCount: number }> {
  if (!clientId || typeof clientId !== "string") {
    return { ok: true, cancelledCount: 0 };
  }

  // Jobs table not present in US-3.2 — safe no-op.
  return { ok: true, cancelledCount: 0 };
}
