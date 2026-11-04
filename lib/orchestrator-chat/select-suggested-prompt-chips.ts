/**
 * Pure selection of empty-state / follow-up suggested prompt chips.
 * Never includes spend-triggering prompts (paid work stays behind cost cards).
 */

export const SUGGESTED_PROMPT_CHIP_IDS = [
  "whatCanYouDo",
  "finishSetup",
  "showPendingApprovals",
  "makeWeeklyPlan",
  "howIsCampaign",
  "writeScripts",
] as const;

export type SuggestedPromptChipId = (typeof SUGGESTED_PROMPT_CHIP_IDS)[number];

export type SuggestedPromptLabels = Record<SuggestedPromptChipId, string>;

export type SuggestedPromptSignals = {
  percentComplete: number;
  pendingApprovalsCount: number;
  hasApprovedPlan: boolean;
  scriptsMissing: boolean;
};

export type SuggestedPromptChip = {
  id: SuggestedPromptChipId;
  text: string;
};

const MAX_STATE_CHIPS = 5;

/**
 * Fixed capability question first, then up to 5 state chips in priority order.
 */
export function selectSuggestedPromptChips(
  signals: SuggestedPromptSignals,
  labels: SuggestedPromptLabels,
  options?: { includeWhatCanYouDo?: boolean },
): SuggestedPromptChip[] {
  const includeWhatCanYouDo = options?.includeWhatCanYouDo !== false;
  const chips: SuggestedPromptChip[] = [];

  if (includeWhatCanYouDo) {
    chips.push({ id: "whatCanYouDo", text: labels.whatCanYouDo });
  }

  const state: SuggestedPromptChip[] = [];

  if (signals.percentComplete < 100) {
    state.push({ id: "finishSetup", text: labels.finishSetup });
  }
  if (signals.pendingApprovalsCount > 0) {
    state.push({
      id: "showPendingApprovals",
      text: labels.showPendingApprovals,
    });
  }
  if (!signals.hasApprovedPlan) {
    state.push({ id: "makeWeeklyPlan", text: labels.makeWeeklyPlan });
  } else {
    state.push({ id: "howIsCampaign", text: labels.howIsCampaign });
  }
  if (signals.hasApprovedPlan && signals.scriptsMissing) {
    state.push({ id: "writeScripts", text: labels.writeScripts });
  }

  chips.push(...state.slice(0, MAX_STATE_CHIPS));
  return chips;
}

export function conversationHasUserMessages(
  messages: ReadonlyArray<{ role: string }>,
): boolean {
  return messages.some((message) => message.role === "user");
}
