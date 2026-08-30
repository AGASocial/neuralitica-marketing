import "server-only";

import type {
  LlmCompletionInput,
  LlmProviderAdapter,
} from "@/lib/providers/provider-adapters";

import {
  createStubLlmAdapter,
  type StubLlmResponseBuilder,
} from "./stub-llm-adapter";

/**
 * Deterministic LLM test double for reel script generation (US-5.1).
 */
export function createStubReelScriptLlmAdapter(
  providerKey: string,
  buildContent: StubLlmResponseBuilder = defaultStubReelScriptJson,
): LlmProviderAdapter {
  return createStubLlmAdapter(providerKey, buildContent);
}

function readJsonBlock(
  prompt: string,
  tag: string,
): Record<string, unknown> | null {
  const match = prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match?.[1]) {
    return null;
  }
  try {
    return JSON.parse(match[1].trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function defaultStubReelScriptJson(input: LlmCompletionInput): string {
  const slotBrief = readJsonBlock(input.userPrompt, "UNTRUSTED_SLOT_BRIEF");
  const formatoHints = readJsonBlock(input.userPrompt, "UNTRUSTED_FORMATO_HINTS");
  const tacticaHints = readJsonBlock(input.userPrompt, "UNTRUSTED_TACTICA_HINTS");

  const tema =
    typeof slotBrief?.tema === "string" && slotBrief.tema.length > 0
      ? slotBrief.tema
      : "Tema del Reel";
  const ctaHint =
    typeof slotBrief?.ctaHint === "string" ? slotBrief.ctaHint : undefined;

  const duracionRaw = formatoHints?.duracionIdealSeg;
  const targetDurationSec =
    typeof duracionRaw === "number" &&
    Number.isInteger(duracionRaw) &&
    duracionRaw >= 15 &&
    duracionRaw <= 45
      ? duracionRaw
      : 30;

  const editingCombined = [
    typeof formatoHints?.editingHints === "string"
      ? formatoHints.editingHints
      : "",
    typeof tacticaHints?.editingHints === "string"
      ? tacticaHints.editingHints
      : "",
  ]
    .join(" ")
    .toLowerCase();

  const includeEditingExtras =
    editingCombined.includes("cold open") ||
    editingCombined.includes("rewind") ||
    editingCombined.includes("b-roll") ||
    editingCombined.includes("broll");

  const pkg: Record<string, unknown> = {
    hook: `¿${tema}?`,
    body: `Desarrollo del guion para: ${tema}.`,
    cta: ctaHint ?? "Guarda este video y comparte.",
    onScreenText: `Puntos clave\n• ${tema}`,
    voiceoverText: `En este Reel explicamos ${tema.toLowerCase()}.`,
    targetDurationSec,
  };

  if (includeEditingExtras) {
    pkg.brollBeats = ["Plano detalle del servicio", "Close-up del resultado"];
    pkg.coldOpenNotes = "Abrir con la toma más impactante (rewind 2s).";
    pkg.editingNotes = "Corte rápido entre beats; texto sincronizado con VO.";
  }

  return JSON.stringify(pkg);
}
