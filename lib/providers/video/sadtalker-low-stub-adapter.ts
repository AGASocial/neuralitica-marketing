import "server-only";

import { createStubVideoAdapter } from "@/lib/providers/video/create-stub-video-adapter";

export function createSadtalkerLowStubAdapter(defaultEstimateCents = 19) {
  return createStubVideoAdapter({
    providerKey: "sadtalker_low",
    videoAssetRole: "primary",
    defaultEstimateCents,
  });
}
