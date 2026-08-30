import "server-only";

import type { AssetRole } from "@/lib/contracts/providers";
import {
  MANUAL_FALLBACK_NOTE_KEY,
  reelProviderRecommendationSchema,
  type GetReelProviderRecommendationsInput,
  type OperatorProviderRecommendationComponentDto,
  type ReelProviderRecommendation,
} from "@/lib/contracts/provider-decisions";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";

import {
  buildReelProductionContext,
  isEffectiveFaceless,
} from "./build-reel-production-context";

export type GetReelProviderRecommendationsResult =
  | { ok: true; items: ReelProviderRecommendation[] }
  | {
      ok: false;
      error: {
        code:
          | "STRATEGY_NOT_APPROVED"
          | "PROVIDER_UNAVAILABLE"
          | "SLOT_NOT_FOUND"
          | "FORBIDDEN";
      };
    };

const PROJECTION_ASSET_ROLES: AssetRole[] = [
  "llm",
  "talking_head",
  "broll",
  "tts",
];

function rolesForContext(
  visualMode: ReelProviderRecommendation["visualMode"],
  modalidad: ReelProviderRecommendation["modalidad"],
  needsBroll: boolean,
): AssetRole[] {
  const roles: AssetRole[] = ["llm"];

  if (!isEffectiveFaceless(visualMode, modalidad)) {
    roles.push("talking_head");
  }

  if (needsBroll) {
    roles.push("broll");
  }

  roles.push("tts");
  return roles.filter((role) => PROJECTION_ASSET_ROLES.includes(role));
}

async function buildRecommendationForSlot(
  input: GetReelProviderRecommendationsInput,
  slotIndex: number,
): Promise<
  | { ok: true; item: ReelProviderRecommendation }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" | "SLOT_NOT_FOUND" }
> {
  const contextResult = await buildReelProductionContext({
    clientId: input.clientId,
    weekStart: input.weekStart,
    slotIndex,
  });

  if (!contextResult.ok) {
    if (contextResult.code === "SLOT_NOT_FOUND") {
      return { ok: false, code: "SLOT_NOT_FOUND" };
    }
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  const ctx = contextResult.context;
  const roles = rolesForContext(ctx.visualMode, ctx.modalidad, ctx.needsBroll);
  const components: OperatorProviderRecommendationComponentDto[] = [];

  for (const assetRole of roles) {
    const decisionResult = await resolveProviderForJob({
      clientId: input.clientId,
      assetRole,
      llmVariant: assetRole === "llm" ? "fallback" : undefined,
      productionContext: ctx,
    });

    if (!decisionResult.ok) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    components.push({
      assetRole: decisionResult.decision.assetRole,
      displayLabel: decisionResult.decision.displayLabel,
      providerTier: decisionResult.decision.providerTier,
      estimatedCostCents: decisionResult.decision.estimatedCostCents,
      rationaleKey: decisionResult.decision.rationaleKey,
      providerKey: decisionResult.decision.providerKey,
    });
  }

  const projectedTotalCents = components.reduce(
    (sum, component) => sum + component.estimatedCostCents,
    0,
  );

  const item = reelProviderRecommendationSchema.parse({
    reelScriptId: ctx.reelScriptId,
    slotIndex: ctx.slotIndex,
    providerTier: ctx.providerTier,
    visualMode: ctx.visualMode,
    modalidad: ctx.modalidad,
    components,
    projectedTotalCents,
    manualFallbackNoteKey: MANUAL_FALLBACK_NOTE_KEY,
  });

  return { ok: true, item };
}

export async function getReelProviderRecommendations(
  input: GetReelProviderRecommendationsInput,
): Promise<GetReelProviderRecommendationsResult> {
  const approved = await getApprovedStrategyForWeek({
    clientId: input.clientId,
    weekStart: input.weekStart,
  });

  if (!approved || approved.status !== "approved") {
    return { ok: false, error: { code: "STRATEGY_NOT_APPROVED" } };
  }

  const slotIndexes =
    input.slotIndex !== undefined
      ? [input.slotIndex]
      : approved.brief.slots.map((slot) => slot.slotIndex);

  if (input.slotIndex !== undefined) {
    const slotExists = approved.brief.slots.some(
      (slot) => slot.slotIndex === input.slotIndex,
    );
    if (!slotExists) {
      return { ok: false, error: { code: "SLOT_NOT_FOUND" } };
    }
  }

  const items: ReelProviderRecommendation[] = [];

  for (const slotIndex of slotIndexes) {
    const built = await buildRecommendationForSlot(input, slotIndex);
    if (!built.ok) {
      return { ok: false, error: { code: built.code } };
    }
    items.push(built.item);
  }

  return { ok: true, items };
}
