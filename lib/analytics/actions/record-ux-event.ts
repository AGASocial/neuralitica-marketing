"use server";

import {
  recordUxEventInputSchema,
  type RecordUxEventResult,
} from "@/lib/contracts/ux-analytics";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { APPROVALS_TABLE } from "@/lib/approvals/persist-approval";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/server";

function flattenProps(
  props: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value).slice(0, 255);
    }
  }
  return out;
}

async function enrichApprovalProps(
  clientId: string,
  props: Record<string, string | number | boolean | null>,
): Promise<Record<string, string | number | boolean | null>> {
  if (typeof props.first_approval_within_24h === "boolean") {
    return props;
  }
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from(APPROVALS_TABLE)
      .select("created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const createdAt =
      data && typeof data.created_at === "string" ? data.created_at : null;
    if (!createdAt) {
      return { ...props, first_approval_within_24h: false };
    }
    const ms = Date.now() - new Date(createdAt).getTime();
    return {
      ...props,
      first_approval_within_24h: Number.isFinite(ms) && ms >= 0 && ms <= 86_400_000,
      ...(typeof props.ms_since_content_ready !== "number"
        ? { ms_since_content_ready: Math.max(0, Math.round(ms)) }
        : {}),
    };
  } catch {
    return { ...props, first_approval_within_24h: false };
  }
}

export async function recordUxEvent(
  rawInput: unknown,
): Promise<RecordUxEventResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
    } catch (error) {
      if (isAuthGuardError(error) && error.status === 401) {
        return { ok: false, error: "UNAUTHENTICATED" };
      }
      if (isAuthGuardError(error)) {
        return { ok: false, error: "UNAUTHENTICATED" };
      }
      throw error;
    }

    const parsed = recordUxEventInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION", message: "Invalid event payload" };
    }

    if (!isSupabaseConfigured()) {
      return { ok: true };
    }

    const supabase = createServerSupabaseClient();
    let props = flattenProps(parsed.data.props);
    if (parsed.data.event === "approval") {
      props = await enrichApprovalProps(user.id, props);
    }

    // Identity seam is getCurrentUser().id (neuramark_clients.id).
    const { error } = await supabase.from("neuramark_ux_events").insert({
      client_id: user.id,
      user_id: user.id,
      event: parsed.data.event,
      props,
    });

    if (error) {
      console.error("[ux-analytics] insert failed", { code: error.code });
      return { ok: false, error: "INTERNAL" };
    }

    return { ok: true };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return { ok: false, error: "UNAUTHENTICATED" };
    }
    console.error("[ux-analytics] unexpected error");
    return { ok: false, error: "INTERNAL" };
  }
}
