import "server-only";

import type { ReelScriptPackage } from "@/lib/contracts/reel-script";
import { reelScriptPackageSchema } from "@/lib/contracts/reel-script";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type PersistReelScriptParams = {
  clientId: string;
  strategyId: string;
  slotIndex: number;
  modalidad: VisualModality;
  mustDiscloseNotOwner: boolean;
  package: ReelScriptPackage;
};

export type PersistReelScriptResult =
  | { ok: true; scriptId: string }
  | { ok: false };

function packageToRow(params: PersistReelScriptParams) {
  const pkg = params.package;
  return {
    client_id: params.clientId,
    strategy_id: params.strategyId,
    slot_index: params.slotIndex,
    modalidad: params.modalidad,
    hook: pkg.hook,
    body: pkg.body,
    cta: pkg.cta,
    on_screen_text: pkg.onScreenText,
    voiceover_text: pkg.voiceoverText,
    target_duration_sec: pkg.targetDurationSec,
    broll_beats: pkg.brollBeats ?? null,
    cold_open_notes: pkg.coldOpenNotes ?? null,
    editing_notes: pkg.editingNotes ?? null,
    must_disclose_not_owner: params.mustDiscloseNotOwner,
  };
}

export async function persistReelScript(
  params: PersistReelScriptParams,
): Promise<PersistReelScriptResult> {
  const parsed = reelScriptPackageSchema.safeParse(params.package);
  if (!parsed.success) {
    return { ok: false };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false };
  }

  const supabase = createServerSupabaseClient();
  const row = packageToRow({ ...params, package: parsed.data });

  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .upsert(row, { onConflict: "strategy_id,slot_index" })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    console.error("[reel-scripts] persist failed", {
      code: error?.code,
      strategyId: params.strategyId,
      slotIndex: params.slotIndex,
    });
    return { ok: false };
  }

  return { ok: true, scriptId: (data as { id: string }).id };
}

export type ReelScriptRow = {
  id: string;
  clientId: string;
  strategyId: string;
  slotIndex: number;
  modalidad: VisualModality;
  package: ReelScriptPackage;
  mustDiscloseNotOwner: boolean;
};

function mapReelScriptRow(raw: Record<string, unknown>): ReelScriptRow | null {
  if (typeof raw.id !== "string" || typeof raw.client_id !== "string") {
    return null;
  }
  if (typeof raw.strategy_id !== "string") {
    return null;
  }
  if (typeof raw.slot_index !== "number") {
    return null;
  }

  const packageParsed = reelScriptPackageSchema.safeParse({
    hook: raw.hook,
    body: raw.body,
    cta: raw.cta,
    onScreenText: raw.on_screen_text,
    voiceoverText: raw.voiceover_text,
    targetDurationSec: raw.target_duration_sec,
    brollBeats: raw.broll_beats ?? undefined,
    coldOpenNotes: raw.cold_open_notes ?? undefined,
    editingNotes: raw.editing_notes ?? undefined,
  });

  if (!packageParsed.success) {
    return null;
  }

  const modalidad = raw.modalidad;
  if (
    modalidad !== "own_avatar" &&
    modalidad !== "generic_avatar" &&
    modalidad !== "faceless"
  ) {
    return null;
  }

  if (typeof raw.must_disclose_not_owner !== "boolean") {
    return null;
  }

  return {
    id: raw.id,
    clientId: raw.client_id,
    strategyId: raw.strategy_id,
    slotIndex: raw.slot_index,
    modalidad,
    package: packageParsed.data,
    mustDiscloseNotOwner: raw.must_disclose_not_owner,
  };
}

export async function listReelScriptsForStrategy(params: {
  clientId: string;
  strategyId: string;
}): Promise<ReelScriptRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("*")
    .eq("client_id", params.clientId)
    .eq("strategy_id", params.strategyId)
    .order("slot_index", { ascending: true });

  if (error || !data) {
    return [];
  }

  const rows: ReelScriptRow[] = [];
  for (const raw of data) {
    const mapped = mapReelScriptRow(raw as Record<string, unknown>);
    if (mapped) {
      rows.push(mapped);
    }
  }
  return rows;
}

export async function hasOrphanedScriptsForWeek(params: {
  clientId: string;
  weekStart: string;
  currentStrategyId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data: strategies, error: strategyError } = await supabase
    .from("neuramark_content_strategies")
    .select("id")
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .neq("id", params.currentStrategyId);

  if (strategyError || !strategies || strategies.length === 0) {
    return false;
  }

  const otherIds = strategies
    .map((s) => (s as { id: string }).id)
    .filter(Boolean);

  if (otherIds.length === 0) {
    return false;
  }

  const { count, error: scriptError } = await supabase
    .from("neuramark_reel_scripts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", params.clientId)
    .in("strategy_id", otherIds);

  if (scriptError) {
    return false;
  }

  return (count ?? 0) > 0;
}
