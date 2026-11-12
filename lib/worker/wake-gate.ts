/**
 * Interruptible idle sleep for a single worker poll loop.
 * Repeated wake() calls coalesce; they never start a second loop.
 * A wake while not sleeping forces the next sleep to resolve immediately
 * so mid-poll wakes still re-enter the loop without a long backoff sleep.
 */

export type WorkerWakeGate = {
  /** Interrupt current sleep (if any) and run onWake listeners. */
  wake(): void;
  /** Register a listener invoked on every wake (e.g. backoff.reset). */
  onWake(listener: () => void): () => void;
  /** Sleep that resolves early when wake() is called. */
  sleep(ms: number): Promise<void>;
};

export function createWorkerWakeGate(): WorkerWakeGate {
  const listeners = new Set<() => void>();
  let interruptSleep: (() => void) | null = null;
  /** Set when wake() arrives while the loop is not in sleep (e.g. mid-poll). */
  let pendingImmediatePoll = false;

  return {
    onWake(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    wake(): void {
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          console.error("[worker-wake] onWake listener failed", {
            message: error instanceof Error ? error.message : "unknown",
          });
        }
      }
      if (interruptSleep) {
        const finish = interruptSleep;
        interruptSleep = null;
        finish();
        return;
      }
      pendingImmediatePoll = true;
    },
    sleep(ms: number): Promise<void> {
      if (pendingImmediatePoll) {
        pendingImmediatePoll = false;
        return Promise.resolve();
      }
      const duration = Math.max(0, Math.floor(ms));
      return new Promise((resolve) => {
        if (duration === 0) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          if (interruptSleep === finish) {
            interruptSleep = null;
          }
          resolve();
        }, duration);
        const finish = () => {
          clearTimeout(timer);
          resolve();
        };
        interruptSleep = finish;
      });
    },
  };
}
