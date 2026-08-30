import "server-only";

import { createStubVideoAdapter } from "@/lib/providers/video/create-stub-video-adapter";

export function createHeygenHighStubAdapter(defaultEstimateCents = 100) {
  return createStubVideoAdapter({
    providerKey: "heygen_high",
    videoAssetRole: "primary",
    defaultEstimateCents,
  });
}
