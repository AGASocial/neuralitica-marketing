import { REEL_METRICS_EDIT_WINDOW_DAYS } from "@/lib/contracts/reel-metrics";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveReelMetricsEditWindowDays(): number {
  const raw = process.env.REEL_METRICS_EDIT_WINDOW_DAYS;
  if (raw === undefined || raw.trim() === "") {
    return REEL_METRICS_EDIT_WINDOW_DAYS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return REEL_METRICS_EDIT_WINDOW_DAYS;
  }
  return parsed;
}

export function isWithinReelMetricsEditWindow(params: {
  latestPublishedAt: Date;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const windowDays = resolveReelMetricsEditWindowDays();
  const windowEndMs =
    params.latestPublishedAt.getTime() + windowDays * MS_PER_DAY;
  return now.getTime() <= windowEndMs;
}

export function computeReelMetricsEditable(params: {
  latestPublishedAt: Date | null;
  now?: Date;
}): boolean {
  if (params.latestPublishedAt === null) {
    return false;
  }
  return isWithinReelMetricsEditWindow({
    latestPublishedAt: params.latestPublishedAt,
    now: params.now,
  });
}
