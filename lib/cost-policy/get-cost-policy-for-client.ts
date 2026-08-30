import "server-only";

import { cache } from "react";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { mapCostPolicyRow, type CostPolicyRow } from "./map-cost-policy-row";

export type CostPolicyForClientResult =
  | {
      ok: true;
      policy: CostPolicyRow;
      scope: "client" | "global";
    }
  | {
      ok: false;
      code: "COST_POLICY_UNAVAILABLE";
    };

async function loadCostPolicyForClient(
  clientId: string,
): Promise<CostPolicyForClientResult> {
  if (!isSupabaseConfigured()) {
    console.error("[cost-policy] getCostPolicyForClient: Supabase not configured");
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  const supabase = createServerSupabaseClient();

  const { data: clientRow, error: clientError } = await supabase
    .from("neuramark_cost_policies")
    .select(
      "id, client_id, provider_tier, max_cost_cents, rules, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (clientError) {
    console.error("[cost-policy] client policy select failed", {
      clientId,
      dbCode: clientError.code,
    });
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  if (clientRow) {
    const parsed = mapCostPolicyRow(clientRow);
    if (!parsed?.success) {
      console.error("[cost-policy] client policy row invalid", { clientId });
      return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
    }
    return { ok: true, policy: parsed.data, scope: "client" };
  }

  const { data: globalRow, error: globalError } = await supabase
    .from("neuramark_cost_policies")
    .select(
      "id, client_id, provider_tier, max_cost_cents, rules, created_at, updated_at",
    )
    .is("client_id", null)
    .limit(1)
    .maybeSingle();

  if (globalError) {
    console.error("[cost-policy] global policy select failed", {
      dbCode: globalError.code,
    });
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  if (!globalRow) {
    console.error("[cost-policy] global policy missing");
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  const parsed = mapCostPolicyRow(globalRow);
  if (!parsed?.success) {
    console.error("[cost-policy] global policy row invalid");
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  return { ok: true, policy: parsed.data, scope: "global" };
}

const loadCostPolicyForClientCached = cache(loadCostPolicyForClient);

export function getCostPolicyForClient(
  clientId: string,
): Promise<CostPolicyForClientResult> {
  return loadCostPolicyForClientCached(clientId);
}

/** Uncached load for mutable policy writes and spend paths requiring fresh reads. */
export async function loadCostPolicyForClientFresh(
  clientId: string,
): Promise<CostPolicyForClientResult> {
  return loadCostPolicyForClient(clientId);
}

export async function loadGlobalCostPolicy(): Promise<CostPolicyRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
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

  if (error || !data) {
    return null;
  }

  const parsed = mapCostPolicyRow(data);
  return parsed?.success ? parsed.data : null;
}

export async function loadClientCostPolicyOverride(
  clientId: string,
): Promise<CostPolicyRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_cost_policies")
    .select(
      "id, client_id, provider_tier, max_cost_cents, rules, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const parsed = mapCostPolicyRow(data);
  return parsed?.success ? parsed.data : null;
}
