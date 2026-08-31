import "server-only";

import {
  probeVideoDurationSec,
  roundDurationSecDown,
} from "@/lib/media/probe-video-duration";

const PROBE_TIMEOUT_MS = 1_500;

/** Probe downloaded provider bytes; omit when unknown (US-7.3 Phase B). */
export async function optionalDurationSecFromBuffer(
  buffer: Buffer,
): Promise<number | undefined> {
  const probed = await Promise.race([
    probeVideoDurationSec(buffer),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
    }),
  ]);
  if (typeof probed !== "number" || !(probed > 0)) {
    return undefined;
  }
  const rounded = roundDurationSecDown(probed);
  return rounded > 0 ? rounded : undefined;
}
