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
 * Deterministic LLM test double for reel caption generation (US-6.1).
 */
export function createStubReelCaptionLlmAdapter(
  providerKey: string,
  buildContent: StubLlmResponseBuilder = defaultStubReelCaptionJson,
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

export function defaultStubReelCaptionJson(input: LlmCompletionInput): string {
  const slotBrief = readJsonBlock(input.userPrompt, "UNTRUSTED_SLOT_BRIEF");
  const scriptPackage = readJsonBlock(
    input.userPrompt,
    "UNTRUSTED_SCRIPT_PACKAGE",
  );
  const profile = readJsonBlock(input.userPrompt, "UNTRUSTED_BUSINESS_PROFILE");

  const tema =
    typeof slotBrief?.tema === "string" && slotBrief.tema.length > 0
      ? slotBrief.tema
      : "Tema del Reel";

  const hook =
    typeof scriptPackage?.hook === "string" ? scriptPackage.hook : tema;
  const scriptCta =
    typeof scriptPackage?.cta === "string" ? scriptPackage.cta : undefined;
  const ctaHint =
    typeof slotBrief?.ctaHint === "string" ? slotBrief.ctaHint : undefined;

  let zoneLabel: string | null = null;
  const zone = profile?.zone;
  if (zone && typeof zone === "object" && zone !== null) {
    const description = (zone as Record<string, unknown>).description;
    if (typeof description === "string" && description.trim().length > 0) {
      zoneLabel = description.trim();
    }
  }

  const keywords: string[] = [];
  if (zoneLabel) {
    const primary = zoneLabel.split(/[,/]/)[0]?.trim();
    if (primary) {
      keywords.push(primary);
    }
    keywords.push("servicio local");
  }

  const output = {
    caption: `${hook}. ${tema}.`,
    hashtags: ["HVAC", "Mantenimiento", zoneLabel ? zoneLabel.replace(/\s+/g, "") : "Local"],
    keywords,
    ctaVariants: [
      ctaHint ?? scriptCta ?? "Agenda tu revisión hoy.",
      "Guarda este video y comparte con tu vecino.",
    ],
  };

  return JSON.stringify(output);
}
