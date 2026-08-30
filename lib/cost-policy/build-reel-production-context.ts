import "server-only";

import {
  DEFAULT_BROLL_CLIP_SEC,
  DEFAULT_REEL_DURATION_SEC,
} from "@/lib/contracts/provider-decisions";
import type { VisualMode } from "@/lib/contracts/providers";
import type { VisualModality } from "@/lib/contracts/visual-preferences";
import type { ReelScriptPackage } from "@/lib/contracts/reel-script";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { getPlaybookForAgents } from "@/lib/playbook/get-playbook-for-agents";
import { hasReferenceLoopAssetForClient } from "@/lib/media/has-reference-loop-asset-for-client";
import { listReelScriptsForStrategy } from "@/lib/reel-scripts/persist-reel-script";
import type { VisualModeSummary } from "@/lib/contracts/visual-preferences";

import { loadCostPolicyForClientFresh } from "./get-cost-policy-for-client";

export type ReelProductionContext = {
  clientId: string;
  reelScriptId: string | null;
  slotIndex: number;
  visualMode: VisualMode;
  modalidad: VisualModality;
  hasReferenceLoop: boolean;
  needsBroll: boolean;
  targetDurationSec: number;
  brollClipCount: number;
  providerTier: "low" | "high";
  ttsCharCount: number;
};

function deriveVisualModeFromSummary(
  summary: VisualModeSummary,
): VisualMode {
  if (summary.allowedModes.includes("own_avatar")) {
    return "own_avatar";
  }
  if (summary.allowedModes.includes("generic_avatar")) {
    return "generic_avatar";
  }
  return "faceless";
}

function isEffectiveFaceless(visualMode: VisualMode, modalidad: VisualModality): boolean {
  return visualMode === "faceless" || modalidad === "faceless";
}

function resolveTargetDurationSec(
  slot: ContentStrategySlot,
  playbook: Awaited<ReturnType<typeof getPlaybookForAgents>>,
  scriptPackage: ReelScriptPackage | null,
): number {
  if (scriptPackage?.targetDurationSec && scriptPackage.targetDurationSec > 0) {
    return scriptPackage.targetDurationSec;
  }

  if (!("loadFailed" in playbook) || !playbook.loadFailed) {
    const formato = playbook.formats.find(
      (f) => f.slug === slot.formatoPlaybookSlug,
    );
    if (formato?.duracionIdealSeg && formato.duracionIdealSeg > 0) {
      return formato.duracionIdealSeg;
    }
  }

  return DEFAULT_REEL_DURATION_SEC;
}

function resolveBrollClipCount(
  needsBroll: boolean,
  scriptPackage: ReelScriptPackage | null,
): number {
  if (!needsBroll) {
    return 0;
  }
  const beatCount = scriptPackage?.brollBeats?.length ?? 0;
  return Math.max(1, beatCount);
}

function resolveTtsCharCount(scriptPackage: ReelScriptPackage | null): number {
  const voiceover = scriptPackage?.voiceoverText?.trim() ?? "";
  if (voiceover.length > 0) {
    return voiceover.length;
  }
  return 500;
}

export type BuildReelProductionContextInput = {
  clientId: string;
  weekStart: string;
  slotIndex: number;
};

export type BuildReelProductionContextResult =
  | { ok: true; context: ReelProductionContext }
  | {
      ok: false;
      code: "STRATEGY_NOT_APPROVED" | "SLOT_NOT_FOUND" | "COST_POLICY_UNAVAILABLE";
    };

export async function buildReelProductionContext(
  input: BuildReelProductionContextInput,
): Promise<BuildReelProductionContextResult> {
  const approved = await getApprovedStrategyForWeek({
    clientId: input.clientId,
    weekStart: input.weekStart,
  });

  if (!approved || approved.status !== "approved") {
    return { ok: false, code: "STRATEGY_NOT_APPROVED" };
  }

  const slot = approved.brief.slots.find((s) => s.slotIndex === input.slotIndex);
  if (!slot) {
    return { ok: false, code: "SLOT_NOT_FOUND" };
  }

  const policyResult = await loadCostPolicyForClientFresh(input.clientId);
  if (!policyResult.ok) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  const profile = await getBusinessProfileForAgents(input.clientId);
  if (!profile.exists || profile.visualModeSummary === null) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  const visualMode = deriveVisualModeFromSummary(profile.visualModeSummary);
  const scripts = await listReelScriptsForStrategy({
    clientId: input.clientId,
    strategyId: approved.id,
  });
  const script = scripts.find((s) => s.slotIndex === input.slotIndex) ?? null;

  const needsBroll =
    slot.modalidad === "faceless" ||
    (script !== null &&
      Array.isArray(script.package.brollBeats) &&
      script.package.brollBeats.length > 0);

  const hasReferenceLoop =
    visualMode === "generic_avatar" &&
    !isEffectiveFaceless(visualMode, slot.modalidad) &&
    (await hasReferenceLoopAssetForClient(input.clientId));

  const playbook = await getPlaybookForAgents();
  const targetDurationSec = resolveTargetDurationSec(
    slot,
    playbook,
    script?.package ?? null,
  );
  const brollClipCount = resolveBrollClipCount(needsBroll, script?.package ?? null);
  const ttsCharCount = resolveTtsCharCount(script?.package ?? null);

  return {
    ok: true,
    context: {
      clientId: input.clientId,
      reelScriptId: script?.id ?? null,
      slotIndex: input.slotIndex,
      visualMode,
      modalidad: slot.modalidad,
      hasReferenceLoop,
      needsBroll,
      targetDurationSec,
      brollClipCount,
      providerTier: policyResult.policy.providerTier,
      ttsCharCount,
    },
  };
}

export { isEffectiveFaceless };
