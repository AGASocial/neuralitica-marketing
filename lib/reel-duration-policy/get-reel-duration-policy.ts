import "server-only";

/**
 * Cached loader for neuramark_reel_duration_policies.
 * On DB/config failure → log + FALLBACK_REEL_DURATION_POLICIES (hardcoded).
 */

import { cache } from "react";

import {
  FALLBACK_REEL_DURATION_POLICIES,
  policyForVisualModality,
  reelDurationPolicyCatalogSchema,
  type ReelDurationPolicy,
  type ReelDurationPolicyCatalog,
} from "@/lib/contracts/reel-duration-policy";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { VisualMode } from "@/lib/contracts/providers";
import { mapReelDurationPolicyRow } from "@/lib/reel-duration-policy/map-reel-duration-policy-row";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function fallbackCatalog(reason: string): ReelDurationPolicyCatalog {
  console.error("[reel-duration-policy] using hardcoded fallback catalog", {
    reason,
  });
  return FALLBACK_REEL_DURATION_POLICIES;
}

async function loadReelDurationPolicies(): Promise<ReelDurationPolicyCatalog> {
  if (!isSupabaseConfigured()) {
    return fallbackCatalog("supabase_not_configured");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_duration_policies")
    .select(
      "modality_key, target_duration_sec_min, target_duration_sec_max, avatar_segment_max_sec, avatar_segments_min, avatar_segments_max, broll_cutaways_allowed",
    );

  if (error) {
    return fallbackCatalog(`select_failed:${error.code ?? "unknown"}`);
  }

  if (!data || data.length === 0) {
    return fallbackCatalog("empty_result");
  }

  const byKey: Partial<ReelDurationPolicyCatalog> = {};
  for (const row of data) {
    const mapped = mapReelDurationPolicyRow(row);
    if (!mapped) {
      return fallbackCatalog("row_invalid");
    }
    byKey[mapped.modalityKey] = mapped;
  }

  const catalog = reelDurationPolicyCatalogSchema.safeParse(byKey);
  if (!catalog.success) {
    return fallbackCatalog("catalog_incomplete");
  }

  return catalog.data;
}

const loadReelDurationPoliciesCached = cache(loadReelDurationPolicies);

/** Request-cached catalog (avatar + faceless). Never throws — falls back. */
export function getReelDurationPolicies(): Promise<ReelDurationPolicyCatalog> {
  return loadReelDurationPoliciesCached();
}

/** Fresh uncached read (tests / after mutation). Still falls back on failure. */
export function loadReelDurationPoliciesFresh(): Promise<ReelDurationPolicyCatalog> {
  return loadReelDurationPolicies();
}

export async function getReelDurationPolicyForModality(
  modalidad: VisualModality | VisualMode | null | undefined,
): Promise<ReelDurationPolicy> {
  const catalog = await getReelDurationPolicies();
  return policyForVisualModality(catalog, modalidad);
}
