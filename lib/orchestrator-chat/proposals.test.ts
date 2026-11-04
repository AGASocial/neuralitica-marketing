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
    assert.match(source, /previewBrollVideoJobsEstimate/);
    assert.match(source, /previewHeygenTalkingHeadEstimate/);
    assert.match(source, /assertProposalIsNonMutating/);
    assert.match(source, /mutates:\s*false\s*as\s*const/);
    assert.match(source, /requiresConfirmation:\s*true\s*as\s*const/);
    assert.match(source, /proposeGenerateScripts/);
    assert.match(source, /proposeGenerateVideos/);
    assert.match(source, /proposeRequestVideoChanges/);
    assert.match(source, /proposeRegenerateScript/);
    assert.match(source, /proposeConfirmPaidGeneration/);
    assert.match(source, /getVideoPreview/);
    assert.match(source, /getScriptPreview/);
    assert.match(source, /getGuidedProgress/);
    assert.match(source, /getReadyVideoDownload/);
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
    assert.match(card, /grantAvatarConsent/);
    assert.match(card, /upsertAvatar/);
  });

  it("paid generation only runs from confirm action after Approve", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const action = readFileSync(
      join(here, "actions/confirm-paid-generation.ts"),
      "utf8",
    );
    assert.match(action, /previewBrollVideoJobsEstimate/);
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
});
