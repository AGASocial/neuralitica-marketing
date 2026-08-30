import "server-only";

import { costPolicyRowSchema, type CostPolicyRow } from "@/lib/contracts/providers";

type CostPolicySelectRow = {
  id: unknown;
  client_id: unknown;
  provider_tier: unknown;
  max_cost_cents: unknown;
  rules: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function toIso8601(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

export function mapCostPolicyRow(row: CostPolicySelectRow) {
  const createdAt = toIso8601(row.created_at);
  const updatedAt = toIso8601(row.updated_at);
  if (!createdAt || !updatedAt) {
    return null;
  }

  return costPolicyRowSchema.safeParse({
    id: row.id,
    clientId: row.client_id,
    providerTier: row.provider_tier,
    maxCostCents: row.max_cost_cents,
    rules: row.rules ?? null,
    createdAt,
    updatedAt,
  });
}

export type { CostPolicyRow };
