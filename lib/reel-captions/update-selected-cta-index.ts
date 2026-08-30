import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function updateSelectedCtaIndex(params: {
  captionId: string;
  clientId: string;
  selectedCtaIndex: number;
}): Promise<{ ok: true; updatedAt: string } | { ok: false }> {
  if (!isSupabaseConfigured()) {
    return { ok: false };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_captions")
    .update({ selected_cta_index: params.selectedCtaIndex })
    .eq("id", params.captionId)
    .eq("client_id", params.clientId)
    .select("updated_at")
    .single();

  if (error || !data || typeof (data as { updated_at: unknown }).updated_at !== "string") {
    console.error("[reel-captions] update selected_cta_index failed", {
      code: error?.code,
      captionId: params.captionId,
    });
    return { ok: false };
  }

  return { ok: true, updatedAt: (data as { updated_at: string }).updated_at };
}
