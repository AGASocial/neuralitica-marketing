/**
 * KAN-97 — orchestrator model eval harness (plain Node, no path aliases).
 * Offline by default. Optional live Gateway when ORCHESTRATOR_EVAL_LIVE=1.
 *
 *   node scripts/orchestrator-model-eval.mjs
 *   ORCHESTRATOR_EVAL_LIVE=1 node scripts/orchestrator-model-eval.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MODEL = "google/gemini-2.5-flash";

const KNOWN_TOOL_NAMES = [
  "listCampaignStatus",
  "getWeeklyStrategy",
  "getScriptsStatus",
  "getVideoPreview",
  "getScriptPreview",
  "getGuidedProgress",
  "getReadyVideoDownload",
  "proposeGenerateStrategy",
  "proposeApproveStrategy",
  "proposeApprovePendingVideo",
  "proposeGenerateScripts",
  "proposeGenerateVideos",
  "proposeRequestVideoChanges",
  "proposeRegenerateScript",
  "proposeConfirmPaidGeneration",
  "proposeConfirmTtsGeneration",
  "proposeEnableOwnAvatar",
  "proposeGrantPresenterConsent",
  "getPresenterSetupStatus",
];

const TOOL_NAME_PATTERN = new RegExp(
  `\\b(?:${KNOWN_TOOL_NAMES.join("|")})\\b`,
  "g",
);

const INTERNAL_MONOLOGUE_LINE =
  /^(?:let'?s\s+re-read|let me (?:think|check|re-read|look)|i (?:need to|should|will) (?:call|use|invoke|check)|first,? i(?:'| a)m going to|looking at (?:the )?(?:prompt|tools?)|the (?:user|prompt) (?:says|asks)|tool(?:s)? (?:to use|available)|internal (?:reasoning|monologue)|chain[- ]of[- ]thought)\b/i;

function containsToolName(text) {
  TOOL_NAME_PATTERN.lastIndex = 0;
  return TOOL_NAME_PATTERN.test(text);
}

function sanitize(raw) {
  if (!raw) return "";
  const paragraphs = raw.split(/\n{2,}/);
  const kept = [];
  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (INTERNAL_MONOLOGUE_LINE.test(trimmed)) return false;
      if (containsToolName(trimmed)) return false;
      return true;
    });
    const cleaned = lines.join("\n").trim();
    if (cleaned) kept.push(cleaned);
  }
  if (kept.length === 0) {
    return raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(
        (s) => s && !INTERNAL_MONOLOGUE_LINE.test(s) && !containsToolName(s),
      )
      .join(" ")
      .trim();
  }
  return kept.join("\n\n").trim();
}

function assertDefaultInSource() {
  const src = readFileSync(
    join(ROOT, "lib/contracts/orchestrator-chat.ts"),
    "utf8",
  );
  if (!src.includes(`"${DEFAULT_MODEL}"`)) {
    throw new Error(`Default model constant missing ${DEFAULT_MODEL}`);
  }
  if (/ORCHESTRATOR_CHAT_DEFAULT_MODEL\s*=\s*"google\/gemini-2\.5-flash-lite"/.test(src)) {
    throw new Error("Default must not be flash-lite");
  }
}

const FIXTURES = [
  {
    id: "clean-es",
    raw: "Listo — preparé el plan de esta semana. ¿Lo aprobamos?",
  },
  {
    id: "flash-lite-smoke-leak",
    raw: [
      "Let's re-read the prompt and decide which tools to use.",
      "I should call getScriptsStatus and then proposeApprovePendingVideo.",
      "",
      "¿Quieres que revise cómo van tus videos esta semana?",
    ].join("\n"),
  },
  {
    id: "tool-name-inline",
    raw: "I'll use proposeGenerateVideos now. ¿Generamos tus videos?",
  },
  {
    id: "es-own-avatar-tool-leak",
    raw: [
      "I should call proposeEnableOwnAvatar for “Quiero usar mi propio avatar”.",
      "",
      "Te muestro la tarjeta para activar videos con tu cara.",
    ].join("\n"),
  },
  {
    id: "es-voice-cost-tool-leak",
    raw: [
      "First, I'm going to call proposeConfirmTtsGeneration for “¿Cuánto cuesta la voz para mi video?”.",
      "",
      "Aquí tienes el costo de la voz — aprueba si quieres continuar.",
    ].join("\n"),
  },
];

/** Offline card-discipline cases: Spanish owner prompts must map to these tools. */
const CARD_ROUTING_CASES = [
  {
    id: "es-own-avatar-mi-propio-avatar",
    prompt: "Quiero usar mi propio avatar",
    requiredTool: "proposeEnableOwnAvatar",
    requiredLiterals: [
      "Quiero usar mi propio avatar",
      "quiero salir yo en los videos",
      "activa videos con mi cara",
    ],
  },
  {
    id: "es-own-avatar-salir-yo",
    prompt: "quiero salir yo en los videos",
    requiredTool: "proposeEnableOwnAvatar",
    requiredLiterals: ["proposeEnableOwnAvatar"],
  },
  {
    id: "es-own-avatar-con-mi-cara",
    prompt: "activa videos con mi cara",
    requiredTool: "proposeEnableOwnAvatar",
    requiredLiterals: ["proposeEnableOwnAvatar"],
  },
  {
    id: "es-voice-cost",
    prompt: "¿Cuánto cuesta la voz para mi video?",
    requiredTool: "proposeConfirmTtsGeneration",
    requiredLiterals: [
      "¿Cuánto cuesta la voz para mi video?",
      "confirm_tts_generation",
    ],
  },
];

function assertCardRoutingInPromptSource() {
  const systemPrompt = readFileSync(
    join(ROOT, "lib/orchestrator-chat/system-prompt.ts"),
    "utf8",
  );
  const createTools = readFileSync(
    join(ROOT, "lib/orchestrator-chat/create-tools.ts"),
    "utf8",
  );
  let failures = 0;
  for (const testCase of CARD_ROUTING_CASES) {
    const inSystem = systemPrompt.includes(testCase.requiredTool);
    const inTools = createTools.includes(testCase.requiredTool);
    const literalsOk = testCase.requiredLiterals.every(
      (literal) =>
        systemPrompt.includes(literal) || createTools.includes(literal),
    );
    const ok = inSystem && inTools && literalsOk;
    console.log(
      `- ${testCase.id}: prompt="${testCase.prompt}" → ${testCase.requiredTool} ok=${ok}`,
    );
    if (!ok) failures += 1;
  }
  // Consent redirect + TTS picker guards (no paid calls).
  if (!createTools.includes("redirectedToConsent")) {
    console.log("- consent-redirect: MISSING redirectedToConsent");
    failures += 1;
  } else {
    console.log("- consent-redirect: redirectedToConsent present");
  }
  if (!createTools.includes("eligibleVideos")) {
    console.log("- tts-picker: MISSING eligibleVideos");
    failures += 1;
  } else {
    console.log("- tts-picker: eligibleVideos present");
  }
  return failures;
}

function runOffline() {
  console.log("=== KAN-97 offline fixture leak scoring ===");
  console.log(`Expected default: ${DEFAULT_MODEL}`);
  assertDefaultInSource();
  console.log("PASS: contract default is gemini-2.5-flash (not flash-lite)");

  let failures = 0;
  for (const fixture of FIXTURES) {
    const cleaned = sanitize(fixture.raw);
    const leakInRaw =
      containsToolName(fixture.raw) ||
      /let'?s\s+re-read|i should call/i.test(fixture.raw);
    const cleanedOk =
      !containsToolName(cleaned) &&
      !/let'?s\s+re-read|i should call/i.test(cleaned);
    const stripRatio =
      fixture.raw.length === 0
        ? 0
        : 1 - cleaned.length / Math.max(fixture.raw.length, 1);
    console.log(
      `- ${fixture.id}: leakInRaw=${leakInRaw} stripRatio=${stripRatio.toFixed(2)} cleanedOk=${cleanedOk}`,
    );
    if (!cleanedOk) failures += 1;
  }

  console.log("=== KAN-97 offline Spanish card-routing cases ===");
  failures += assertCardRoutingInPromptSource();
  return failures;
}

async function runLive() {
  console.log("=== KAN-97 live Gateway compare (LLM only) ===");
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.log("SKIP live: AI_GATEWAY_API_KEY not set");
    return 0;
  }

  const { createGateway, generateText } = await import("ai");
  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY.trim(),
  });
  const prompt = [
    "You are a campaign assistant. Reply ONLY with the final Spanish message.",
    "Never name tools. Never write English planning.",
    "User: ¿Cómo va mi campaña?",
  ].join("\n");

  const candidates = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
  ];

  let failures = 0;
  for (const modelId of candidates) {
    try {
      const result = await generateText({
        model: gateway(modelId),
        prompt,
        maxOutputTokens: 200,
      });
      const text = result.text ?? "";
      const cleaned = sanitize(text);
      const stripRatio =
        text.length === 0 ? 0 : 1 - cleaned.length / Math.max(text.length, 1);
      const leak = containsToolName(text) || stripRatio > 0.15;
      console.log(
        `- ${modelId}: chars=${text.length} stripRatio=${stripRatio.toFixed(2)} leak=${leak}`,
      );
      if (modelId === DEFAULT_MODEL && leak) failures += 1;
    } catch (error) {
      console.log(
        `- ${modelId}: ERROR ${error instanceof Error ? error.message : "unknown"}`,
      );
      if (modelId === DEFAULT_MODEL) failures += 1;
    }
  }
  return failures;
}

const failuresOffline = runOffline();
let failuresLive = 0;
if (process.env.ORCHESTRATOR_EVAL_LIVE === "1") {
  failuresLive = await runLive();
} else {
  console.log("Live compare skipped (set ORCHESTRATOR_EVAL_LIVE=1 to enable).");
}

const failures = failuresOffline + failuresLive;
console.log(
  failures === 0
    ? "RESULT: keep default google/gemini-2.5-flash"
    : `RESULT: ${failures} issue(s) — review before changing default`,
);
process.exit(failures === 0 ? 0 : 1);
