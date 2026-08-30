import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function loadClientDisplayName(
  clientId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("display_name, email")
    .eq("id", clientId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (
    typeof data.display_name === "string" &&
    data.display_name.trim().length > 0
  ) {
    return data.display_name.trim();
  }

  if (typeof data.email === "string" && data.email.length > 0) {
    return data.email;
  }

  return null;
}
