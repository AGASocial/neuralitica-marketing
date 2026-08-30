import "server-only";

import {
  buildReelCaptionRecord,
  computeEffectiveCaptionCharCount,
  isEffectiveCaptionOverLimit,
  reelCaptionAgentOutputSchema,
  resolveSelectedCtaVariant,
  type ReelCaptionRecord,
  type ReelCaptionSummary,
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
    selected_cta_index: null,
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
  selectedCtaIndex: number | null;
  updatedAt: string;
};

function parseSelectedCtaIndex(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    return null;
  }
  return raw;
}

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
    selectedCtaIndex: parseSelectedCtaIndex(raw.selected_cta_index),
    updatedAt: raw.updated_at,
  };
}

export function buildGeneratedReelCaptionSummary(params: {
  captionRow: ReelCaptionRow;
  scriptUpdatedAt: string;
}): ReelCaptionSummary {
  const { captionRow, scriptUpdatedAt } = params;
  const rawIndex = captionRow.selectedCtaIndex;

  let selectedCtaIndex: number | null = null;
  let selectedCtaText: string | null = null;

  if (rawIndex !== null) {
    const resolved = resolveSelectedCtaVariant(captionRow.record, rawIndex);
    if (resolved !== null) {
      selectedCtaIndex = rawIndex;
      selectedCtaText = resolved;
    } else {
      console.warn("[reel-captions] selected_cta_index out of bounds", {
        captionId: captionRow.id,
        reelScriptId: captionRow.reelScriptId,
        selectedCtaIndex: rawIndex,
      });
    }
  }

  const effectiveCaptionCharCount = computeEffectiveCaptionCharCount({
    caption: captionRow.record.caption,
    selectedCtaText,
  });

  return {
    status: "generated",
    captionId: captionRow.id,
    record: captionRow.record,
    selectedCtaIndex,
    selectedCtaText,
    effectiveCaptionCharCount,
    effectiveCaptionOverLimit: isEffectiveCaptionOverLimit(
      effectiveCaptionCharCount,
    ),
    updatedAt: captionRow.updatedAt,
    stale: scriptUpdatedAt > captionRow.updatedAt,
  };
}

export async function getReelCaptionByScriptId(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<ReelCaptionRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_captions")
    .select("*")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapCaptionRow(data as Record<string, unknown>);
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
