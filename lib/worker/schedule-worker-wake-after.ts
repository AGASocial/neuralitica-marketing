/**
 * Next.js request-scoped wake scheduler for enqueue seams.
 * Kept out of `ping-worker-wake` (no `next/server` there) so the ping client
 * stays usable from plain Node/tests. Enqueue modules import this and pass it
 * into `pingWorkerWake`. Outside a Next request (e.g. Fly auto-chain), `after()`
 * throws and this falls back to fire-and-forget without surfacing to the caller.
 */
import "server-only";

import { after } from "next/server";

import {
  fireAndForgetWorkerWakeSchedule,
  type WakeScheduleFn,
} from "./ping-worker-wake";

export const scheduleWorkerWakeWithAfter: WakeScheduleFn = (task) => {
  try {
    after(() => task());
  } catch {
    fireAndForgetWorkerWakeSchedule(task);
  }
};
