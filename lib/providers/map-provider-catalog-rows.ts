import {
  PROVIDER_CATALOG_LOAD_FAILED,
  PROVIDER_CATALOG_ROW_INVALID,
  providerCatalogRowSchema,
  type ProviderCatalogResult,
  type ProviderCatalogRow,
} from "@/lib/contracts/providers";

export type ProviderCatalogSelectRow = {
  key: unknown;
  asset_role: unknown;
  tier: unknown;
  active: unknown;
  capabilities: unknown;
  cost_model: unknown;
  env_key_name: unknown;
};

function mapRowToDto(row: ProviderCatalogSelectRow): ProviderCatalogRow | null {
  const dto = {
    key: row.key,
    assetRole: row.asset_role,
    tier: row.tier,
    active: row.active,
    capabilities: row.capabilities ?? {},
    costModel: row.cost_model,
    envKeyName: row.env_key_name,
  };

  const parsed = providerCatalogRowSchema.safeParse(dto);
  if (!parsed.success) {
    const key =
      typeof row.key === "string" && row.key.length > 0 ? row.key : "unknown";
    console.error("[provider-catalog] row invalid", {
      code: PROVIDER_CATALOG_ROW_INVALID,
      key,
    });
    return null;
  }

  return parsed.data;
}

/**
 * Map provider catalog SELECT rows to validated DTOs.
 * Pure — safe for unit tests; invalid rows skipped with codes-only logs.
 */
export function mapProviderCatalogRows(params: {
  rows: ProviderCatalogSelectRow[] | null;
  error: { code?: string } | null;
}): ProviderCatalogResult {
  if (params.error) {
    console.error("[provider-catalog] select failed", {
      code: PROVIDER_CATALOG_LOAD_FAILED,
      dbCode: params.error.code,
    });
    return { providers: [], loadFailed: true };
  }

  if (!params.rows || params.rows.length === 0) {
    return { providers: [], loadFailed: true };
  }

  const providers: ProviderCatalogRow[] = [];
  let skipped = 0;

  for (const row of params.rows) {
    const mapped = mapRowToDto(row);
    if (mapped) {
      providers.push(mapped);
    } else {
      skipped += 1;
    }
  }

  if (providers.length === 0 && skipped > 0) {
    console.error("[provider-catalog] all rows invalid", {
      code: PROVIDER_CATALOG_LOAD_FAILED,
    });
    return { providers: [], loadFailed: true };
  }

  return { providers };
}
