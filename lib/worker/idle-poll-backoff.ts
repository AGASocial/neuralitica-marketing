/**
 * Shared idle poll backoff for Fly worker loops (video / assembly / branding).
 * Pure module — safe to import from node:test without server-only.
 */

export const WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT = 60_000 as const;
export const WORKER_IDLE_BACKOFF_MULTIPLIER_DEFAULT = 2 as const;
/** Decouple stale sweeps from every queue tick (default 5 minutes). */
export const WORKER_STALE_SWEEP_INTERVAL_MS_DEFAULT = 300_000 as const;

export type IdlePollBackoffOptions = {
  baseIntervalMs: number;
  maxIntervalMs?: number;
  multiplier?: number;
};

export type IdlePollBackoff = {
  /** Consecutive empty polls since last work (0 after reset). */
  readonly consecutiveEmpty: number;
  /**
   * Record poll outcome and return ms to sleep before the next poll.
   * Work → reset to base; empty → exponential grow capped at max.
   */
  afterPoll(hadWork: boolean): number;
  /** Current interval without advancing state (empty streak uses formula). */
  peekIntervalMs(): number;
  reset(): void;
};

/**
 * After n consecutive empty polls (n ≥ 1): min(base * multiplier^(n-1), max).
 * After work: n = 0 and return base.
 */
export function createIdlePollBackoff(
  options: IdlePollBackoffOptions,
): IdlePollBackoff {
  const baseIntervalMs = Math.max(1, Math.floor(options.baseIntervalMs));
  const maxIntervalMs = Math.max(
    baseIntervalMs,
    Math.floor(
      options.maxIntervalMs ?? WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT,
    ),
  );
  const multiplier = Math.max(
    1,
    options.multiplier ?? WORKER_IDLE_BACKOFF_MULTIPLIER_DEFAULT,
  );

  let consecutiveEmpty = 0;

  function intervalForEmptyCount(emptyCount: number): number {
    if (emptyCount <= 0) {
      return baseIntervalMs;
    }
    const factor = multiplier ** (emptyCount - 1);
    const raw = Math.round(baseIntervalMs * factor);
    return Math.min(raw, maxIntervalMs);
  }

  return {
    get consecutiveEmpty() {
      return consecutiveEmpty;
    },
    afterPoll(hadWork: boolean): number {
      if (hadWork) {
        consecutiveEmpty = 0;
        return baseIntervalMs;
      }
      consecutiveEmpty += 1;
      return intervalForEmptyCount(consecutiveEmpty);
    },
    peekIntervalMs(): number {
      return intervalForEmptyCount(consecutiveEmpty);
    },
    reset(): void {
      consecutiveEmpty = 0;
    },
  };
}

export type StaleSweepGate = {
  shouldSweep(nowMs?: number): boolean;
  markSwept(nowMs?: number): void;
};

/**
 * Run stale sweeps on a longer cadence than queue polls.
 * First call with unset last-sweep runs immediately (process start recovery).
 */
export function createStaleSweepGate(
  intervalMs: number,
  initialLastSweepMs: number | null = null,
): StaleSweepGate {
  const period = Math.max(1, Math.floor(intervalMs));
  let lastSweepMs = initialLastSweepMs;

  return {
    shouldSweep(nowMs = Date.now()): boolean {
      if (lastSweepMs === null) {
        return true;
      }
      return nowMs - lastSweepMs >= period;
    },
    markSwept(nowMs = Date.now()): void {
      lastSweepMs = nowMs;
    },
  };
}

export function readPositiveIntEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
): number {
  const raw = env[key];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function readPositiveNumberEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number,
): number {
  const raw = env[key];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Prefer domain override, then shared WORKER_* key, then default.
 */
export function readIntervalWithFallback(
  env: NodeJS.ProcessEnv,
  domainKey: string,
  sharedKey: string,
  defaultValue: number,
): number {
  const domainRaw = env[domainKey];
  if (domainRaw) {
    return readPositiveIntEnv(env, domainKey, defaultValue);
  }
  return readPositiveIntEnv(env, sharedKey, defaultValue);
}

export function readWorkerIdleMaxIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
  domainKey?: string,
): number {
  if (domainKey) {
    return readIntervalWithFallback(
      env,
      domainKey,
      "WORKER_IDLE_MAX_INTERVAL_MS",
      WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT,
    );
  }
  return readPositiveIntEnv(
    env,
    "WORKER_IDLE_MAX_INTERVAL_MS",
    WORKER_IDLE_MAX_INTERVAL_MS_DEFAULT,
  );
}

export function readWorkerIdleBackoffMultiplier(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return readPositiveNumberEnv(
    env,
    "WORKER_IDLE_BACKOFF_MULTIPLIER",
    WORKER_IDLE_BACKOFF_MULTIPLIER_DEFAULT,
  );
}

export function readWorkerStaleSweepIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
  domainKey?: string,
): number {
  if (domainKey) {
    return readIntervalWithFallback(
      env,
      domainKey,
      "WORKER_STALE_SWEEP_INTERVAL_MS",
      WORKER_STALE_SWEEP_INTERVAL_MS_DEFAULT,
    );
  }
  return readPositiveIntEnv(
    env,
    "WORKER_STALE_SWEEP_INTERVAL_MS",
    WORKER_STALE_SWEEP_INTERVAL_MS_DEFAULT,
  );
}
