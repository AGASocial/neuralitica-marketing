/**
 * Strip model chain-of-thought / tool-name leaks from owner-visible assistant text.
 * Used server-side (stream transform + unit tests) and client-side as defense in depth.
 */

const KNOWN_TOOL_NAMES = [
  "listCampaignStatus",
  "getWeeklyStrategy",
  "getScriptsStatus",
  "getVideoPreview",
  "getScriptPreview",
  "proposeGenerateStrategy",
  "proposeApproveStrategy",
  "proposeApprovePendingVideo",
  "proposeGenerateScripts",
  "proposeGenerateVideos",
  "proposeRequestVideoChanges",
  "proposeRegenerateScript",
  "proposeConfirmPaidGeneration",
  "getGuidedProgress",
  "getReadyVideoDownload",
  "getPresenterSetupStatus",
  "proposeGrantPresenterConsent",
  "proposeSetPresenterVoice",
] as const;

const TOOL_NAME_PATTERN = new RegExp(
  `\\b(?:${KNOWN_TOOL_NAMES.join("|")})\\b`,
  "g",
);

const INTERNAL_MONOLOGUE_LINE =
  /^(?:let'?s\s+re-read|let me (?:think|check|re-read|look)|i (?:need to|should|will) (?:call|use|invoke|check)|first,? i(?:'| a)m going to|looking at (?:the )?(?:prompt|tools?)|the (?:user|prompt) (?:says|asks)|tool(?:s)? (?:to use|available)|internal (?:reasoning|monologue)|chain[- ]of[- ]thought)\b/i;

export function containsOrchestratorToolName(text: string): boolean {
  TOOL_NAME_PATTERN.lastIndex = 0;
  return TOOL_NAME_PATTERN.test(text);
}

/**
 * Returns owner-safe assistant text: drops internal-monologue lines and any
 * line that names orchestration tools. If everything is stripped, returns "".
 */
export function sanitizeOrchestratorVisibleText(raw: string): string {
  if (!raw) {
    return "";
  }

  const paragraphs = raw.split(/\n{2,}/);
  const keptParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n");
    const keptLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (INTERNAL_MONOLOGUE_LINE.test(trimmed)) {
        return false;
      }
      if (containsOrchestratorToolName(trimmed)) {
        return false;
      }
      return true;
    });

    const cleaned = keptLines.join("\n").trim();
    if (cleaned.length > 0) {
      keptParagraphs.push(cleaned);
    }
  }

  // If the model put the real answer after a long English monologue in one
  // paragraph, keep the last sentence block that has no tool names.
  if (keptParagraphs.length === 0) {
    const sentences = raw
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const safe = sentences.filter(
      (s) =>
        !INTERNAL_MONOLOGUE_LINE.test(s) && !containsOrchestratorToolName(s),
    );
    return safe.join(" ").trim();
  }

  return keptParagraphs.join("\n\n").trim();
}
