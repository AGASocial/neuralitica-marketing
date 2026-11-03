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

  // Meet calibrated ~2.5 wps word budget (±10%) so generateReelScriptForSlot accepts stub output.
  const targetWordCount = Math.round(targetDurationSec * 2.5);
  const minWordCount = Math.ceil(targetWordCount * 0.9);
  const maxWordCount = Math.floor(targetWordCount * 1.15);
  const countWords = (text: string) =>
    text.trim().split(/\s+/).filter(Boolean).length;
  const filler =
    "Revisa cada detalle, compara el antes y el después, y guarda este tip.";
  const closingRaw =
    typeof ctaHint === "string" && ctaHint.trim().length > 0
      ? ctaHint.trim()
      : "Guarda este video y comparte hoy.";
  const closing = /[.!?…]$/u.test(closingRaw) ? closingRaw : `${closingRaw}.`;
  const parts: string[] = [
    `En este Reel explicamos ${tema.toLowerCase()} con claridad y ejemplos concretos.`,
  ];
  // Add fillers until seed+fillers+closing would clear the under floor, without exceeding over.
  while (
    countWords([...parts, filler, closing].join(" ")) <= maxWordCount &&
    countWords([...parts, closing].join(" ")) < minWordCount
  ) {
    parts.push(filler);
  }
  parts.push(closing);
  // If still under (very short tema / short duration), pad with short complete sentences.
  while (countWords(parts.join(" ")) < minWordCount) {
    parts.splice(parts.length - 1, 0, "Este tip ahorra tiempo y evita errores.");
  }
  const voiceoverText = parts.join(" ").trim();

  const pkg: Record<string, unknown> = {
    hook: `¿${tema}?`,
    body: `Desarrollo del guion para: ${tema}.`,
    cta: ctaHint ?? "Guarda este video y comparte.",
    onScreenText: `Puntos clave\n• ${tema}`,
    voiceoverText,
    targetDurationSec,
  };

  if (includeEditingExtras) {
    pkg.brollBeats = ["Plano detalle del servicio", "Close-up del resultado"];
    pkg.coldOpenNotes = "Abrir con la toma más impactante (rewind 2s).";
    pkg.editingNotes = "Corte rápido entre beats; texto sincronizado con VO.";
  }

  return JSON.stringify(pkg);
}
