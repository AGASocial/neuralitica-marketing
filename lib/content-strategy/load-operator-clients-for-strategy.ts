import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type OperatorClientOption = {
  id: string;
  displayName: string;
  email: string;
};

/**
 * Active clients for Operator strategy page client selector (US-4.1).
 * V1 generate still resolves `clientId` from session server-side.
 */
export async function loadOperatorClientsForStrategy(): Promise<
  OperatorClientOption[]
> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("id, email, display_name")
    .eq("active", true)
    .order("display_name", { ascending: true });

  if (error) {
    console.error("[content-strategy] load clients failed", { code: error.code });
    return [];
  }

  const options: OperatorClientOption[] = [];
  for (const row of data ?? []) {
    if (typeof row.id !== "string" || typeof row.email !== "string") {
      continue;
    }
    const displayName =
      typeof row.display_name === "string" && row.display_name.trim().length > 0
        ? row.display_name.trim()
        : row.email;
    options.push({ id: row.id, displayName, email: row.email });
  }

  return options;
}
