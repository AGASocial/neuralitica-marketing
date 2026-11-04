import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import type {
  ApprovalListItemDto,
  ApprovedListItemDto,
} from "@/lib/contracts/approval";
import { mediaPreviewUrl } from "@/lib/approvals/caption-preview";
import {
  listApprovedApprovalsForClientUser,
  listPendingApprovalsForClientUser,
} from "@/lib/approvals/list-get-approvals";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { VIDEO_JOBS_TABLE } from "@/lib/video-jobs/video-job-row";
import { ASSEMBLY_JOBS_TABLE } from "@/lib/assembly/assembly-job-row";

export type MyVideosInProductionItem = {
  reelScriptId: string;
  kind: "video" | "assembly" | "branding";
  status: string;
  updatedAt: string;
};

export type MyVideosPendingItem = ApprovalListItemDto & {
  videoPreviewUrl?: string;
};

export type MyVideosHubDto = {
  ok: true;
  inProduction: MyVideosInProductionItem[];
  pending: MyVideosPendingItem[];
  approved: ApprovedListItemDto[];
};

export type MyVideosHubResult =
  | MyVideosHubDto
  | { ok: false; error: "UNAUTHENTICATED" | "INTERNAL" };

async function listInProductionForClient(
  clientId: string,
): Promise<MyVideosInProductionItem[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const items: MyVideosInProductionItem[] = [];
  const seenScripts = new Set<string>();

  const { data: videoRows } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("reel_script_id, status, updated_at")
    .eq("client_id", clientId)
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: false })
    .limit(40);

  for (const raw of videoRows ?? []) {
    const row = raw as {
      reel_script_id?: unknown;
      status?: unknown;
      updated_at?: unknown;
    };
    if (
      typeof row.reel_script_id !== "string" ||
      typeof row.status !== "string" ||
      typeof row.updated_at !== "string"
    ) {
      continue;
    }
    if (seenScripts.has(row.reel_script_id)) {
      continue;
    }
    seenScripts.add(row.reel_script_id);
    items.push({
      reelScriptId: row.reel_script_id,
      kind: "video",
      status: row.status,
      updatedAt: row.updated_at,
    });
  }

  const { data: assemblyInFlight } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select("reel_script_id, status, branding_status, updated_at")
    .eq("client_id", clientId)
    .in("status", ["queued", "processing"])
    .order("updated_at", { ascending: false })
    .limit(40);

  const { data: brandingInFlightRows } = await supabase
    .from(ASSEMBLY_JOBS_TABLE)
    .select("reel_script_id, status, branding_status, updated_at")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .in("branding_status", ["queued", "processing"])
    .order("updated_at", { ascending: false })
    .limit(40);

  for (const raw of [...(assemblyInFlight ?? []), ...(brandingInFlightRows ?? [])]) {
    const row = raw as {
      reel_script_id?: unknown;
      status?: unknown;
      branding_status?: unknown;
      updated_at?: unknown;
    };
    if (
      typeof row.reel_script_id !== "string" ||
      typeof row.status !== "string" ||
      typeof row.updated_at !== "string"
    ) {
      continue;
    }
    if (seenScripts.has(row.reel_script_id)) {
      continue;
    }
    seenScripts.add(row.reel_script_id);
    const brandingInFlight =
      row.status === "completed" &&
      (row.branding_status === "queued" ||
        row.branding_status === "processing");
    items.push({
      reelScriptId: row.reel_script_id,
      kind: brandingInFlight ? "branding" : "assembly",
      status: brandingInFlight
        ? String(row.branding_status)
        : row.status,
      updatedAt: row.updated_at,
    });
  }

  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
}

/**
 * Owner “Mis videos” hub: in production + waiting for OK + ready to publish.
 */
export async function listMyVideosHubForClientUser(params: {
  user: CurrentUser;
}): Promise<MyVideosHubResult> {
  try {
    const [pendingResult, approvedResult, inProduction] = await Promise.all([
      listPendingApprovalsForClientUser({ user: params.user }),
      listApprovedApprovalsForClientUser({ user: params.user }),
      listInProductionForClient(params.user.id),
    ]);

    if (!pendingResult.ok || !approvedResult.ok) {
      return { ok: false, error: "INTERNAL" };
    }

    const pending: MyVideosPendingItem[] = pendingResult.items.map((item) => ({
      ...item,
      ...(item.videoAssetId
        ? { videoPreviewUrl: mediaPreviewUrl(item.videoAssetId) }
        : {}),
    }));

    return {
      ok: true,
      inProduction,
      pending,
      approved: approvedResult.items,
    };
  } catch {
    return { ok: false, error: "INTERNAL" };
  }
}
