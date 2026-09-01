import "server-only";

import type { WeeklyCycleStepKey } from "@/lib/contracts/weekly-cycle";

/**
 * Stable per-attempt idempotency key: `wc:{runId}:{slotIndex|global}:{step}:{attempt}`.
 * Matches `weeklyCycleOutboxPayloadSchema`'s key regex in CONTRACT.md.
 */
export function buildWeeklyCycleIdempotencyKey(params: {
  runId: string;
  slotIndex: number | null;
  step: WeeklyCycleStepKey;
  attempt: number;
}): string {
  const slot = params.slotIndex === null ? "global" : String(params.slotIndex);
  return `wc:${params.runId}:${slot}:${params.step}:${params.attempt}`;
}
