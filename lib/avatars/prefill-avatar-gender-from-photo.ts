"use server";

import type { PrefillAvatarGenderResult } from "@/lib/contracts/avatar";
import { avatarGenderSchema } from "@/lib/contracts/avatar";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { MEDIA_ASSET_TYPE_AVATAR_REFERENCE } from "@/lib/contracts/media-assets";
import { getMediaStorage } from "@/lib/media/storage/get-media-storage";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const AI_GATEWAY_CHAT_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.5-flash-lite";

/**
 * Optional vision prefill of presenter gender from the latest avatar photo.
 * User must confirm/edit before upsert. Uses AI Gateway (never prints secrets).
 */
export async function prefillAvatarGenderFromPhoto(params?: {
  assetId?: string;
}): Promise<PrefillAvatarGenderResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return {
          ok: false,
          code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        };
      }
      throw error;
    }

    const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
    if (!apiKey || !isSupabaseConfigured()) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("neuramark_media_assets")
      .select("id, storage_key, metadata")
      .eq("client_id", user.id)
      .eq("asset_type", MEDIA_ASSET_TYPE_AVATAR_REFERENCE)
      .order("created_at", { ascending: false })
      .limit(1);

    if (params?.assetId) {
      query = supabase
        .from("neuramark_media_assets")
        .select("id, storage_key, metadata")
        .eq("client_id", user.id)
        .eq("asset_type", MEDIA_ASSET_TYPE_AVATAR_REFERENCE)
        .eq("id", params.assetId)
        .limit(1);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return { ok: false, code: "NOT_FOUND" };
    }

    const row = data as {
      storage_key: string;
      metadata: { detectedMime?: string } | null;
    };
    const mime = row.metadata?.detectedMime ?? "";
    if (!mime.startsWith("image/")) {
      return { ok: false, code: "NOT_FOUND" };
    }

    const storage = getMediaStorage();
    const stream = await storage.readStream(row.storage_key);
    const buffer = Buffer.from(await new Response(stream).arrayBuffer());
    if (buffer.length === 0) {
      return { ok: false, code: "NOT_FOUND" };
    }

    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

    const response = await fetch(AI_GATEWAY_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        max_tokens: 32,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  'Look at this person. Reply with JSON only: {"gender":"male"} or {"gender":"female"}. Prefer apparent presentation gender. No other keys.',
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    const genderRaw =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "gender" in parsed
        ? (parsed as { gender: unknown }).gender
        : undefined;
    const gender = avatarGenderSchema.safeParse(genderRaw);
    if (!gender.success) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    return { ok: true, gender: gender.data, source: "vision" };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return {
        ok: false,
        code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      };
    }
    console.error("[avatar] vision gender prefill failed");
    return { ok: false, code: "INTERNAL_ERROR" };
  }
}
