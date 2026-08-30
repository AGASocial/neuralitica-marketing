import "server-only";

import { createStubVideoAdapter } from "@/lib/providers/video/create-stub-video-adapter";

export function createSiliconflowWan21TurboStubAdapter(defaultEstimateCents = 10) {
  return createStubVideoAdapter({
    providerKey: "siliconflow_wan21_turbo",
    videoAssetRole: "broll",
    defaultEstimateCents,
  });
}
