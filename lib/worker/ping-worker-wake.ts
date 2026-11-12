/**
 * Wake ping from enqueue seams to a Fly worker process.
 * Scheduling is injectable: Next enqueue modules pass `after()` so Vercel
 * does not freeze the fetch after the response; default is fire-and-forget
 * (Fly workers, tests, and any caller outside a Next request).
 */
import { readPositiveIntEnv } from "./idle-poll-backoff";

export type WorkerWakeTarget = "video" | "assembly" | "branding";

export const WORKER_WAKE_TIMEOUT_MS_DEFAULT = 1_500 as const;

const WAKE_URL_ENV: Record<WorkerWakeTarget, string> = {
  video: "WORKER_WAKE_URL_VIDEO",
  assembly: "WORKER_WAKE_URL_ASSEMBLY",
  branding: "WORKER_WAKE_URL_BRANDING",
};

export type WakeScheduleFn = (task: () => void | Promise<void>) => void;

export type PingWorkerWakeOptions = {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Override scheduling (tests / Next `after`). Default: fire-and-forget. */
  schedule?: WakeScheduleFn;
};

/**
 * Fire-and-forget schedule used outside Next request scope (Fly, tests).
 * Never throws to the caller; task errors are logged only.
 */
export function fireAndForgetWorkerWakeSchedule(
  task: () => void | Promise<void>,
): void {
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error("[worker-wake] fire-and-forget task failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    });
}

/**
 * Schedule work via the injected scheduler. If the scheduler throws (e.g.
 * Next `after()` outside a request), fall back to fire-and-forget.
 * Never throws to the caller.
 */
export function scheduleWorkerWakeTask(
  task: () => void | Promise<void>,
  schedule: WakeScheduleFn = fireAndForgetWorkerWakeSchedule,
): void {
  try {
    schedule(task);
  } catch (error) {
    console.error("[worker-wake] schedule failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    fireAndForgetWorkerWakeSchedule(task);
  }
}

/**
 * Non-blocking wake ping. Skips when secret or URL is unset.
 * Never throws to the caller; errors are logged only.
 */
export function pingWorkerWake(
  target: WorkerWakeTarget,
  options: PingWorkerWakeOptions = {},
): void {
  const env = options.env ?? process.env;
  const secret = env.WORKER_WAKE_SECRET?.trim();
  const url = env[WAKE_URL_ENV[target]]?.trim();
  if (!secret || !url) {
    return;
  }

  const timeoutMs =
    options.timeoutMs ??
    readPositiveIntEnv(env, "WORKER_WAKE_TIMEOUT_MS", WORKER_WAKE_TIMEOUT_MS_DEFAULT);
  const fetchFn = options.fetchFn ?? fetch;
  const schedule = options.schedule ?? fireAndForgetWorkerWakeSchedule;

  scheduleWorkerWakeTask(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (error) {
      console.error("[worker-wake] ping failed", {
        target,
        message: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      clearTimeout(timer);
    }
  }, schedule);
}
