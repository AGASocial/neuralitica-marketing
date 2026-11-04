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
    assert.match(source, /assertProposalIsNonMutating/);
    assert.match(source, /mutates:\s*false\s*as\s*const/);
    assert.match(source, /requiresConfirmation:\s*true\s*as\s*const/);
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
  });
});
