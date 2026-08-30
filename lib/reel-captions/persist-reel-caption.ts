import "server-only";

import {
  buildReelCaptionRecord,
  reelCaptionAgentOutputSchema,
  type ReelCaptionRecord,
} from "@/lib/contracts/reel-caption";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type PersistReelCaptionParams = {
  clientId: string;
  reelScriptId: string;
  record: ReelCaptionRecord;
};

export type PersistReelCaptionResult =
  | { ok: true; captionId: string }
  | { ok: false };

function recordToRow(params: PersistReelCaptionParams) {
  const { record } = params;
  return {
    client_id: params.clientId,
    reel_script_id: params.reelScriptId,
    caption: record.caption,
    hashtags: record.hashtags,
    keywords: record.keywords,
    cta_variants: record.ctaVariants,
  };
}

export async function persistReelCaption(
  params: PersistReelCaptionParams,
): Promise<PersistReelCaptionResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false };
  }

  const supabase = createServerSupabaseClient();
  const row = recordToRow(params);

  const { data, error } = await supabase
    .from("neuramark_reel_captions")
    .upsert(row, { onConflict: "reel_script_id" })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    console.error("[reel-captions] persist failed", {
      code: error?.code,
      reelScriptId: params.reelScriptId,
    });
    return { ok: false };
  }

  return { ok: true, captionId: (data as { id: string }).id };
}

export function mapAgentOutputToRecord(raw: unknown): ReelCaptionRecord | null {
  const parsed = reelCaptionAgentOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  try {
    return buildReelCaptionRecord(parsed.data);
  } catch {
    return null;
  }
}

export type ReelCaptionRow = {
  id: string;
  reelScriptId: string;
  clientId: string;
  record: ReelCaptionRecord;
  updatedAt: string;
};

function mapCaptionRow(raw: Record<string, unknown>): ReelCaptionRow | null {
  if (typeof raw.id !== "string" || typeof raw.reel_script_id !== "string") {
    return null;
  }
  if (typeof raw.client_id !== "string" || typeof raw.caption !== "string") {
    return null;
  }
  if (typeof raw.updated_at !== "string") {
    return null;
  }

  const record = mapAgentOutputToRecord({
    caption: raw.caption,
    hashtags: raw.hashtags,
    keywords: raw.keywords ?? [],
    ctaVariants: raw.cta_variants,
  });

  if (!record) {
    return null;
  }

  return {
    id: raw.id,
    reelScriptId: raw.reel_script_id,
    clientId: raw.client_id,
    record,
    updatedAt: raw.updated_at,
  };
}

export async function listReelCaptionsForStrategy(params: {
  clientId: string;
  strategyId: string;
}): Promise<ReelCaptionRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();

  const { data: scripts, error: scriptError } = await supabase
    .from("neuramark_reel_scripts")
    .select("id")
    .eq("client_id", params.clientId)
    .eq("strategy_id", params.strategyId);

  if (scriptError || !scripts || scripts.length === 0) {
    return [];
  }

  const scriptIds = scripts
    .map((s) => (s as { id: string }).id)
    .filter(Boolean);

  if (scriptIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("neuramark_reel_captions")
    .select("*")
    .eq("client_id", params.clientId)
    .in("reel_script_id", scriptIds);

  if (error || !data) {
    return [];
  }

  const rows: ReelCaptionRow[] = [];
  for (const raw of data) {
    const mapped = mapCaptionRow(raw as Record<string, unknown>);
    if (mapped) {
      rows.push(mapped);
    }
  }
  return rows;
}
