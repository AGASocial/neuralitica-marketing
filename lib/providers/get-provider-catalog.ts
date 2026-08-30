import "server-only";

/**
 * Global provider catalog for trusted server orchestration.
 *
 * US-4.x, US-7.2, US-8.x, US-9.3, US-10.x MUST import this helper only —
 * never direct neuramark_provider_catalog SELECT from agent/adapter modules.
 *
 * No session gate — callers are trusted server jobs only.
 * Returns active AND inactive rows; resolveProvider filters active.
 */

import { cache } from "react";

import type { ProviderCatalogResult } from "@/lib/contracts/providers";
import { mapProviderCatalogRows } from "@/lib/providers/map-provider-catalog-rows";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

async function loadProviderCatalog(): Promise<ProviderCatalogResult> {
  if (!isSupabaseConfigured()) {
    console.error(
      "[provider-catalog] load unavailable: Supabase not configured",
    );
    return { providers: [], loadFailed: true };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_provider_catalog")
    .select("key, asset_role, tier, active, capabilities, cost_model, env_key_name")
    .order("asset_role", { ascending: true })
    .order("tier", { ascending: true })
    .order("key", { ascending: true });

  return mapProviderCatalogRows({ rows: data, error });
}

export const getProviderCatalog = cache(loadProviderCatalog);
