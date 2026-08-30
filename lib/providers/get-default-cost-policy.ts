import "server-only";

/**
 * Global default cost policy (client_id IS NULL).
 * Per-client overrides are US-7.1 — not loaded here.
 */

import { cache } from "react";

import {
  COST_POLICY_GLOBAL_MISSING,
  COST_POLICY_LOAD_FAILED,
  COST_POLICY_ROW_INVALID,
  costPolicyRowSchema,
  type DefaultCostPolicyResult,
} from "@/lib/contracts/providers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

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

function mapCostPolicyRow(row: CostPolicySelectRow) {
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

async function loadDefaultCostPolicy(): Promise<DefaultCostPolicyResult> {
  if (!isSupabaseConfigured()) {
    console.error("[cost-policy] load unavailable: Supabase not configured");
    return { policy: null, loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_cost_policies")
    .select(
      "id, client_id, provider_tier, max_cost_cents, rules, created_at, updated_at",
    )
    .is("client_id", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[cost-policy] select failed", {
      code: COST_POLICY_LOAD_FAILED,
      dbCode: error.code,
    });
    return { policy: null, loadFailed: true };
  }

  if (!data) {
    console.error("[cost-policy] global default missing", {
      code: COST_POLICY_GLOBAL_MISSING,
    });
    return { policy: null, loadFailed: true };
  }

  const parsed = mapCostPolicyRow(data);
  if (!parsed || !parsed.success) {
    console.error("[cost-policy] row invalid", {
      code: COST_POLICY_ROW_INVALID,
    });
    return { policy: null, loadFailed: true };
  }

  return { policy: parsed.data };
}

export const getDefaultCostPolicy = cache(loadDefaultCostPolicy);
