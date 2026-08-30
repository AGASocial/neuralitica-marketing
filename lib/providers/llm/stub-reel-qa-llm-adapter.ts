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
 * Deterministic LLM test double for reel QA compliance (US-10.1).
 */
export function createStubReelQaLlmAdapter(
  providerKey: string,
  buildContent: StubLlmResponseBuilder = defaultStubReelQaJson,
): LlmProviderAdapter {
  return createStubLlmAdapter(providerKey, buildContent);
}

function readBlock(prompt: string, tag: string): string | null {
  const match = prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1]?.trim() ?? null;
}

function readJsonBlock(
  prompt: string,
  tag: string,
): Record<string, unknown> | null {
  const raw = readBlock(prompt, tag);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function requestedKeysFromSystem(systemPrompt: string): string[] {
  const match =
    systemPrompt.match(/Evaluate ONLY these checkKeys:\n([^\n]+)/) ??
    systemPrompt.match(/Allowed checkKey values:\s*([^\n]+)/);
  if (!match?.[1]) {
    return ["dangerous_claims", "tone", "clarity", "ai_disclosure"];
  }
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 0);
}

/**
 * Default stub: pass all requested checks unless fixtures trip fail heuristics.
 */
export function defaultStubReelQaJson(input: LlmCompletionInput): string {
  const keys = requestedKeysFromSystem(input.systemPrompt);
  const script = readJsonBlock(input.userPrompt, "UNTRUSTED_SCRIPT_PACKAGE");
  const captionRaw = readBlock(input.userPrompt, "UNTRUSTED_CAPTION") ?? "";
  const onScreen =
    readBlock(input.userPrompt, "UNTRUSTED_ON_SCREEN_TEXT") ?? "";

  let captionText = captionRaw;
  try {
    const parsed = JSON.parse(captionRaw) as { caption?: string };
    if (typeof parsed.caption === "string") {
      captionText = parsed.caption;
    }
  } catch {
    // plain caption text
  }

  const body =
    typeof script?.body === "string"
      ? script.body
      : typeof script?.hook === "string"
        ? script.hook
        : "";
  const haystack = `${body}\n${captionText}\n${onScreen}`.toLowerCase();

  const checks = keys.map((checkKey) => {
    if (checkKey === "dangerous_claims") {
      const fail =
        haystack.includes("guaranteed cure") ||
        haystack.includes("cura garantizada") ||
        haystack.includes("100% risk-free money");
      return fail
        ? {
            checkKey,
            status: "fail" as const,
            evidence: {
              messageKey: "qa.checks.dangerousClaims.fail",
              detail: "Unverifiable guarantee detected in fixture.",
            },
          }
        : { checkKey, status: "pass" as const };
    }

    if (checkKey === "tone") {
      const fail =
        haystack.includes("idiots") || haystack.includes("estúpidos");
      return fail
        ? {
            checkKey,
            status: "fail" as const,
            evidence: {
              messageKey: "qa.checks.tone.fail",
              detail: "Hostile tone toward clients.",
            },
          }
        : { checkKey, status: "pass" as const };
    }

    if (checkKey === "clarity") {
      const fail =
        haystack.includes("asdfasdf") || haystack.includes("???!!!");
      return fail
        ? {
            checkKey,
            status: "fail" as const,
            evidence: {
              messageKey: "qa.checks.clarity.fail",
              detail: "Incoherent hook/body.",
            },
          }
        : { checkKey, status: "pass" as const };
    }

    if (checkKey === "ai_disclosure") {
      const hasDisclosure =
        haystack.includes("not the business owner") ||
        haystack.includes("ai presenter") ||
        haystack.includes("no es el dueño") ||
        haystack.includes("presentador de ia") ||
        haystack.includes("voz generada");
      const mustDisclose =
        /Trusted mustDiscloseNotOwner:\s*true/.test(input.systemPrompt) ||
        /Trusted usesSyntheticVoice:\s*true/.test(input.systemPrompt) ||
        /Trusted modalidad:\s*generic_avatar/.test(input.systemPrompt);

      if (mustDisclose && !hasDisclosure) {
        return {
          checkKey,
          status: "fail" as const,
          evidence: {
            messageKey: "qa.checks.aiDisclosure.fail",
            detail: "Missing AI / not-owner disclosure.",
          },
        };
      }
      return { checkKey, status: "pass" as const };
    }

    return { checkKey, status: "pass" as const };
  });

  return JSON.stringify({ checks });
}

export function stubReelQaAllPassWithBogusSeverity(
  _input: LlmCompletionInput,
): string {
  return JSON.stringify({
    checks: [
      {
        checkKey: "dangerous_claims",
        status: "pass",
        severity: "blocking",
      },
      { checkKey: "tone", status: "pass", severity: "blocking" },
      { checkKey: "clarity", status: "pass", severity: "blocking" },
      {
        checkKey: "ai_disclosure",
        status: "pass",
        severity: "blocking",
      },
    ],
  });
}

export function stubReelQaWithUnknownKey(
  _input: LlmCompletionInput,
): string {
  return JSON.stringify({
    checks: [
      { checkKey: "dangerous_claims", status: "pass" },
      { checkKey: "tone", status: "pass" },
      { checkKey: "clarity", status: "pass" },
      { checkKey: "ai_disclosure", status: "pass" },
      { checkKey: "invented_legal_bypass", status: "pass" },
    ],
  });
}
