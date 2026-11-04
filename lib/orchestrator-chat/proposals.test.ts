import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Static guard: proposal tool execute bodies must not call mutating Server Actions.
 * Mutation happens only from ProposalActionCard → existing actions on Approve.
 */
describe("orchestrator-chat no-mutation-without-confirm", () => {
  it("create-tools proposal executes do not call generate/approve/decide actions", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "create-tools.ts"), "utf8");

    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/content-strategy\/actions\/generate-content-strategy"/,
    );
    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/content-strategy\/actions\/approve-content-strategy"/,
    );
    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/approvals\/actions\/decide-approval"/,
    );
    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/reel-scripts\/actions\/generate-reel-scripts"/,
    );
    assert.doesNotMatch(source, /createBrollVideoJobs/);
    assert.doesNotMatch(source, /createHeygenTalkingHeadVideoJob/);
    assert.match(source, /estimateFacelessPipelineCost/);
    assert.match(source, /previewHeygenTalkingHeadEstimate/);
    assert.match(source, /assertProposalIsNonMutating/);
    assert.match(source, /mutates:\s*false\s*as\s*const/);
    assert.match(source, /requiresConfirmation:\s*true\s*as\s*const/);
    assert.match(source, /proposeGenerateScripts/);
    assert.match(source, /proposeGenerateVideos/);
    assert.match(source, /proposeRequestVideoChanges/);
    assert.match(source, /proposeRegenerateScript/);
    assert.match(source, /proposeConfirmPaidGeneration/);
    assert.match(source, /proposeConfirmTtsGeneration/);
    assert.match(source, /estimateTtsCostCentsFromTextLength/);
    assert.match(source, /getVideoPreview/);
    assert.match(source, /getScriptPreview/);
    assert.match(source, /getGuidedProgress/);
    assert.match(source, /getReadyVideoDownload/);
    assert.match(source, /getInterviewStatus/);
    assert.match(source, /proposeSaveInterviewAnswer/);
    assert.match(source, /proposeSubmitInterview/);
    assert.match(source, /proposeEnableOwnAvatar/);
    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/interview\/actions\/persist-interview-draft"/,
    );
    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/interview\/actions\/submit-interview"/,
    );
    assert.doesNotMatch(
      source,
      /from\s+"@\/lib\/visual-preferences\/upsert-visual-preferences"/,
    );
    assert.doesNotMatch(source, /createHeygenTalkingHeadVideoJob/);
    assert.doesNotMatch(source, /publishToInstagram|graph\.facebook|instagram\.com\/p\//i);
  });

  it("ProposalActionCard is the mutation boundary for Approve", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const card = readFileSync(
      join(
        here,
        "../../components/orchestrator-chat/ProposalActionCard.tsx",
      ),
      "utf8",
    );
    assert.match(card, /generateContentStrategy/);
    assert.match(card, /approveContentStrategy/);
    assert.match(card, /decideApproval/);
    assert.match(card, /generateReelScripts/);
    assert.match(card, /regenerateReelScriptSlot/);
    assert.match(card, /request_changes/);
    assert.match(card, /confirmPaidGenerationFromChat/);
    assert.match(card, /confirmTtsGenerationFromChat/);
    assert.match(card, /grantAvatarConsent/);
    assert.match(card, /upsertAvatar/);
    assert.match(card, /persistInterviewDraft/);
    assert.match(card, /submitInterview/);
    assert.match(card, /upsertVisualPreferences/);
    assert.doesNotMatch(card, /createHeygenTalkingHeadVideoJob/);
    assert.doesNotMatch(card, /createBrollVideoJobs/);
  });

  it("TTS confirm action re-checks estimate and never starts video jobs", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const action = readFileSync(
      join(here, "actions/confirm-tts-generation.ts"),
      "utf8",
    );
    assert.match(action, /estimateTtsCostCentsFromTextLength/);
    assert.match(action, /confirmEstimateCents/);
    assert.match(action, /ESTIMATE_MISMATCH/);
    assert.match(action, /synthesizeVoiceoverForReelScript/);
    assert.doesNotMatch(action, /createBrollVideoJobs/);
    assert.doesNotMatch(action, /createHeygenTalkingHeadVideoJob/);
  });

  it("enable_own_avatar proposal never triggers avatar video generation", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "create-tools.ts"), "utf8");
    const enableBlock = source.slice(
      source.indexOf("proposeEnableOwnAvatar:"),
      source.indexOf("getReadyVideoDownload:"),
    );
    assert.match(enableBlock, /action:\s*"upsertVisualPreferences"/);
    assert.match(enableBlock, /redirectedToConsent:\s*true/);
    assert.match(enableBlock, /grant_presenter_consent/);
    assert.doesNotMatch(enableBlock, /createHeygenTalkingHeadVideoJob/);
    assert.doesNotMatch(enableBlock, /createBrollVideoJobs/);
    assert.doesNotMatch(enableBlock, /upsertAvatar\(/);
  });

  it("system prompt requires Spanish own-avatar and voice-cost tool cards", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const prompt = readFileSync(join(here, "system-prompt.ts"), "utf8");
    assert.match(prompt, /Quiero usar mi propio avatar/);
    assert.match(prompt, /quiero salir yo en los videos/);
    assert.match(prompt, /activa videos con mi cara/);
    assert.match(prompt, /proposeEnableOwnAvatar/);
    assert.match(prompt, /¿Cuánto cuesta la voz para mi video\?/);
    assert.match(prompt, /proposeConfirmTtsGeneration/);
    assert.match(prompt, /confirm_tts_generation/);
  });

  it("TTS confirm tool defaults to latest eligible and exposes picker list", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "create-tools.ts"), "utf8");
    const ttsBlock = source.slice(
      source.indexOf("proposeConfirmTtsGeneration:"),
      source.indexOf("getGuidedProgress:"),
    );
    assert.match(ttsBlock, /eligibleVideos/);
    assert.match(ttsBlock, /latest/);
    assert.match(ttsBlock, /¿Cuánto cuesta la voz para mi video\?/);
  });

  it("mobile chat FAB is removed in favor of layout composer (KAN-104/105)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const panel = readFileSync(
      join(
        here,
        "../../components/orchestrator-chat/OrchestratorChatPanel.tsx",
      ),
      "utf8",
    );
    const shell = readFileSync(
      join(here, "../../components/layout/AppShell.tsx"),
      "utf8",
    );
    const header = readFileSync(
      join(here, "../../components/layout/AppHeader.tsx"),
      "utf8",
    );
    assert.doesNotMatch(panel, /OrchestratorChatFab/);
    assert.doesNotMatch(shell, /OrchestratorChatFab/);
    assert.doesNotMatch(header, /OrchestratorChatFab/);
    assert.match(shell, /OwnerComposer/);
    assert.match(header, /conversationLabel|\/conversation/);
  });

  it("Change prefill hides card UUID from owner-visible text", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const ctx = readFileSync(
      join(
        here,
        "../../components/orchestrator-chat/OrchestratorChatContext.tsx",
      ),
      "utf8",
    );
    const route = readFileSync(
      join(here, "../../app/api/chat/route.ts"),
      "utf8",
    );
    assert.match(ctx, /formatChangePrefill/);
    assert.doesNotMatch(ctx, /\(card:\$\{/);
    assert.match(route, /extractLatestCardAnchorId/);
    assert.match(route, /CARD ANCHOR/);
  });

  it("paid generation only runs from confirm action after Approve", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const action = readFileSync(
      join(here, "actions/confirm-paid-generation.ts"),
      "utf8",
    );
    assert.match(action, /estimateFacelessPipelineCost/);
    assert.match(action, /synthesizeVoiceoverForReelScript/);
    assert.match(action, /previewHeygenTalkingHeadEstimate/);
    assert.match(action, /confirmEstimateCents/);
    assert.match(action, /ESTIMATE_MISMATCH/);
    assert.match(action, /createBrollVideoJobs/);
    assert.match(action, /createHeygenTalkingHeadVideoJob/);
  });

  it("chat route disables reasoning stream to the client", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const route = readFileSync(
      join(here, "../../app/api/chat/route.ts"),
      "utf8",
    );
    assert.match(route, /sendReasoning:\s*false/);
    assert.match(route, /resolveChatBodyLocale/);
  });

  it("chat route persists conversation messages on finish (KAN-95)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const route = readFileSync(
      join(here, "../../app/api/chat/route.ts"),
      "utf8",
    );
    assert.match(route, /originalMessages:\s*messages/);
    assert.match(route, /onFinish:/);
    assert.match(route, /persistConversationMessages/);
    assert.match(route, /generateMessageId/);
  });
});
