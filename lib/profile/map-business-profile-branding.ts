import type { BusinessProfileBranding } from "@/lib/contracts/profile";
import {
  assemblyConfigSchema,
  DEFAULT_ASSEMBLY_CONFIG,
} from "@/lib/contracts/branding-job";

export function mapBusinessProfileBranding(params: {
  logoAssetId: string | null;
  assemblyConfig: unknown;
}): BusinessProfileBranding {
  const parsed = assemblyConfigSchema.safeParse(
    params.assemblyConfig ?? DEFAULT_ASSEMBLY_CONFIG,
  );

  return {
    logoAssetId: params.logoAssetId,
    logoPreviewUrl: params.logoAssetId
      ? `/api/media/assets/${params.logoAssetId}`
      : null,
    assemblyConfig: parsed.success ? parsed.data : DEFAULT_ASSEMBLY_CONFIG,
  };
}
